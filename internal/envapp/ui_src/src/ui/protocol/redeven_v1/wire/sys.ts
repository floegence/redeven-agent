export type wire_sys_ping_req = Record<string, never>;

export type wire_sys_ping_resp = {
  server_time_ms: number;
  agent_instance_id?: string;
  version?: string;
  commit?: string;
  build_time?: string;
};

