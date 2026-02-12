package ai

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/floegence/redeven-agent/internal/config"
)

const (
	RunIntentSocial = "social"
	RunIntentTask   = "task"
)

type intentDecision struct {
	Intent     string
	Confidence float64
	Reason     string
}

func normalizeRunIntent(raw string) string {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case RunIntentSocial:
		return RunIntentSocial
	default:
		return RunIntentTask
	}
}

func normalizeRunMode(raw string, fallback string) string {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case config.AIModeAct, config.AIModePlan:
		return v
	}
	f := strings.ToLower(strings.TrimSpace(fallback))
	if f == config.AIModePlan {
		return config.AIModePlan
	}
	return config.AIModeAct
}

func classifyRunIntent(userInput string, attachments []RunAttachmentIn, openGoal string) intentDecision {
	text := strings.TrimSpace(userInput)
	lower := strings.ToLower(text)
	normalizedCompact := compactText(lower)
	existingGoal := strings.TrimSpace(openGoal)

	if existingGoal != "" && isContinuationMessage(lower, normalizedCompact) {
		return intentDecision{
			Intent:     RunIntentTask,
			Confidence: 0.99,
			Reason:     "thread_has_open_goal_and_user_requests_continuation",
		}
	}
	if len(attachments) > 0 {
		return intentDecision{
			Intent:     RunIntentTask,
			Confidence: 0.98,
			Reason:     "attachments_present",
		}
	}
	if hasTaskSignals(lower, text) {
		return intentDecision{
			Intent:     RunIntentTask,
			Confidence: 0.95,
			Reason:     "task_signal_detected",
		}
	}
	if isSocialMessage(lower, normalizedCompact) {
		return intentDecision{
			Intent:     RunIntentSocial,
			Confidence: 0.97,
			Reason:     "small_talk_detected",
		}
	}
	return intentDecision{
		Intent:     RunIntentTask,
		Confidence: 0.60,
		Reason:     "default_to_task",
	}
}

func isContinuationMessage(lower string, compact string) bool {
	if compact == "" {
		return false
	}
	exact := map[string]struct{}{
		"ok":           {},
		"okay":         {},
		"yes":          {},
		"y":            {},
		"sure":         {},
		"continue":     {},
		"goon":         {},
		"goahead":      {},
		"keepgoing":    {},
		"carryon":      {},
		"proceed":      {},
		"soundsgood":   {},
		"letsdothis":   {},
		"letscontinue": {},
	}
	if _, ok := exact[compact]; ok {
		return true
	}
	prefixes := []string{
		"go on", "continue", "please continue", "keep going", "carry on", "proceed", "go ahead",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return isShortNonASCIIAck(compact)
}

func hasTaskSignals(lower string, raw string) bool {
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "```") {
		return true
	}
	taskKeywords := []string{
		"analyze", "analysis", "explain", "implement", "fix", "change", "edit", "modify", "refactor", "optimize",
		"inspect", "check", "review", "debug", "run", "test", "compile", "build", "commit", "write", "generate", "create",
	}
	for _, kw := range taskKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	commandHints := []string{
		"git ", "npm ", "pnpm ", "yarn ", "go test", "go build", "python ", "bash ", "ls ", "cat ", "rg ",
		"sed ", "awk ", "make ", "docker ", "kubectl ", "curl ", "vim ", "vi ",
	}
	for _, hint := range commandHints {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	pathHints := []string{
		"/", "\\", ".go", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml", "package.json", "go.mod",
	}
	hasPathHint := false
	for _, hint := range pathHints {
		if strings.Contains(lower, hint) {
			hasPathHint = true
			break
		}
	}
	if hasPathHint && utf8.RuneCountInString(strings.TrimSpace(raw)) >= 4 {
		return true
	}
	return false
}

func isSocialMessage(lower string, compact string) bool {
	if compact == "" {
		return true
	}
	if utf8.RuneCountInString(compact) > 24 {
		return false
	}
	exact := map[string]struct{}{
		"hello":            {},
		"hi":               {},
		"hey":              {},
		"goodmorning":      {},
		"goodevening":      {},
		"goodafternoon":    {},
		"thanks":           {},
		"thankyou":         {},
		"thankyouverymuch": {},
		"bye":              {},
		"goodbye":          {},
		"seeyou":           {},
	}
	if _, ok := exact[compact]; ok {
		return true
	}
	prefixes := []string{
		"hello", "hi ", "hey ", "thanks", "thank you", "good morning", "good evening", "good afternoon",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

func compactText(in string) string {
	v := strings.TrimSpace(strings.ToLower(in))
	if v == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(v))
	for _, r := range v {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func isShortNonASCIIAck(compact string) bool {
	if compact == "" {
		return false
	}
	runeCount := utf8.RuneCountInString(compact)
	if runeCount == 0 || runeCount > 4 {
		return false
	}
	for _, r := range compact {
		if r <= unicode.MaxASCII {
			return false
		}
	}
	return true
}
