package ai

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveAbsoluteWithinRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	inside := filepath.Join(root, "sub", "dir")
	if err := os.MkdirAll(inside, 0o755); err != nil {
		t.Fatalf("mkdir inside: %v", err)
	}
	outside := filepath.Dir(root)

	r := &run{fsRoot: root}

	t.Run("inside root", func(t *testing.T) {
		t.Parallel()
		got, err := r.resolveAbsoluteWithinRoot(inside)
		if err != nil {
			t.Fatalf("resolveAbsoluteWithinRoot: %v", err)
		}
		if filepath.Clean(got) != filepath.Clean(inside) {
			t.Fatalf("resolved path=%q, want %q", got, inside)
		}
	})

	t.Run("relative path rejected", func(t *testing.T) {
		t.Parallel()
		_, err := r.resolveAbsoluteWithinRoot("sub/dir")
		if !errors.Is(err, errPathMustBeAbsolute) {
			t.Fatalf("err=%v, want %v", err, errPathMustBeAbsolute)
		}
	})

	t.Run("outside root rejected", func(t *testing.T) {
		t.Parallel()
		_, err := r.resolveAbsoluteWithinRoot(outside)
		if !errors.Is(err, errPathOutsideWorkspace) {
			t.Fatalf("err=%v, want %v", err, errPathOutsideWorkspace)
		}
	})
}

func TestToolFSListDir_PathMustBeAbsolute(t *testing.T) {
	t.Parallel()

	r := &run{fsRoot: t.TempDir()}
	_, err := r.toolFSListDir("relative/path")
	if err == nil {
		t.Fatalf("expected error for relative path")
	}
	if strings.TrimSpace(err.Error()) != "invalid path: must be absolute" {
		t.Fatalf("err=%q, want %q", err.Error(), "invalid path: must be absolute")
	}
}

func TestToolTerminalExec_CwdRules(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	r := &run{fsRoot: root, shell: "bash"}

	t.Run("empty cwd falls back to workspace root", func(t *testing.T) {
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
		if filepath.Clean(stdout) != filepath.Clean(root) {
			t.Fatalf("stdout=%q, want cwd=%q", stdout, root)
		}
	})

	t.Run("outside cwd rejected", func(t *testing.T) {
		t.Parallel()
		_, err := r.toolTerminalExec(context.Background(), "pwd", "/", 5000)
		if err == nil {
			t.Fatalf("expected cwd validation error")
		}
		if strings.TrimSpace(err.Error()) != "cwd outside workspace root" {
			t.Fatalf("err=%q, want %q", err.Error(), "cwd outside workspace root")
		}
	})
}
