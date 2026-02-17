package ai

import (
	"strings"

	"github.com/floegence/redeven-agent/internal/ai/threadstore"
)

func buildWaitingPromptID(messageID string, toolID string) string {
	messageID = strings.TrimSpace(messageID)
	toolID = strings.TrimSpace(toolID)
	if messageID == "" || toolID == "" {
		return ""
	}
	return "wp_" + messageID + "_" + toolID
}

func normalizeWaitingPrompt(promptID string, messageID string, toolID string) *WaitingPrompt {
	messageID = strings.TrimSpace(messageID)
	toolID = strings.TrimSpace(toolID)
	promptID = strings.TrimSpace(promptID)
	if promptID == "" {
		promptID = buildWaitingPromptID(messageID, toolID)
	}
	if promptID == "" || messageID == "" || toolID == "" {
		return nil
	}
	return &WaitingPrompt{
		PromptID:  promptID,
		MessageID: messageID,
		ToolID:    toolID,
	}
}

func waitingPromptFromThreadRecord(t *threadstore.Thread, effectiveRunStatus string) *WaitingPrompt {
	if t == nil {
		return nil
	}
	if NormalizeRunState(effectiveRunStatus) != RunStateWaitingUser {
		return nil
	}
	return normalizeWaitingPrompt(t.WaitingPromptID, t.WaitingMessageID, t.WaitingToolID)
}
