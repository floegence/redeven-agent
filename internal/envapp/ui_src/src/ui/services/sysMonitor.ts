import { TypeIds } from './typeIds';

// System monitor RPC. Payload/response must use snake_case to match the agent contract.

type rpc_client_like = {
  rpc: {
    call: (typeId: number, payload: unknown) => Promise<{ payload: unknown; error?: { code: number; message?: string } }>;
  };
};

type protocol_like = { client: () => rpc_client_like | null };

export type SysMonitorSortBy = 'cpu' | 'memory';

export type SysMonitorProcessInfo = {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_bytes: number;
  username: string;
};

export type SysMonitorSnapshot = {
  cpu_usage: number;
  cpu_cores: number;
  load_average?: number[];
  network_bytes_received: number;
  network_bytes_sent: number;
  network_speed_received: number;
  network_speed_sent: number;
  platform: string;
  processes: SysMonitorProcessInfo[];
  timestamp_ms: number;
};

export async function getSysMonitor(protocol: protocol_like, opts: { sortBy?: SysMonitorSortBy } = {}): Promise<SysMonitorSnapshot> {
  const client = protocol.client();
  if (!client) throw new Error('Not connected');

  const resp = await client.rpc.call(TypeIds.SysMonitor, {
    sort_by: opts.sortBy ?? 'cpu',
  });

  if (resp?.error) {
    const code = resp.error.code ?? 500;
    const msg = resp.error.message ?? `RPC error: ${code}`;
    throw new Error(msg);
  }

  return resp.payload as SysMonitorSnapshot;
}
