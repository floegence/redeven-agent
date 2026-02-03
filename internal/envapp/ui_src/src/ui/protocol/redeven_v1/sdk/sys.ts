export type SysPingResponse = {
  serverTimeMs: number;
  agentInstanceId?: string;
  version?: string;
  commit?: string;
  buildTime?: string;
};

