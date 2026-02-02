package codeserver

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ResolveBinary resolves an absolute path to the code-server binary.
//
// Resolution order:
// 1) Environment variables (highest precedence):
//   - REDEVEN_CODE_SERVER_BIN
//   - CODE_SERVER_BIN
//   - CODE_SERVER_PATH
//
// 2) Well-known install locations by OS
// 3) exec.LookPath("code-server") (PATH)
func ResolveBinary() (string, error) {
	candidates := make([]string, 0, 8)

	for _, env := range []string{"REDEVEN_CODE_SERVER_BIN", "CODE_SERVER_BIN", "CODE_SERVER_PATH"} {
		if v := strings.TrimSpace(os.Getenv(env)); v != "" {
			candidates = append(candidates, v)
		}
	}

	home, _ := os.UserHomeDir()
	if strings.TrimSpace(home) != "" {
		candidates = append(candidates, filepath.Join(home, ".local", "bin", "code-server"))
	}

	switch runtime.GOOS {
	case "darwin":
		candidates = append(candidates,
			"/opt/homebrew/bin/code-server",
			"/usr/local/bin/code-server",
			"/usr/bin/code-server",
		)
	default:
		candidates = append(candidates,
			"/usr/local/bin/code-server",
			"/usr/bin/code-server",
			"/opt/code-server/bin/code-server",
		)
	}

	for _, p := range candidates {
		if p == "" {
			continue
		}
		abs := p
		if !filepath.IsAbs(abs) {
			if a, err := filepath.Abs(p); err == nil {
				abs = a
			}
		}
		if fi, err := os.Stat(abs); err == nil && !fi.IsDir() && (fi.Mode()&0o111) != 0 {
			return abs, nil
		}
	}

	if p, err := exec.LookPath("code-server"); err == nil {
		if a, errAbs := filepath.Abs(p); errAbs == nil {
			return a, nil
		}
		return p, nil
	}

	return "", errors.New("code-server binary not found (set REDEVEN_CODE_SERVER_BIN)")
}
