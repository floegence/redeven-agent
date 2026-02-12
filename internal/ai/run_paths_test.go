package ai

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveToolPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	target := filepath.Join(root, "sub", "dir")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatalf("mkdir target: %v", err)
	}

	t.Run("accepts absolute path", func(t *testing.T) {
		t.Parallel()
		resolved, err := resolveToolPath(target, root)
		if err != nil {
			t.Fatalf("resolveToolPath: %v", err)
		}
		if filepath.Clean(resolved) != filepath.Clean(target) {
			t.Fatalf("resolved=%q, want=%q", resolved, target)
		}
	})

	t.Run("resolves relative path against working_dir_abs", func(t *testing.T) {
		t.Parallel()
		resolved, err := resolveToolPath("sub/dir", root)
		if err != nil {
			t.Fatalf("resolveToolPath: %v", err)
		}
		want := filepath.Join(root, "sub", "dir")
		if filepath.Clean(resolved) != filepath.Clean(want) {
			t.Fatalf("resolved=%q, want=%q", resolved, want)
		}
	})

	t.Run("expands tilde to home directory", func(t *testing.T) {
		t.Parallel()
		home, err := os.UserHomeDir()
		if err != nil {
			t.Fatalf("UserHomeDir: %v", err)
		}
		resolved, err := resolveToolPath("~/", root)
		if err != nil {
			t.Fatalf("resolveToolPath: %v", err)
		}
		if filepath.Clean(resolved) != filepath.Clean(home) {
			t.Fatalf("resolved=%q, want home=%q", resolved, home)
		}
	})
}

func TestToolFSListDir_ReturnsAbsoluteEntryPaths(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	docsDir := filepath.Join(root, "docs")
	if err := os.MkdirAll(docsDir, 0o755); err != nil {
		t.Fatalf("mkdir docs: %v", err)
	}

	r := &run{fsRoot: root}
	out, err := r.toolFSListDir(root)
	if err != nil {
		t.Fatalf("toolFSListDir: %v", err)
	}
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("unexpected result type: %T", out)
	}
	entriesAny := []map[string]any{}
	if typed, ok := m["entries"].([]map[string]any); ok {
		entriesAny = typed
	} else if typed, ok := m["entries"].([]any); ok {
		for _, item := range typed {
			entry, _ := item.(map[string]any)
			if entry != nil {
				entriesAny = append(entriesAny, entry)
			}
		}
	}
	if len(entriesAny) == 0 {
		t.Fatalf("expected at least one entry")
	}

	foundDocs := false
	for _, entry := range entriesAny {
		if strings.TrimSpace(anyToString(entry["name"])) != "docs" {
			continue
		}
		gotPath := filepath.Clean(anyToString(entry["path"]))
		if gotPath != filepath.Clean(docsDir) {
			t.Fatalf("entry path=%q, want=%q", gotPath, docsDir)
		}
		foundDocs = true
		break
	}
	if !foundDocs {
		t.Fatalf("missing docs entry in list result")
	}
}

func TestToolTerminalExec_CwdRules(t *testing.T) {
	t.Parallel()

	workingDir := t.TempDir()
	r := &run{fsRoot: workingDir, shell: "bash"}

	t.Run("empty cwd falls back to working_dir_abs", func(t *testing.T) {
		t.Parallel()
		out, err := r.toolTerminalExec(context.Background(), "pwd", "", 5000)
		if err != nil {
			t.Fatalf("toolTerminalExec: %v", err)
		}
		m, ok := out.(map[string]any)
		if !ok {
			t.Fatalf("unexpected result type: %T", out)
		}
		stdout := strings.TrimSpace(anyToString(m["stdout"]))
		if filepath.Clean(stdout) != filepath.Clean(workingDir) {
			t.Fatalf("stdout=%q, want cwd=%q", stdout, workingDir)
		}
	})

	t.Run("relative cwd resolves against working_dir_abs", func(t *testing.T) {
		t.Parallel()
		subdir := filepath.Join(workingDir, "subdir")
		if err := os.MkdirAll(subdir, 0o755); err != nil {
			t.Fatalf("mkdir subdir: %v", err)
		}
		out, err := r.toolTerminalExec(context.Background(), "pwd", "subdir", 5000)
		if err != nil {
			t.Fatalf("toolTerminalExec: %v", err)
		}
		m, ok := out.(map[string]any)
		if !ok {
			t.Fatalf("unexpected result type: %T", out)
		}
		stdout := strings.TrimSpace(anyToString(m["stdout"]))
		if filepath.Clean(stdout) != filepath.Clean(subdir) {
			t.Fatalf("stdout=%q, want cwd=%q", stdout, subdir)
		}
	})
}
