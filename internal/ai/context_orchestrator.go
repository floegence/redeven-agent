package ai

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	historySoftCharBudget        = 45_000
	historyHardMessageBudget     = 40
	historyRecentMessageKeep     = 20
	historySummaryMessageLimit   = 16
	historySummaryMaxChars       = 3_200
	historyAssistantPreviewRunes = 180
)

var historyAnchorPattern = regexp.MustCompile(`(?:~?/[^\s"'` + "`" + `]+|\.{1,2}/[^\s"'` + "`" + `]+|\b(?:pwd|ls|cat|rg|grep|tree|go test|npm run|pnpm)\b)`)

type runContextBuildResult struct {
	History []RunHistoryMsg
	Pkg     *RunContextPackage
}

func buildRunContext(history []RunHistoryMsg, userInput string, openGoal string) runContextBuildResult {
	normalized := normalizeHistoryMessages(history)
	res := runContextBuildResult{
		History: append([]RunHistoryMsg(nil), normalized...),
		Pkg: &RunContextPackage{
			OpenGoal: strings.TrimSpace(openGoal),
			Stats:    map[string]int{},
			Meta:     map[string]string{},
		},
	}

	totalChars := 0
	for _, it := range normalized {
		totalChars += utf8.RuneCountInString(strings.TrimSpace(it.Text))
	}

	res.Pkg.Stats["history_messages_original"] = len(normalized)
	res.Pkg.Stats["history_chars_original"] = totalChars

	keep := historyRecentMessageKeep
	if len(normalized) <= keep && totalChars <= historySoftCharBudget {
		res.Pkg.Stats["history_messages_sent"] = len(normalized)
		res.Pkg.Stats["history_chars_sent"] = totalChars
		res.Pkg.Anchors = extractHistoryAnchors(normalized, userInput, openGoal)
		res.Pkg.Meta["compression"] = "none"
		return res
	}
	if len(normalized) > historyHardMessageBudget {
		keep = 14
	}
	if keep < 6 {
		keep = 6
	}
	if keep > len(normalized) {
		keep = len(normalized)
	}

	split := len(normalized) - keep
	if split < 0 {
		split = 0
	}
	older := append([]RunHistoryMsg(nil), normalized[:split]...)
	recent := append([]RunHistoryMsg(nil), normalized[split:]...)
	summary := summarizeHistoryMessages(older)

	compressed := make([]RunHistoryMsg, 0, len(recent)+2)
	if goal := strings.TrimSpace(openGoal); goal != "" {
		compressed = append(compressed, RunHistoryMsg{
			Role: "assistant",
			Text: "<open-goal>\n" + goal + "\n</open-goal>",
		})
	}
	if strings.TrimSpace(summary) != "" {
		compressed = append(compressed, RunHistoryMsg{
			Role: "assistant",
			Text: "<history-summary>\n" + summary + "\n</history-summary>",
		})
	}
	compressed = append(compressed, recent...)

	sentChars := 0
	for _, it := range compressed {
		sentChars += utf8.RuneCountInString(strings.TrimSpace(it.Text))
	}

	res.History = compressed
	res.Pkg.HistorySummary = summary
	res.Pkg.Anchors = extractHistoryAnchors(normalized, userInput, openGoal)
	res.Pkg.Stats["history_messages_sent"] = len(compressed)
	res.Pkg.Stats["history_chars_sent"] = sentChars
	res.Pkg.Stats["history_messages_compacted"] = len(older)
	res.Pkg.Meta["compression"] = "summary+recent"
	return res
}

func normalizeHistoryMessages(history []RunHistoryMsg) []RunHistoryMsg {
	out := make([]RunHistoryMsg, 0, len(history))
	for _, it := range history {
		role := strings.TrimSpace(strings.ToLower(it.Role))
		if role != "assistant" && role != "user" {
			continue
		}
		text := strings.TrimSpace(it.Text)
		if text == "" {
			continue
		}
		out = append(out, RunHistoryMsg{Role: role, Text: text})
	}
	return out
}

func summarizeHistoryMessages(history []RunHistoryMsg) string {
	if len(history) == 0 {
		return ""
	}
	start := 0
	if len(history) > historySummaryMessageLimit {
		start = len(history) - historySummaryMessageLimit
	}
	picked := history[start:]
	parts := make([]string, 0, len(picked))
	for _, it := range picked {
		role := "User"
		if it.Role == "assistant" {
			role = "Assistant"
		}
		text := strings.TrimSpace(it.Text)
		if utf8.RuneCountInString(text) > historyAssistantPreviewRunes {
			text = string([]rune(text)[:historyAssistantPreviewRunes]) + "..."
		}
		parts = append(parts, "- "+role+": "+text)
	}
	msg := strings.Join(parts, "\n")
	if utf8.RuneCountInString(msg) > historySummaryMaxChars {
		msg = string([]rune(msg)[:historySummaryMaxChars]) + "..."
	}
	return msg
}

func extractHistoryAnchors(history []RunHistoryMsg, userInput string, openGoal string) []string {
	textParts := make([]string, 0, len(history)+2)
	for _, it := range history {
		if strings.TrimSpace(it.Text) == "" {
			continue
		}
		textParts = append(textParts, it.Text)
	}
	if strings.TrimSpace(userInput) != "" {
		textParts = append(textParts, userInput)
	}
	if strings.TrimSpace(openGoal) != "" {
		textParts = append(textParts, openGoal)
	}
	joined := strings.Join(textParts, "\n")
	if strings.TrimSpace(joined) == "" {
		return nil
	}
	matches := historyAnchorPattern.FindAllString(joined, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	anchors := make([]string, 0, 12)
	for _, m := range matches {
		m = strings.TrimSpace(m)
		if m == "" {
			continue
		}
		k := strings.ToLower(m)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		anchors = append(anchors, m)
		if len(anchors) >= 12 {
			break
		}
	}
	sort.Strings(anchors)
	return anchors
}
