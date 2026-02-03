package sys

import (
	"context"
	"strings"
	"time"

	"github.com/floegence/flowersec/flowersec-go/rpc"
	rpctyped "github.com/floegence/flowersec/flowersec-go/rpc/typed"
	"github.com/floegence/redeven-agent/internal/session"
)

const (
	// TypeID_SYS_PING is a lightweight, side-effect-free health check RPC for Env App.
	//
	// NOTE: The type_id must match Env App: internal/envapp/ui_src/src/ui/protocol/redeven_v1/typeIds.ts.
	TypeID_SYS_PING uint32 = 4001
)

type Options struct {
	AgentInstanceID string
	Version         string
	Commit          string
	BuildTime       string
}

type Service struct {
	agentInstanceID string
	version         string
	commit          string
	buildTime       string
}

func NewService(opts Options) *Service {
	return &Service{
		agentInstanceID: strings.TrimSpace(opts.AgentInstanceID),
		version:         strings.TrimSpace(opts.Version),
		commit:          strings.TrimSpace(opts.Commit),
		buildTime:       strings.TrimSpace(opts.BuildTime),
	}
}

func (s *Service) Register(r *rpc.Router, _meta *session.Meta) {
	if s == nil || r == nil {
		return
	}

	rpctyped.Register[pingReq, pingResp](r, TypeID_SYS_PING, func(_ctx context.Context, _ *pingReq) (*pingResp, error) {
		return &pingResp{
			ServerTimeMs:    time.Now().UnixMilli(),
			AgentInstanceID: s.agentInstanceID,
			Version:         s.version,
			Commit:          s.commit,
			BuildTime:       s.buildTime,
		}, nil
	})
}

type pingReq struct{}

type pingResp struct {
	ServerTimeMs    int64  `json:"server_time_ms,omitempty"`
	AgentInstanceID string `json:"agent_instance_id,omitempty"`
	Version         string `json:"version,omitempty"`
	Commit          string `json:"commit,omitempty"`
	BuildTime       string `json:"build_time,omitempty"`
}
