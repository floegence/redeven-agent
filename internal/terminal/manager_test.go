package terminal

import (
	"path/filepath"
	"testing"
)

func TestResolveCwd(t *testing.T) {
	root := t.TempDir()
	m := NewManager("/bin/bash", root, nil)

	// Empty -> root
	got, err := m.resolveCwd("")
	if err != nil {
		t.Fatalf("resolveCwd(empty) error: %v", err)
	}
	if filepath.Clean(got) != filepath.Clean(root) {
		t.Fatalf("resolveCwd(empty) = %q, want %q", got, root)
	}

	// Relative inside
	got, err = m.resolveCwd("sub")
	if err != nil {
		t.Fatalf("resolveCwd(rel) error: %v", err)
	}
	want := filepath.Join(root, "sub")
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("resolveCwd(rel) = %q, want %q", got, want)
	}

	// Escape should fail
	got, err = m.resolveCwd("/../../..")
	if err != nil {
		t.Fatalf("resolveCwd(clamp) error: %v", err)
	}
	if filepath.Clean(got) != filepath.Clean(root) {
		t.Fatalf("resolveCwd(clamp) = %q, want %q", got, root)
	}
}
