package fs

import (
	"path/filepath"
	"testing"
)

func TestServiceResolve(t *testing.T) {
	root := t.TempDir()
	s := NewService(root)

	// Empty -> root
	vp, p, err := s.resolve("")
	if err != nil {
		t.Fatalf("resolve(empty) error: %v", err)
	}
	if vp != "/" {
		t.Fatalf("resolve(empty) virtual = %q, want %q", vp, "/")
	}
	if filepath.Clean(p) != filepath.Clean(root) {
		t.Fatalf("resolve(empty) = %q, want %q", p, root)
	}

	// Relative inside
	vp, p, err = s.resolve("a/b")
	if err != nil {
		t.Fatalf("resolve(rel) error: %v", err)
	}
	if vp != "/a/b" {
		t.Fatalf("resolve(rel) virtual = %q, want %q", vp, "/a/b")
	}
	want := filepath.Join(root, "a", "b")
	if filepath.Clean(p) != filepath.Clean(want) {
		t.Fatalf("resolve(rel) = %q, want %q", p, want)
	}

	// Clamps above-root virtual paths back to "/".
	vp, p, err = s.resolve("/../../..")
	if err != nil {
		t.Fatalf("resolve(clamp) error: %v", err)
	}
	if vp != "/" {
		t.Fatalf("resolve(clamp) virtual = %q, want %q", vp, "/")
	}
	if filepath.Clean(p) != filepath.Clean(root) {
		t.Fatalf("resolve(clamp) real = %q, want %q", p, root)
	}
}
