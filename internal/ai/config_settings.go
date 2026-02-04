package ai

import (
	"errors"
	"strings"

	"github.com/floegence/redeven-agent/internal/config"
)

type ConfigView struct {
	ConfigPath string           `json:"config_path"`
	Enabled    bool             `json:"enabled"`
	AI         *config.AIConfig `json:"ai"`
}

func (s *Service) GetConfig() ConfigView {
	if s == nil {
		return ConfigView{Enabled: false}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path := strings.TrimSpace(s.configPath)
	return ConfigView{
		ConfigPath: path,
		Enabled:    s.cfg != nil,
		AI:         s.cfg,
	}
}

func (s *Service) UpdateConfig(aiCfg *config.AIConfig) (ConfigView, error) {
	if s == nil {
		return ConfigView{}, errors.New("nil service")
	}
	if aiCfg != nil {
		if err := aiCfg.Validate(); err != nil {
			return ConfigView{}, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.activeRunByChan) > 0 {
		return ConfigView{}, ErrConfigLocked
	}

	path := strings.TrimSpace(s.configPath)
	if path == "" {
		return ConfigView{}, errors.New("missing config_path")
	}

	cfg, err := config.Load(path)
	if err != nil {
		return ConfigView{}, err
	}
	cfg.AI = aiCfg
	if err := config.Save(path, cfg); err != nil {
		return ConfigView{}, err
	}

	// Hot-reload.
	s.cfg = aiCfg

	return ConfigView{
		ConfigPath: path,
		Enabled:    aiCfg != nil,
		AI:         aiCfg,
	}, nil
}
