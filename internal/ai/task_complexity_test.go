package ai

import "testing"

func TestClassifyTaskComplexity(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		userInput  string
		attach     []RunAttachmentIn
		openGoal   string
		wantLevel  string
		wantReason string
	}{
		{
			name:      "simple_short_question",
			userInput: "Explain what this function does.",
			wantLevel: TaskComplexitySimple,
		},
		{
			name:      "standard_analysis_request",
			userInput: "Analyze the repository structure first, then provide an implementation plan.",
			wantLevel: TaskComplexityStandard,
		},
		{
			name:      "complex_multi_signal_request",
			userInput: "Provide a comprehensive deep-dive of this repository, then deliver a phased refactor plan, execution steps, verification strategy, and a final report.",
			attach: []RunAttachmentIn{
				{Name: "spec.md", MimeType: "text/markdown", URL: "file:///tmp/spec.md"},
			},
			openGoal:   "refactor the agent loop",
			wantLevel:  TaskComplexityComplex,
			wantReason: "attachments_present",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := classifyTaskComplexity(tc.userInput, tc.attach, tc.openGoal)
			if got.Level != tc.wantLevel {
				t.Fatalf("classifyTaskComplexity level=%q, want %q (reasons=%v)", got.Level, tc.wantLevel, got.Reasons)
			}
			if tc.wantReason != "" {
				found := false
				for _, reason := range got.Reasons {
					if reason == tc.wantReason {
						found = true
						break
					}
				}
				if !found {
					t.Fatalf("expected reason %q in %v", tc.wantReason, got.Reasons)
				}
			}
		})
	}
}

func TestMaybeEscalateTaskComplexity(t *testing.T) {
	t.Parallel()

	if got := maybeEscalateTaskComplexity(TaskComplexitySimple, runtimeState{}, []ToolCall{{Name: "terminal.exec"}, {Name: "apply_patch"}}, 1); got != TaskComplexityStandard {
		t.Fatalf("simple should escalate to standard, got %q", got)
	}

	state := runtimeState{
		TodoTrackingEnabled:  true,
		TodoOpenCount:        2,
		CompletedActionFacts: []string{"terminal.exec: inspected"},
		BlockedActionFacts:   []string{"apply_patch: conflict"},
	}
	if got := maybeEscalateTaskComplexity(TaskComplexityStandard, state, []ToolCall{{Name: "write_todos"}}, 2); got != TaskComplexityComplex {
		t.Fatalf("standard should escalate to complex, got %q", got)
	}
}

func TestMaybeEscalateTaskComplexity_ReadonlyTerminalBurstStaysStandard(t *testing.T) {
	t.Parallel()

	state := runtimeState{
		CompletedActionFacts: []string{
			"terminal.exec: listed files",
			"terminal.exec: checked cwd",
			"terminal.exec: searched workspace",
		},
	}
	calls := []ToolCall{
		{Name: "terminal.exec", Args: map[string]any{"command": "ls -la"}},
		{Name: "terminal.exec", Args: map[string]any{"command": "pwd"}},
		{Name: "terminal.exec", Args: map[string]any{"command": "rg \"foo\" ."}},
	}

	if got := maybeEscalateTaskComplexity(TaskComplexityStandard, state, calls, 0); got != TaskComplexityStandard {
		t.Fatalf("readonly terminal burst should stay standard, got %q", got)
	}
}

func TestMaybeEscalateTaskComplexity_MutatingCallsCanBecomeComplex(t *testing.T) {
	t.Parallel()

	state := runtimeState{
		CompletedActionFacts: []string{
			"terminal.exec: created patch",
			"apply_patch: updated runtime",
			"terminal.exec: ran tests",
		},
	}
	calls := []ToolCall{
		{Name: "terminal.exec", Args: map[string]any{"command": "touch /tmp/redeven_test_file"}},
		{Name: "apply_patch", Args: map[string]any{"patch": "*** Begin Patch\n*** End Patch\n"}},
		{Name: "terminal.exec", Args: map[string]any{"command": "go test ./..."}},
	}

	if got := maybeEscalateTaskComplexity(TaskComplexityStandard, state, calls, 1); got != TaskComplexityComplex {
		t.Fatalf("mutating multi-step calls should escalate to complex, got %q", got)
	}
}

func TestRequiresStructuredTodoPlan(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		input string
		want  bool
	}{
		{
			name:  "explicit chinese todo planning",
			input: "请你先划分任务并用todo工具给我一个分步计划，再按todo执行。",
			want:  true,
		},
		{
			name:  "explicit english todo planning",
			input: "Please break down the task into todos and execute according to the todo list.",
			want:  true,
		},
		{
			name:  "no explicit todo planning",
			input: "Fix the failing test and report what changed.",
			want:  false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := requiresStructuredTodoPlan(tc.input); got != tc.want {
				t.Fatalf("requiresStructuredTodoPlan(%q)=%v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestClassifyTaskComplexity_SystemQuestionIsNotHighDepthByKeyword(t *testing.T) {
	t.Parallel()

	got := classifyTaskComplexity("现在系统资源怎么样", nil, "")
	if got.Level != TaskComplexitySimple {
		t.Fatalf("level=%q, want %q (reasons=%v)", got.Level, TaskComplexitySimple, got.Reasons)
	}
	for _, reason := range got.Reasons {
		if reason == "high_depth_requirements" {
			t.Fatalf("unexpected high_depth_requirements for simple system question: %v", got.Reasons)
		}
	}
}
