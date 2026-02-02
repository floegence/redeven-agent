import type {
  TerminalDataChunk,
  TerminalDataEvent,
  TerminalEventSource,
  TerminalSessionInfo,
  TerminalTransport,
} from '@floegence/floeterm-terminal-web';
import { TypeIds } from './typeIds';

// Terminal RPC payload/response must use snake_case.
// This file adapts Flowersec RPC to the floeterm-terminal-web transport interfaces.

export function getOrCreateTerminalConnId(storageKey = 'redeven_terminal_conn_id'): string {
  const existing = sessionStorage.getItem(storageKey);
  if (existing && existing.trim()) return existing.trim();

  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `web_${(crypto as Crypto).randomUUID()}`
    : `web_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

  sessionStorage.setItem(storageKey, id);
  return id;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    bin += String.fromCharCode(...chunk);
  }
  return btoa(bin);
}

export function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

type rpc_client_like = {
  rpc: {
    call: (typeId: number, payload: unknown) => Promise<{ payload: unknown; error?: { code: number; message?: string } }>;
    notify: (typeId: number, payload: unknown) => Promise<void> | void;
    onNotify: (typeId: number, handler: (payload: any) => void) => () => void;
  };
};

type protocol_like = { client: () => rpc_client_like | null };

type terminal_session_info = {
  id: string;
  name: string;
  working_dir: string;
  created_at_ms: number;
  last_active_at_ms: number;
  is_active: boolean;
};

type terminal_output_notify = {
  session_id: string;
  data_b64: string;
  sequence?: number;
  timestamp_ms?: number;
  echo_of_input?: boolean;
  original_source?: string;
};

type terminal_name_update_notify = {
  session_id: string;
  new_name: string;
  working_dir: string;
};

type terminal_history_req = { session_id: string; start_seq: number; end_seq: number };
type terminal_history_resp = { chunks: Array<{ sequence: number; data_b64: string; timestamp_ms: number }> };

type terminal_clear_req = { session_id: string };
type terminal_clear_resp = { ok: boolean };

type terminal_attach_req = { session_id: string; conn_id: string; cols: number; rows: number };
type terminal_attach_resp = { ok: boolean };

type terminal_create_req = { name?: string; working_dir?: string; cols: number; rows: number };
type terminal_create_resp = { session: terminal_session_info };

type terminal_list_resp = { sessions: terminal_session_info[] };

type terminal_delete_req = { session_id: string };
type terminal_delete_resp = { ok: boolean };

type terminal_session_stats_req = { session_id: string };
type terminal_session_stats_resp = { history: { total_bytes: number } };

export type TerminalSessionStats = { history: { totalBytes: number } };

export type RedevenTerminalTransport = TerminalTransport & {
  getSessionStats: (sessionId: string) => Promise<TerminalSessionStats>;
};

function toTerminalSessionInfo(s: terminal_session_info): TerminalSessionInfo {
  return {
    id: String(s.id ?? ''),
    name: String(s.name ?? ''),
    workingDir: String(s.working_dir ?? ''),
    createdAtMs: Number(s.created_at_ms ?? 0),
    lastActiveAtMs: Number(s.last_active_at_ms ?? 0),
    isActive: Boolean(s.is_active ?? false),
  };
}

async function rpcCall<T>(client: rpc_client_like, typeId: number, payload: unknown): Promise<T> {
  const resp = await client.rpc.call(typeId, payload);
  if (resp?.error) {
    const code = resp.error.code ?? 500;
    const msg = resp.error.message ?? `RPC error: ${code}`;
    throw new Error(msg);
  }
  return resp.payload as T;
}

export function createFlowersecTerminalEventSource(protocol: protocol_like): TerminalEventSource {
  return {
    onTerminalData: (sessionId, handler) => {
      const client = protocol.client();
      if (!client) return () => {};

      return client.rpc.onNotify(TypeIds.TerminalOutput, (payload: terminal_output_notify) => {
        if (!payload || String(payload.session_id ?? '') !== sessionId) return;
        const b64 = String(payload.data_b64 ?? '');
        if (!b64) return;

        const event: TerminalDataEvent = {
          sessionId,
          data: bytesFromB64(b64),
          sequence: typeof payload.sequence === 'number' ? payload.sequence : undefined,
          timestampMs: typeof payload.timestamp_ms === 'number' ? payload.timestamp_ms : undefined,
          echoOfInput: typeof payload.echo_of_input === 'boolean' ? payload.echo_of_input : undefined,
          originalSource: typeof payload.original_source === 'string' ? payload.original_source : undefined,
        };
        handler(event);
      });
    },

    onTerminalNameUpdate: (sessionId, handler) => {
      const client = protocol.client();
      if (!client) return () => {};

      return client.rpc.onNotify(TypeIds.TerminalNameUpdate, (payload: terminal_name_update_notify) => {
        if (!payload || String(payload.session_id ?? '') !== sessionId) return;
        handler({
          sessionId,
          newName: String(payload.new_name ?? ''),
          workingDir: String(payload.working_dir ?? ''),
        });
      });
    },
  };
}

export function createFlowersecTerminalTransport(protocol: protocol_like, connId: string): RedevenTerminalTransport {
  return {
    attach: async (sessionId, cols, rows) => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');
      const _ = await rpcCall<terminal_attach_resp>(client, TypeIds.TerminalSessionAttach, {
        session_id: sessionId,
        conn_id: connId,
        cols,
        rows,
      } satisfies terminal_attach_req);
    },
    resize: async (sessionId, cols, rows) => {
      const client = protocol.client();
      if (!client) return;
      await client.rpc.notify(TypeIds.TerminalResize, { session_id: sessionId, conn_id: connId, cols, rows });
    },
    sendInput: async (sessionId, input, sourceConnId) => {
      const client = protocol.client();
      if (!client) return;
      const bytes = new TextEncoder().encode(String(input ?? ''));
      if (bytes.length === 0) return;
      const cid = String(sourceConnId ?? connId);
      await client.rpc.notify(TypeIds.TerminalInput, { session_id: sessionId, conn_id: cid, data_b64: bytesToB64(bytes) });
    },
    history: async (sessionId, startSeq, endSeq) => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');

      const resp = await rpcCall<terminal_history_resp>(client, TypeIds.TerminalHistory, {
        session_id: sessionId,
        start_seq: startSeq,
        end_seq: endSeq,
      } satisfies terminal_history_req);

      const chunks = Array.isArray(resp?.chunks) ? resp.chunks : [];
      const out: TerminalDataChunk[] = [];
      for (const c of chunks) {
        const b64 = String(c?.data_b64 ?? '');
        if (!b64) continue;
        out.push({
          sequence: Number(c.sequence ?? 0),
          timestampMs: Number(c.timestamp_ms ?? 0),
          data: bytesFromB64(b64),
        });
      }
      return out;
    },
    clear: async (sessionId) => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');
      const _ = await rpcCall<terminal_clear_resp>(client, TypeIds.TerminalClear, { session_id: sessionId } satisfies terminal_clear_req);
    },

    listSessions: async () => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');
      const resp = await rpcCall<terminal_list_resp>(client, TypeIds.TerminalSessionList, {});
      const sessions = Array.isArray(resp?.sessions) ? resp.sessions : [];
      return sessions.map(toTerminalSessionInfo).filter(s => s.id);
    },
    createSession: async (name, workingDir, cols, rows) => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');

      const payload = await rpcCall<terminal_create_resp>(client, TypeIds.TerminalSessionCreate, {
        name: name?.trim() ? name.trim() : undefined,
        working_dir: workingDir?.trim() ? workingDir.trim() : undefined,
        cols: typeof cols === 'number' ? cols : 80,
        rows: typeof rows === 'number' ? rows : 24,
      } satisfies terminal_create_req);

      return toTerminalSessionInfo(payload.session);
    },

    deleteSession: async (sessionId) => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');
      const _ = await rpcCall<terminal_delete_resp>(client, TypeIds.TerminalSessionDelete, { session_id: sessionId } satisfies terminal_delete_req);
    },

    getSessionStats: async (sessionId) => {
      const client = protocol.client();
      if (!client) throw new Error('Not connected');

      const resp = await rpcCall<terminal_session_stats_resp>(client, TypeIds.TerminalSessionStats, {
        session_id: sessionId,
      } satisfies terminal_session_stats_req);

      const totalBytes = Number(resp?.history?.total_bytes ?? 0);
      return { history: { totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : 0 } };
    },
  };
}
