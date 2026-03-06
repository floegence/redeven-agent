package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/floegence/redeven-agent/internal/ai"
	"github.com/floegence/redeven-agent/internal/config"
	"github.com/floegence/redeven-agent/internal/session"
)

func TestGateway_AI_QueuedTurnsEndpoints(t *testing.T) {
	t.Parallel()

	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}))
	stateDir := t.TempDir()

	providerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			return
		case <-time.After(3 * time.Second):
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":{"message":"forced stop for queued-turn test"}}`))
	}))
	defer providerServer.Close()

	cfg := &config.AIConfig{
		Providers: []config.AIProvider{
			{
				ID:      "openai",
				Name:    "OpenAI",
				Type:    "openai",
				BaseURL: providerServer.URL,
				Models:  []config.AIProviderModel{{ModelName: "gpt-5-mini"}},
			},
		},
	}

	channelID := "ch_test_ai_queued_turns_1"
	envOrigin := envOriginWithChannel(channelID)
	meta := session.Meta{
		ChannelID:         channelID,
		EndpointID:        "env_queued_turns",
		NamespacePublicID: "ns_test",
		UserPublicID:      "u_test",
		UserEmail:         "u_test@example.com",
		CanRead:           true,
		CanWrite:          true,
		CanExecute:        true,
		CanAdmin:          true,
	}
	resolveMeta := resolveMetaForTest(channelID, meta)

	threadIDForCleanup := ""

	aiSvc, err := ai.NewService(ai.Options{
		Logger:           logger,
		StateDir:         stateDir,
		FSRoot:           stateDir,
		Shell:            "bash",
		Config:           cfg,
		RunMaxWallTime:   6 * time.Second,
		RunIdleTimeout:   6 * time.Second,
		PersistOpTimeout: 2 * time.Second,
		ResolveProviderAPIKey: func(string) (string, bool, error) {
			return "sk-test", true, nil
		},
	})
	if err != nil {
		t.Fatalf("ai.NewService: %v", err)
	}
	t.Cleanup(func() {
		_ = aiSvc.CancelThread(&meta, threadIDForCleanup)
		_ = aiSvc.Close()
	})

	dist := fstest.MapFS{
		"env/index.html": {Data: []byte("<html>env</html>")},
		"inject.js":      {Data: []byte("console.log('inject');")},
	}
	gw, err := New(Options{
		Logger:             logger,
		Backend:            &stubBackend{},
		DistFS:             dist,
		ListenAddr:         "127.0.0.1:0",
		ConfigPath:         writeTestConfigWithAI(t),
		ResolveSessionMeta: resolveMeta,
		AI:                 aiSvc,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	ctx := context.Background()
	thread, err := aiSvc.CreateThread(ctx, &meta, "queued turn thread", "", "", "")
	if err != nil {
		t.Fatalf("CreateThread: %v", err)
	}
	threadIDForCleanup = thread.ThreadID

	err = aiSvc.StartRunDetached(&meta, "run_gateway_active", ai.RunStartRequest{
		ThreadID: thread.ThreadID,
		Model:    "openai/gpt-5-mini",
		Input: ai.RunInput{
			Text: "keep this run active briefly",
		},
		Options: ai.RunOptions{MaxSteps: 1},
	})
	if err != nil {
		t.Fatalf("StartRunDetached: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if aiSvc.HasActiveThreadForEndpoint(meta.EndpointID, thread.ThreadID) {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !aiSvc.HasActiveThreadForEndpoint(meta.EndpointID, thread.ThreadID) {
		t.Fatalf("active run did not start in time")
	}

	queuedResp, err := aiSvc.SendUserTurn(ctx, &meta, ai.SendUserTurnRequest{
		ThreadID: thread.ThreadID,
		Model:    "openai/gpt-5-mini",
		Input: ai.RunInput{
			MessageID: "m_gateway_queue_1",
			Text:      "queued via gateway test",
		},
		Options: ai.RunOptions{MaxSteps: 1},
	})
	if err != nil {
		t.Fatalf("SendUserTurn: %v", err)
	}
	if queuedResp.Kind != "queued" {
		t.Fatalf("queuedResp.Kind=%q, want queued", queuedResp.Kind)
	}
	queueID := strings.TrimSpace(queuedResp.QueueID)
	if queueID == "" {
		t.Fatalf("queueID is empty")
	}

	{
		req := httptest.NewRequest(http.MethodGet, "/_redeven_proxy/api/ai/threads/"+thread.ThreadID+"/queued_turns", nil)
		req.Header.Set("Origin", envOrigin)
		rr := httptest.NewRecorder()
		gw.serveHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("list queued turns status=%d body=%s", rr.Code, rr.Body.String())
		}
		var resp struct {
			OK   bool `json:"ok"`
			Data struct {
				QueuedTurns []struct {
					QueueID string `json:"queue_id"`
					Text    string `json:"text"`
				} `json:"queued_turns"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal list queued turns: %v", err)
		}
		if !resp.OK || len(resp.Data.QueuedTurns) != 1 {
			t.Fatalf("unexpected queued turns response: %s", rr.Body.String())
		}
		if resp.Data.QueuedTurns[0].QueueID != queueID {
			t.Fatalf("queue_id=%q, want %q", resp.Data.QueuedTurns[0].QueueID, queueID)
		}
		if resp.Data.QueuedTurns[0].Text != "queued via gateway test" {
			t.Fatalf("text=%q, want queued via gateway test", resp.Data.QueuedTurns[0].Text)
		}
	}

	{
		req := httptest.NewRequest(http.MethodGet, "/_redeven_proxy/api/ai/threads/"+thread.ThreadID, nil)
		req.Header.Set("Origin", envOrigin)
		rr := httptest.NewRecorder()
		gw.serveHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("get thread status=%d body=%s", rr.Code, rr.Body.String())
		}
		var resp struct {
			OK   bool `json:"ok"`
			Data struct {
				Thread struct {
					QueuedTurnCount int `json:"queued_turn_count"`
				} `json:"thread"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal get thread: %v", err)
		}
		if resp.Data.Thread.QueuedTurnCount != 1 {
			t.Fatalf("queued_turn_count=%d, want 1", resp.Data.Thread.QueuedTurnCount)
		}
	}

	{
		body := bytes.NewBufferString(`{"text":"edited queued text"}`)
		req := httptest.NewRequest(http.MethodPatch, "/_redeven_proxy/api/ai/threads/"+thread.ThreadID+"/queued_turns/"+queueID, body)
		req.Header.Set("Origin", envOrigin)
		rr := httptest.NewRecorder()
		gw.serveHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("patch queued turn status=%d body=%s", rr.Code, rr.Body.String())
		}
	}

	{
		req := httptest.NewRequest(http.MethodGet, "/_redeven_proxy/api/ai/threads/"+thread.ThreadID+"/queued_turns", nil)
		req.Header.Set("Origin", envOrigin)
		rr := httptest.NewRecorder()
		gw.serveHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("list queued turns after patch status=%d body=%s", rr.Code, rr.Body.String())
		}
		var resp struct {
			Data struct {
				QueuedTurns []struct {
					Text string `json:"text"`
				} `json:"queued_turns"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal list queued turns after patch: %v", err)
		}
		if len(resp.Data.QueuedTurns) != 1 || resp.Data.QueuedTurns[0].Text != "edited queued text" {
			t.Fatalf("unexpected patched queued turns response: %s", rr.Body.String())
		}
	}

	{
		req := httptest.NewRequest(http.MethodDelete, "/_redeven_proxy/api/ai/threads/"+thread.ThreadID+"/queued_turns/"+queueID, nil)
		req.Header.Set("Origin", envOrigin)
		rr := httptest.NewRecorder()
		gw.serveHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("delete queued turn status=%d body=%s", rr.Code, rr.Body.String())
		}
	}

	{
		req := httptest.NewRequest(http.MethodGet, "/_redeven_proxy/api/ai/threads/"+thread.ThreadID, nil)
		req.Header.Set("Origin", envOrigin)
		rr := httptest.NewRecorder()
		gw.serveHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("get thread after delete status=%d body=%s", rr.Code, rr.Body.String())
		}
		var resp struct {
			Data struct {
				Thread struct {
					QueuedTurnCount int `json:"queued_turn_count"`
				} `json:"thread"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal get thread after delete: %v", err)
		}
		if resp.Data.Thread.QueuedTurnCount != 0 {
			t.Fatalf("queued_turn_count=%d, want 0", resp.Data.Thread.QueuedTurnCount)
		}
	}
}
