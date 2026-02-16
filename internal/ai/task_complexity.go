package ai

import (
	"strings"

	aitools "github.com/floegence/redeven-agent/internal/ai/tools"
)

const (
	TaskComplexitySimple   = "simple"
	TaskComplexityStandard = "standard"
	TaskComplexityComplex  = "complex"
)

type taskComplexityDecision struct {
	Level   string   `json:"level"`
	Reasons []string `json:"reasons,omitempty"`
}

func normalizeTaskComplexity(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case TaskComplexitySimple:
		return TaskComplexitySimple
	case TaskComplexityComplex:
		return TaskComplexityComplex
	default:
		return TaskComplexityStandard
	}
}

func classifyTaskComplexity(userInput string, attachments []RunAttachmentIn, openGoal string) taskComplexityDecision {
	raw := strings.TrimSpace(userInput)
	lower := strings.ToLower(raw)

	reasons := make([]string, 0, 8)
	addReason := func(reason string) {
		reason = strings.TrimSpace(reason)
		if reason == "" {
			return
		}
		for _, existing := range reasons {
			if existing == reason {
				return
			}
		}
		reasons = append(reasons, reason)
	}
	containsAny := func(text string, parts []string) bool {
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			if strings.Contains(text, part) {
				return true
			}
		}
		return false
	}

	hasAttachments := len(attachments) > 0
	hasOpenGoal := strings.TrimSpace(openGoal) != ""
	hasLongInput := len([]rune(raw)) >= 240
	hasMultiLine := strings.Count(raw, "\n") >= 3
	hasHighDepthRequirements := containsAny(raw, []string{
		"全面", "完整", "系统性", "深入", "详细", "最终", "分阶段", "多步骤",
	}) || containsAny(lower, []string{
		"comprehensive", "end-to-end", "thorough", "detailed", "final analysis", "deep dive", "multi-step",
	})
	hasPlanningSignals := containsAny(raw, []string{
		"计划", "规划", "步骤", "路线图", "先", "然后", "接着", "下一步",
	}) || containsAny(lower, []string{
		"plan", "roadmap", "step", "then", "next",
	})
	hasExecutionSignals := containsAny(raw, []string{
		"修改", "实现", "重构", "修复", "验证", "测试", "运行", "排查", "分析",
	}) || containsAny(lower, []string{
		"implement", "modify", "refactor", "fix", "verify", "test", "run", "debug", "analyze",
	})
	hasMultiObjectiveSignals := containsAny(raw, []string{
		"并且", "同时", "另外", "以及", "还要",
	}) || containsAny(lower, []string{
		"and ", "also ", "plus ", "as well as ",
	})

	if hasAttachments {
		addReason("attachments_present")
	}
	if hasOpenGoal {
		addReason("open_goal_present")
	}
	if hasLongInput {
		addReason("long_user_input")
	}
	if hasMultiLine {
		addReason("multi_line_request")
	}
	if hasHighDepthRequirements {
		addReason("high_depth_requirements")
	}
	if hasPlanningSignals {
		addReason("planning_signals")
	}
	if hasExecutionSignals {
		addReason("execution_signals")
	}
	if hasMultiObjectiveSignals {
		addReason("multi_objective_signals")
	}

	var level string
	switch {
	case hasAttachments && (hasHighDepthRequirements || hasPlanningSignals || hasExecutionSignals || hasMultiObjectiveSignals || hasOpenGoal):
		level = TaskComplexityComplex
	case hasHighDepthRequirements && hasPlanningSignals && hasExecutionSignals:
		level = TaskComplexityComplex
	case hasMultiObjectiveSignals && hasPlanningSignals && hasExecutionSignals:
		level = TaskComplexityComplex
	case hasLongInput && hasMultiLine && (hasPlanningSignals || hasExecutionSignals || hasHighDepthRequirements):
		level = TaskComplexityComplex
	case hasOpenGoal && hasPlanningSignals && hasExecutionSignals:
		level = TaskComplexityComplex
	case len(reasons) > 0:
		level = TaskComplexityStandard
	default:
		level = TaskComplexitySimple
	}

	return taskComplexityDecision{
		Level:   level,
		Reasons: reasons,
	}
}

func requiresStructuredTodoPlan(userInput string) bool {
	raw := strings.TrimSpace(userInput)
	if raw == "" {
		return false
	}
	lower := strings.ToLower(raw)
	containsAny := func(text string, parts []string) bool {
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			if strings.Contains(text, part) {
				return true
			}
		}
		return false
	}

	// Strong direct phrases first.
	if containsAny(raw, []string{
		"划分任务", "任务拆解", "拆解任务", "规划步骤", "分步计划", "按步骤执行",
		"划分todo", "列出todo", "使用todo", "todo工具", "按todo执行",
	}) {
		return true
	}
	if containsAny(lower, []string{
		"break down the task", "task breakdown", "split into tasks", "plan the steps",
		"step-by-step plan", "todo list", "use todos", "use todo tool", "use write_todos",
	}) {
		return true
	}

	hasTodoSignal := containsAny(raw, []string{
		"todo", "todos", "待办", "任务清单", "任务列表",
	}) || containsAny(lower, []string{
		"todo", "todos", "write_todos", "task list",
	})
	hasPlanSignal := containsAny(raw, []string{
		"计划", "规划", "步骤", "分步", "拆解", "划分", "按步骤", "执行顺序",
	}) || containsAny(lower, []string{
		"plan", "planning", "steps", "step-by-step", "break down", "split", "execute by",
	})
	hasImperativeSignal := containsAny(raw, []string{
		"请", "需要", "帮我", "务必", "必须", "一定", "要求",
	}) || containsAny(lower, []string{
		"please", "need", "must", "require", "should",
	})
	return hasTodoSignal && hasPlanSignal && hasImperativeSignal
}

func maybeEscalateTaskComplexity(current string, state runtimeState, normalCalls []ToolCall, step int) string {
	level := normalizeTaskComplexity(current)
	if level == TaskComplexityComplex {
		return level
	}

	actionFacts := len(state.CompletedActionFacts) + len(state.BlockedActionFacts)
	substantialCalls := countSubstantialToolCalls(normalCalls)
	if state.TodoTrackingEnabled {
		if state.TodoOpenCount > 1 || actionFacts >= 3 || step >= 2 {
			return TaskComplexityComplex
		}
		if level == TaskComplexitySimple {
			return TaskComplexityStandard
		}
	}

	if level == TaskComplexitySimple {
		if substantialCalls >= 1 && (len(normalCalls) >= 2 || actionFacts >= 2) {
			return TaskComplexityStandard
		}
		// A burst of readonly probes can still justify standard depth, but should not
		// force complex todo workflows.
		if substantialCalls == 0 && len(normalCalls) >= 3 && actionFacts >= 3 {
			return TaskComplexityStandard
		}
	}

	if level == TaskComplexityStandard {
		if substantialCalls >= 2 && (len(normalCalls) >= 3 || actionFacts >= 3) {
			return TaskComplexityComplex
		}
		if substantialCalls >= 1 && actionFacts >= 4 {
			return TaskComplexityComplex
		}
	}

	return level
}

func countSubstantialToolCalls(calls []ToolCall) int {
	count := 0
	for _, call := range calls {
		if isSubstantialToolCall(call) {
			count++
		}
	}
	return count
}

func isSubstantialToolCall(call ToolCall) bool {
	toolName := strings.TrimSpace(strings.ToLower(call.Name))
	switch toolName {
	case "", "task_complete", "ask_user", "write_todos":
		return false
	case "terminal.exec":
		command := ""
		if call.Args != nil {
			if raw, ok := call.Args["command"].(string); ok {
				command = raw
			}
		}
		risk := aitools.ClassifyTerminalCommandRisk(command)
		return risk != aitools.TerminalCommandRiskReadonly
	default:
		return true
	}
}
