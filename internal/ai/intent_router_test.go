package ai

import (
	"testing"

	"github.com/floegence/redeven-agent/internal/config"
)

func TestClassifyRunIntent_Social(t *testing.T) {
	t.Parallel()

	got := classifyRunIntent("hello", nil, "")
	if got.Intent != RunIntentSocial {
		t.Fatalf("intent=%q, want %q", got.Intent, RunIntentSocial)
	}
}

func TestClassifyRunIntent_TaskByKeywords(t *testing.T) {
	t.Parallel()

	got := classifyRunIntent("please analyze this repository architecture", nil, "")
	if got.Intent != RunIntentTask {
		t.Fatalf("intent=%q, want %q", got.Intent, RunIntentTask)
	}
}

func TestClassifyRunIntent_TaskByContinuationWhenOpenGoalExists(t *testing.T) {
	t.Parallel()

	got := classifyRunIntent("continue", nil, "fix startup failure")
	if got.Intent != RunIntentTask {
		t.Fatalf("intent=%q, want %q", got.Intent, RunIntentTask)
	}
}

func TestClassifyRunIntent_TaskByAttachment(t *testing.T) {
	t.Parallel()

	got := classifyRunIntent("take a look at this", []RunAttachmentIn{{URL: "file:///tmp/a.txt"}}, "")
	if got.Intent != RunIntentTask {
		t.Fatalf("intent=%q, want %q", got.Intent, RunIntentTask)
	}
}

func TestNormalizeRunMode(t *testing.T) {
	t.Parallel()

	if got := normalizeRunMode("act", config.AIModePlan); got != config.AIModeAct {
		t.Fatalf("normalizeRunMode act=%q, want %q", got, config.AIModeAct)
	}
	if got := normalizeRunMode("plan", config.AIModeAct); got != config.AIModePlan {
		t.Fatalf("normalizeRunMode plan=%q, want %q", got, config.AIModePlan)
	}
	if got := normalizeRunMode("", config.AIModePlan); got != config.AIModePlan {
		t.Fatalf("normalizeRunMode empty fallback plan=%q, want %q", got, config.AIModePlan)
	}
	if got := normalizeRunMode("oops", config.AIModeAct); got != config.AIModeAct {
		t.Fatalf("normalizeRunMode invalid fallback act=%q, want %q", got, config.AIModeAct)
	}
}
