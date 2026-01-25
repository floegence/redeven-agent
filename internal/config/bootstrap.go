package config

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	directv1 "github.com/floegence/flowersec/flowersec-go/gen/flowersec/direct/v1"
)

type BootstrapArgs struct {
	ControlplaneBaseURL string
	EnvironmentID       string
	EnvironmentToken    string

	ConfigPath string

	RootDir   string
	Shell     string
	LogFormat string
	LogLevel  string
}

type bootstrapResponse struct {
	Direct *directv1.DirectConnectInfo `json:"direct"`
}

func BootstrapConfig(ctx context.Context, args BootstrapArgs) (writtenPath string, err error) {
	baseURL := strings.TrimSpace(args.ControlplaneBaseURL)
	envID := strings.TrimSpace(args.EnvironmentID)
	envToken := strings.TrimSpace(args.EnvironmentToken)
	cfgPath := strings.TrimSpace(args.ConfigPath)
	if cfgPath == "" {
		cfgPath = DefaultConfigPath()
	}

	if baseURL == "" || envID == "" || envToken == "" {
		return "", errors.New("missing controlplane/env-id/env-token")
	}

	// Load previous config if present to preserve stable agent_instance_id.
	var prev *Config
	if c, loadErr := Load(cfgPath); loadErr == nil {
		prev = c
	}

	direct, err := fetchBootstrap(ctx, baseURL, envID, envToken)
	if err != nil {
		return "", err
	}
	if direct == nil || strings.TrimSpace(direct.WsUrl) == "" {
		return "", errors.New("invalid bootstrap response: missing direct.ws_url")
	}

	agentInstanceID := ""
	if prev != nil {
		agentInstanceID = strings.TrimSpace(prev.AgentInstanceID)
	}
	if agentInstanceID == "" {
		agentInstanceID, err = newAgentInstanceID()
		if err != nil {
			return "", err
		}
	}

	cfg := &Config{
		ControlplaneBaseURL: baseURL,
		EnvironmentID:       envID,
		AgentInstanceID:     agentInstanceID,
		Direct:              direct,
		RootDir:             strings.TrimSpace(args.RootDir),
		Shell:               strings.TrimSpace(args.Shell),
		LogFormat:           strings.TrimSpace(args.LogFormat),
		LogLevel:            strings.TrimSpace(args.LogLevel),
	}

	if err := Save(cfgPath, cfg); err != nil {
		return "", err
	}
	return filepath.Clean(cfgPath), nil
}

func fetchBootstrap(ctx context.Context, baseURL string, envID string, envToken string) (*directv1.DirectConnectInfo, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return nil, fmt.Errorf("invalid controlplane url: %w", err)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/srv/v1/environments/" + url.PathEscape(envID) + "/agent/bootstrap"
	u.RawQuery = ""

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+envToken)

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bootstrap failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out bootstrapResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("invalid bootstrap json: %w", err)
	}
	if out.Direct == nil {
		return nil, errors.New("invalid bootstrap response: missing direct")
	}
	return out.Direct, nil
}

func newAgentInstanceID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	// Prefix keeps the value self-descriptive in logs and debugging tools.
	return "ai_" + base64.RawURLEncoding.EncodeToString(b), nil
}
