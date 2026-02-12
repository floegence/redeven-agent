package tools

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestClassifyError_InvalidPathProducesNormalizedArgs(t *testing.T) {
	t.Parallel()

	inv := Invocation{
		ToolName: "fs.list_dir",
		Args: map[string]any{
			"path": "/tmp/workspace/../workspace/docs/",
		},
	}
	toolErr := ClassifyError(inv, errors.New("invalid path"))
	if toolErr == nil {
		t.Fatalf("expected tool error")
	}
	if toolErr.Code != ErrorCodeInvalidPath {
		t.Fatalf("code=%q, want=%q", toolErr.Code, ErrorCodeInvalidPath)
	}
	if !toolErr.Retryable {
		t.Fatalf("retryable=false, want true")
	}
	want := filepath.Clean("/tmp/workspace/docs")
	if got := toolErr.NormalizedArgs["path"]; got != want {
		t.Fatalf("normalized path=%v, want=%v", got, want)
	}
}

func TestClassifyError_InvalidPathNormalizesRelativePath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	inv := Invocation{
		ToolName:   "fs.read_file",
		WorkingDir: root,
		Args: map[string]any{
			"path": "docs/readme.md",
		},
	}
	toolErr := ClassifyError(inv, errors.New("path must be absolute"))
	if toolErr == nil {
		t.Fatalf("expected tool error")
	}
	if toolErr.Code != ErrorCodeInvalidPath {
		t.Fatalf("code=%q, want=%q", toolErr.Code, ErrorCodeInvalidPath)
	}
	want := filepath.Clean(filepath.Join(root, "docs/readme.md"))
	if got := toolErr.NormalizedArgs["path"]; got != want {
		t.Fatalf("normalized path=%v, want=%v", got, want)
	}
}

func TestClassifyError_NotFound(t *testing.T) {
	t.Parallel()

	toolErr := ClassifyError(Invocation{ToolName: "fs.stat"}, errors.New("not found"))
	if toolErr == nil {
		t.Fatalf("expected tool error")
	}
	if toolErr.Code != ErrorCodeNotFound {
		t.Fatalf("code=%q, want=%q", toolErr.Code, ErrorCodeNotFound)
	}
	if toolErr.Retryable {
		t.Fatalf("retryable=true, want false")
	}
}

func TestShouldRetryWithNormalizedArgs(t *testing.T) {
	t.Parallel()

	toolErr := &ToolError{
		Code:      ErrorCodeInvalidPath,
		Message:   "path must be absolute",
		Retryable: true,
		NormalizedArgs: map[string]any{
			"path": "/tmp/workspace",
		},
	}
	if !ShouldRetryWithNormalizedArgs(toolErr) {
		t.Fatalf("expected retry with normalized args")
	}
}

func TestShouldRetryWithNormalizedArgs_NotFound(t *testing.T) {
	t.Parallel()

	toolErr := &ToolError{
		Code:      ErrorCodeNotFound,
		Message:   "not found",
		Retryable: true,
		NormalizedArgs: map[string]any{
			"path": "/tmp/workspace",
		},
	}
	if ShouldRetryWithNormalizedArgs(toolErr) {
		t.Fatalf("did not expect normalized retry for not found")
	}
}
