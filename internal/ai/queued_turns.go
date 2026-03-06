package ai

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/floegence/redeven-agent/internal/ai/threadstore"
	"github.com/floegence/redeven-agent/internal/session"
)

func NewQueuedTurnID() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "qt_" + base64.RawURLEncoding.EncodeToString(b), nil
}

func marshalQueuedTurnAttachments(items []RunAttachmentIn) string {
	if len(items) == 0 {
		return "[]"
	}
	b, err := json.Marshal(items)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func marshalQueuedTurnOptions(opts RunOptions) string {
	b, err := json.Marshal(opts)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func unmarshalQueuedTurnAttachments(raw string) []RunAttachmentIn {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []RunAttachmentIn
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	cleaned := make([]RunAttachmentIn, 0, len(out))
	for _, item := range out {
		url := strings.TrimSpace(item.URL)
		if url == "" {
			continue
		}
		cleaned = append(cleaned, RunAttachmentIn{
			Name:     strings.TrimSpace(item.Name),
			MimeType: strings.TrimSpace(item.MimeType),
			URL:      url,
		})
	}
	return cleaned
}

func unmarshalQueuedTurnOptions(raw string) RunOptions {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return RunOptions{}
	}
	var out RunOptions
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return RunOptions{}
	}
	return out
}

func queuedTurnRecordToView(rec threadstore.QueuedTurn, position int) QueuedTurnView {
	attachments := unmarshalQueuedTurnAttachments(rec.AttachmentsJSON)
	views := make([]QueuedTurnAttachmentView, 0, len(attachments))
	for _, item := range attachments {
		name := strings.TrimSpace(item.Name)
		mimeType := strings.TrimSpace(item.MimeType)
		if name == "" && mimeType == "" {
			continue
		}
		views = append(views, QueuedTurnAttachmentView{
			Name:     name,
			MimeType: mimeType,
		})
	}
	options := unmarshalQueuedTurnOptions(rec.OptionsJSON)
	view := QueuedTurnView{
		QueueID:         strings.TrimSpace(rec.QueueID),
		MessageID:       strings.TrimSpace(rec.MessageID),
		Text:            strings.TrimSpace(rec.TextContent),
		ModelID:         strings.TrimSpace(rec.ModelID),
		ExecutionMode:   normalizeRunMode(options.Mode, ""),
		Position:        position,
		CreatedAtUnixMs: rec.CreatedAtUnixMs,
	}
	if view.ExecutionMode == "act" && strings.TrimSpace(options.Mode) == "" {
		view.ExecutionMode = ""
	}
	if len(views) > 0 {
		view.Attachments = views
	}
	return view
}

func queuedTurnRecordToRunStartRequest(rec threadstore.QueuedTurn, threadExecutionMode string) RunStartRequest {
	options := unmarshalQueuedTurnOptions(rec.OptionsJSON)
	options.Mode = normalizeRunMode(options.Mode, normalizeRunMode(threadExecutionMode, "act"))
	return RunStartRequest{
		ThreadID: strings.TrimSpace(rec.ThreadID),
		Model:    strings.TrimSpace(rec.ModelID),
		Input: RunInput{
			MessageID:   strings.TrimSpace(rec.MessageID),
			Text:        strings.TrimSpace(rec.TextContent),
			Attachments: unmarshalQueuedTurnAttachments(rec.AttachmentsJSON),
		},
		Options: options,
	}
}

func queuedTurnRecordToSessionMeta(rec threadstore.QueuedTurn, namespacePublicID string) *session.Meta {
	return &session.Meta{
		ChannelID:         strings.TrimSpace(rec.ChannelID),
		EndpointID:        strings.TrimSpace(rec.EndpointID),
		NamespacePublicID: strings.TrimSpace(namespacePublicID),
		UserPublicID:      strings.TrimSpace(rec.CreatedByUserPublicID),
		UserEmail:         strings.TrimSpace(rec.CreatedByUserEmail),
		CanRead:           true,
		CanWrite:          true,
		CanExecute:        true,
	}
}

func (s *Service) enqueueQueuedTurn(ctx context.Context, meta *session.Meta, req SendUserTurnRequest) (threadstore.QueuedTurn, int, error) {
	if s == nil {
		return threadstore.QueuedTurn{}, 0, errors.New("nil service")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := requireRWX(meta); err != nil {
		return threadstore.QueuedTurn{}, 0, err
	}

	s.mu.Lock()
	db := s.threadsDB
	persistTO := s.persistOpTO
	s.mu.Unlock()
	if db == nil {
		return threadstore.QueuedTurn{}, 0, errors.New("threads store not ready")
	}
	if persistTO <= 0 {
		persistTO = defaultPersistOpTimeout
	}

	messageID := strings.TrimSpace(req.Input.MessageID)
	if messageID != "" && !isSafeClientMessageID(messageID) {
		messageID = ""
	}
	if messageID == "" {
		var err error
		messageID, err = newUserMessageID()
		if err != nil {
			return threadstore.QueuedTurn{}, 0, err
		}
	}
	queueID, err := NewQueuedTurnID()
	if err != nil {
		return threadstore.QueuedTurn{}, 0, err
	}

	rec := threadstore.QueuedTurn{
		QueueID:               queueID,
		EndpointID:            strings.TrimSpace(meta.EndpointID),
		ThreadID:              strings.TrimSpace(req.ThreadID),
		ChannelID:             strings.TrimSpace(meta.ChannelID),
		MessageID:             messageID,
		ModelID:               strings.TrimSpace(req.Model),
		TextContent:           strings.TrimSpace(req.Input.Text),
		AttachmentsJSON:       marshalQueuedTurnAttachments(req.Input.Attachments),
		OptionsJSON:           marshalQueuedTurnOptions(req.Options),
		CreatedByUserPublicID: strings.TrimSpace(meta.UserPublicID),
		CreatedByUserEmail:    strings.TrimSpace(meta.UserEmail),
		CreatedAtUnixMs:       time.Now().UnixMilli(),
	}

	pctx, cancel := context.WithTimeout(ctx, persistTO)
	defer cancel()
	queued, position, err := db.EnqueueQueuedTurn(pctx, rec)
	if err != nil {
		return threadstore.QueuedTurn{}, 0, err
	}
	s.broadcastThreadSummary(strings.TrimSpace(meta.EndpointID), strings.TrimSpace(req.ThreadID))
	return queued, position, nil
}

func (s *Service) ListQueuedTurns(ctx context.Context, meta *session.Meta, threadID string, limit int) (*ListQueuedTurnsResponse, error) {
	if s == nil {
		return nil, errors.New("nil service")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := requireRWX(meta); err != nil {
		return nil, err
	}

	s.mu.Lock()
	db := s.threadsDB
	s.mu.Unlock()
	if db == nil {
		return nil, errors.New("threads store not ready")
	}

	threadID = strings.TrimSpace(threadID)
	endpointID := strings.TrimSpace(meta.EndpointID)
	if endpointID == "" || threadID == "" {
		return nil, errors.New("invalid request")
	}
	th, err := db.GetThread(ctx, endpointID, threadID)
	if err != nil {
		return nil, err
	}
	if th == nil {
		return nil, sql.ErrNoRows
	}

	list, err := db.ListQueuedTurns(ctx, endpointID, threadID, limit)
	if err != nil {
		return nil, err
	}
	out := &ListQueuedTurnsResponse{QueuedTurns: make([]QueuedTurnView, 0, len(list))}
	for i, rec := range list {
		out.QueuedTurns = append(out.QueuedTurns, queuedTurnRecordToView(rec, i+1))
	}
	return out, nil
}

func (s *Service) UpdateQueuedTurn(ctx context.Context, meta *session.Meta, threadID string, queueID string, req PatchQueuedTurnRequest) error {
	if s == nil {
		return errors.New("nil service")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := requireRWX(meta); err != nil {
		return err
	}
	if req.Text == nil {
		return errors.New("missing fields")
	}

	s.mu.Lock()
	db := s.threadsDB
	s.mu.Unlock()
	if db == nil {
		return errors.New("threads store not ready")
	}

	if err := db.UpdateQueuedTurn(ctx, strings.TrimSpace(meta.EndpointID), strings.TrimSpace(threadID), strings.TrimSpace(queueID), strings.TrimSpace(*req.Text)); err != nil {
		return err
	}
	s.broadcastThreadSummary(strings.TrimSpace(meta.EndpointID), strings.TrimSpace(threadID))
	return nil
}

func (s *Service) DeleteQueuedTurn(ctx context.Context, meta *session.Meta, threadID string, queueID string) error {
	if s == nil {
		return errors.New("nil service")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := requireRWX(meta); err != nil {
		return err
	}

	s.mu.Lock()
	db := s.threadsDB
	s.mu.Unlock()
	if db == nil {
		return errors.New("threads store not ready")
	}

	if err := db.DeleteQueuedTurn(ctx, strings.TrimSpace(meta.EndpointID), strings.TrimSpace(threadID), strings.TrimSpace(queueID)); err != nil {
		return err
	}
	s.broadcastThreadSummary(strings.TrimSpace(meta.EndpointID), strings.TrimSpace(threadID))
	return nil
}
