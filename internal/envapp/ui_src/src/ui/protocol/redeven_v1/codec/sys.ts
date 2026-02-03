import type { SysPingResponse } from '../sdk/sys';
import type { wire_sys_ping_resp } from '../wire/sys';

export function fromWireSysPingResponse(resp: wire_sys_ping_resp): SysPingResponse {
  return {
    serverTimeMs: Number(resp?.server_time_ms ?? 0),
    agentInstanceId: resp?.agent_instance_id ? String(resp.agent_instance_id) : undefined,
    version: resp?.version ? String(resp.version) : undefined,
    commit: resp?.commit ? String(resp.commit) : undefined,
    buildTime: resp?.build_time ? String(resp.build_time) : undefined,
  };
}

