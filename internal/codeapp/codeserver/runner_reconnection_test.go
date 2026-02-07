package codeserver

import (
	"testing"
	"time"
)

func TestResolveReconnectionGraceDefault(t *testing.T) {
	t.Setenv("REDEVEN_CODE_SERVER_RECONNECTION_GRACE_TIME", "")

	r := &Runner{reconnectionGrace: 30 * time.Second}
	if got := r.resolveReconnectionGrace(); got != 30*time.Second {
		t.Fatalf("resolveReconnectionGrace() = %s, want 30s", got)
	}
}

func TestResolveReconnectionGraceFromEnv(t *testing.T) {
	t.Setenv("REDEVEN_CODE_SERVER_RECONNECTION_GRACE_TIME", "45s")

	r := &Runner{reconnectionGrace: 30 * time.Second}
	if got := r.resolveReconnectionGrace(); got != 45*time.Second {
		t.Fatalf("resolveReconnectionGrace() = %s, want 45s", got)
	}
}

func TestResolveReconnectionGraceInvalidEnvFallsBack(t *testing.T) {
	t.Setenv("REDEVEN_CODE_SERVER_RECONNECTION_GRACE_TIME", "bad-value")

	r := &Runner{reconnectionGrace: 30 * time.Second}
	if got := r.resolveReconnectionGrace(); got != 30*time.Second {
		t.Fatalf("resolveReconnectionGrace() = %s, want fallback 30s", got)
	}
}

func TestResolveReconnectionGraceNonPositiveEnvFallsBack(t *testing.T) {
	t.Setenv("REDEVEN_CODE_SERVER_RECONNECTION_GRACE_TIME", "0s")

	r := &Runner{reconnectionGrace: 30 * time.Second}
	if got := r.resolveReconnectionGrace(); got != 30*time.Second {
		t.Fatalf("resolveReconnectionGrace() = %s, want fallback 30s", got)
	}
}

func TestFormatReconnectionGrace(t *testing.T) {
	if got := formatReconnectionGrace(1500 * time.Millisecond); got != "1500ms" {
		t.Fatalf("formatReconnectionGrace() = %q, want %q", got, "1500ms")
	}
	if got := formatReconnectionGrace(0); got != "" {
		t.Fatalf("formatReconnectionGrace() = %q, want empty", got)
	}
}
