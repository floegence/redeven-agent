package agent

import "github.com/floegence/redeven-agent/internal/codeapp/gateway"

func (a *Agent) CodeGateway() *gateway.Gateway {
	if a == nil || a.code == nil {
		return nil
	}
	return a.code.Gateway()
}
