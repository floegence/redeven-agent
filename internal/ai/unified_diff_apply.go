package ai

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type unifiedDiffHunk struct {
	oldStart int
	oldCount int
	newStart int
	newCount int
	lines    []string
}

type unifiedDiffFile struct {
	oldPath string // "/dev/null" or path without a/ prefix
	newPath string // "/dev/null" or path without b/ prefix

	isNew    bool
	isDelete bool

	newPerm *fs.FileMode

	hunks []unifiedDiffHunk
}

var unifiedDiffHunkHeaderRE = regexp.MustCompile(`^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@`)

func parseUnifiedDiff(patchText string) ([]unifiedDiffFile, error) {
	raw := strings.ReplaceAll(patchText, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	lines := strings.Split(raw, "\n")

	var out []unifiedDiffFile
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if !strings.HasPrefix(line, "diff --git ") {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 4 {
			return nil, fmt.Errorf("invalid diff header: %q", line)
		}
		fd := unifiedDiffFile{
			oldPath: trimDiffPath(parts[2]),
			newPath: trimDiffPath(parts[3]),
		}

		i++
		for i < len(lines) {
			l := lines[i]
			if strings.HasPrefix(l, "diff --git ") || strings.HasPrefix(l, "@@") {
				break
			}
			switch {
			case strings.HasPrefix(l, "new file mode "):
				fd.isNew = true
				if perm, ok := parseGitFileMode(strings.TrimSpace(strings.TrimPrefix(l, "new file mode "))); ok {
					fd.newPerm = &perm
				}
			case strings.HasPrefix(l, "deleted file mode "):
				fd.isDelete = true
			case strings.HasPrefix(l, "--- "):
				fd.oldPath = parseDiffPath(strings.TrimSpace(strings.TrimPrefix(l, "--- ")))
			case strings.HasPrefix(l, "+++ "):
				fd.newPath = parseDiffPath(strings.TrimSpace(strings.TrimPrefix(l, "+++ ")))
			}
			i++
		}

		for i < len(lines) {
			l := lines[i]
			if strings.HasPrefix(l, "diff --git ") {
				i--
				break
			}
			if !strings.HasPrefix(l, "@@") {
				i++
				continue
			}
			h, err := parseUnifiedDiffHunkHeader(l)
			if err != nil {
				return nil, err
			}
			i++
			for i < len(lines) {
				l2 := lines[i]
				if strings.HasPrefix(l2, "diff --git ") || strings.HasPrefix(l2, "@@") {
					i--
					break
				}
				h.lines = append(h.lines, l2)
				i++
			}
			fd.hunks = append(fd.hunks, h)
			i++
		}

		if strings.TrimSpace(fd.oldPath) == "" || strings.TrimSpace(fd.newPath) == "" {
			return nil, fmt.Errorf("missing file paths in diff header: %q", line)
		}
		out = append(out, fd)
	}
	if len(out) == 0 {
		return nil, errors.New("unsupported patch format: missing diff --git headers")
	}
	return out, nil
}

func trimDiffPath(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "a/")
	raw = strings.TrimPrefix(raw, "b/")
	return raw
}

func parseDiffPath(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	fields := strings.Fields(raw)
	if len(fields) > 0 {
		raw = fields[0]
	}
	return trimDiffPath(raw)
}

func parseGitFileMode(raw string) (fs.FileMode, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, false
	}
	if strings.HasPrefix(raw, "120") {
		// Symlink: unsupported for now.
		return 0, false
	}
	permRaw := raw
	if len(raw) >= 3 {
		permRaw = raw[len(raw)-3:]
	}
	v, err := strconv.ParseInt(permRaw, 8, 32)
	if err != nil {
		return 0, false
	}
	return fs.FileMode(v) & 0o777, true
}

func parseUnifiedDiffHunkHeader(line string) (unifiedDiffHunk, error) {
	m := unifiedDiffHunkHeaderRE.FindStringSubmatch(line)
	if len(m) == 0 {
		return unifiedDiffHunk{}, fmt.Errorf("invalid hunk header: %q", line)
	}
	oldStart, _ := strconv.Atoi(m[1])
	oldCount := 1
	if strings.TrimSpace(m[2]) != "" {
		oldCount, _ = strconv.Atoi(m[2])
	}
	newStart, _ := strconv.Atoi(m[3])
	newCount := 1
	if strings.TrimSpace(m[4]) != "" {
		newCount, _ = strconv.Atoi(m[4])
	}
	return unifiedDiffHunk{
		oldStart: oldStart,
		oldCount: oldCount,
		newStart: newStart,
		newCount: newCount,
		lines:    nil,
	}, nil
}

type patchFilePlan struct {
	oldAbs   string
	newAbs   string
	delete   bool
	write    bool
	perm     fs.FileMode
	contents []byte
}

func applyUnifiedDiff(workingDirAbs string, patchText string) error {
	workingDirAbs = filepath.Clean(strings.TrimSpace(workingDirAbs))
	if workingDirAbs == "" || !filepath.IsAbs(workingDirAbs) {
		return errors.New("invalid working dir")
	}

	diffs, err := parseUnifiedDiff(patchText)
	if err != nil {
		return err
	}

	plans := make([]patchFilePlan, 0, len(diffs))
	for _, fd := range diffs {
		plan, err := buildPatchFilePlan(workingDirAbs, fd)
		if err != nil {
			return err
		}
		plans = append(plans, plan)
	}

	// Apply after full validation to avoid partially-applied patches on parse errors.
	for _, plan := range plans {
		if plan.delete {
			if err := os.Remove(plan.oldAbs); err != nil && !errors.Is(err, os.ErrNotExist) {
				return err
			}
			continue
		}
		if plan.write {
			if err := os.MkdirAll(filepath.Dir(plan.newAbs), 0o755); err != nil {
				return err
			}
			if err := atomicWriteFile(plan.newAbs, plan.contents, plan.perm); err != nil {
				return err
			}
			if plan.oldAbs != "" && plan.oldAbs != plan.newAbs {
				_ = os.Remove(plan.oldAbs)
			}
		}
	}
	return nil
}

func buildPatchFilePlan(workingDirAbs string, fd unifiedDiffFile) (patchFilePlan, error) {
	oldPath := strings.TrimSpace(fd.oldPath)
	newPath := strings.TrimSpace(fd.newPath)
	if oldPath == "" || newPath == "" {
		return patchFilePlan{}, errors.New("invalid diff paths")
	}

	oldAbs := diffPathToAbs(workingDirAbs, oldPath)
	newAbs := diffPathToAbs(workingDirAbs, newPath)

	if fd.isDelete || newPath == "/dev/null" {
		if oldPath == "/dev/null" {
			return patchFilePlan{}, errors.New("invalid delete diff: old path is /dev/null")
		}
		return patchFilePlan{oldAbs: oldAbs, delete: true}, nil
	}

	// Determine baseline file and permissions.
	baselineAbs := newAbs
	if oldPath != "/dev/null" {
		baselineAbs = oldAbs
	}

	perm := fs.FileMode(0o644)
	var fileBytes []byte
	if oldPath != "/dev/null" {
		b, err := os.ReadFile(baselineAbs)
		if err != nil {
			return patchFilePlan{}, err
		}
		fileBytes = b
		if st, err := os.Stat(baselineAbs); err == nil {
			perm = st.Mode() & 0o777
		}
	}
	if fd.isNew || oldPath == "/dev/null" {
		perm = 0o644
	}
	if fd.newPerm != nil {
		perm = *fd.newPerm & 0o777
	}

	next, err := applyUnifiedDiffHunksToBytes(fileBytes, fd.hunks)
	if err != nil {
		return patchFilePlan{}, err
	}
	return patchFilePlan{
		oldAbs:   oldAbs,
		newAbs:   newAbs,
		delete:   false,
		write:    true,
		perm:     perm,
		contents: next,
	}, nil
}

func diffPathToAbs(workingDirAbs string, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "/dev/null" {
		return ""
	}
	if filepath.IsAbs(raw) {
		return filepath.Clean(raw)
	}
	return filepath.Clean(filepath.Join(workingDirAbs, raw))
}

func applyUnifiedDiffHunksToBytes(original []byte, hunks []unifiedDiffHunk) ([]byte, error) {
	text := string(original)
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	hadTrailingNewline := strings.HasSuffix(text, "\n")
	if hadTrailingNewline {
		text = strings.TrimSuffix(text, "\n")
	}

	var lines []string
	if text != "" {
		lines = strings.Split(text, "\n")
	} else {
		lines = nil
	}

	offset := 0
	var err error
	for _, h := range hunks {
		preferred := h.oldStart - 1 + offset
		if preferred < 0 {
			preferred = 0
		}
		start, ok := findHunkStart(lines, h, preferred)
		if !ok {
			return nil, fmt.Errorf("hunk failed to apply near line %d", h.oldStart)
		}
		var delta int
		lines, delta, err = applyOneHunk(lines, h, start)
		if err != nil {
			return nil, err
		}
		offset += delta
	}

	out := strings.Join(lines, "\n")
	if hadTrailingNewline || len(lines) > 0 {
		out += "\n"
	}
	return []byte(out), nil
}

func findHunkStart(lines []string, h unifiedDiffHunk, preferred int) (int, bool) {
	from := make([]string, 0, len(h.lines))
	for _, l := range h.lines {
		if l == "" {
			continue
		}
		switch l[0] {
		case ' ', '-':
			from = append(from, l[1:])
		}
	}
	if len(from) == 0 {
		if preferred < 0 {
			return 0, true
		}
		if preferred > len(lines) {
			return len(lines), true
		}
		return preferred, true
	}

	tryAt := func(pos int) bool {
		if pos < 0 {
			return false
		}
		if pos+len(from) > len(lines) {
			return false
		}
		for i := 0; i < len(from); i++ {
			if lines[pos+i] != from[i] {
				return false
			}
		}
		return true
	}

	if tryAt(preferred) {
		return preferred, true
	}

	const window = 80
	start := preferred - window
	if start < 0 {
		start = 0
	}
	end := preferred + window
	if end > len(lines) {
		end = len(lines)
	}
	for pos := start; pos <= end; pos++ {
		if tryAt(pos) {
			return pos, true
		}
	}
	return 0, false
}

func applyOneHunk(lines []string, h unifiedDiffHunk, start int) ([]string, int, error) {
	cursor := start
	delta := 0
	for _, l := range h.lines {
		if l == "" {
			continue
		}
		prefix := l[0]
		text := ""
		if len(l) > 1 {
			text = l[1:]
		}
		switch prefix {
		case ' ':
			if cursor >= len(lines) || lines[cursor] != text {
				return nil, 0, fmt.Errorf("hunk context mismatch at line %d", cursor+1)
			}
			cursor++
		case '-':
			if cursor >= len(lines) || lines[cursor] != text {
				return nil, 0, fmt.Errorf("hunk delete mismatch at line %d", cursor+1)
			}
			lines = append(lines[:cursor], lines[cursor+1:]...)
			delta--
		case '+':
			lines = append(lines[:cursor], append([]string{text}, lines[cursor:]...)...)
			cursor++
			delta++
		case '\\':
			// "\ No newline at end of file"
			continue
		default:
			return nil, 0, fmt.Errorf("invalid hunk line: %q", l)
		}
	}
	return lines, delta, nil
}

func atomicWriteFile(path string, data []byte, perm fs.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".redeven-apply-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := func() {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}
	if _, err := tmp.Write(data); err != nil {
		cleanup()
		return err
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return err
	}
	_ = os.Chmod(tmpName, perm&0o777)
	if err := os.Rename(tmpName, path); err == nil {
		return nil
	}
	// Best-effort replace for platforms where Rename cannot overwrite.
	_ = os.Remove(path)
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}
