import { For, Show, createResource, createSignal } from 'solid-js';
import { Button, Input, LoadingOverlay, Panel, PanelContent } from '@floegence/floe-webapp-core';
import { getEnvPublicIDFromSession, mintEnvEntryTicketForApp } from '../services/controlplaneApi';
import { registerSandboxWindow } from '../services/sandboxWindowRegistry';

type SpaceStatus = Readonly<{
  code_space_id: string;
  workspace_path: string;
  code_port: number;
  created_at_unix_ms: number;
  updated_at_unix_ms: number;
  last_opened_at_unix_ms: number;
  running: boolean;
  pid: number;
}>;

type GatewayResp<T> = Readonly<{ ok: boolean; error?: string; data?: T }>;

const FLOE_APP_CODE = 'com.floegence.redeven.code';

async function fetchGatewayJSON<T>(url: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const resp = await fetch(url, { ...init, headers, credentials: 'omit', cache: 'no-store' });
  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`);
  if (data?.ok === false) throw new Error(String(data?.error ?? 'Request failed'));
  return (data?.data ?? data) as T;
}

function fmtTime(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function codespaceOrigin(codeSpaceID: string): string {
  const scheme = window.location.protocol;
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port ? `:${window.location.port}` : '';
  const parts = host.split('.');
  // env-<env_id>.<rest>
  const restHost = parts.slice(1).join('.') || host;
  return `${scheme}//cs-${codeSpaceID}.${restHost}${port}`;
}

function base64UrlEncode(raw: string): string {
  const b64 = btoa(raw);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function openCodespace(codeSpaceID: string, setStatus: (s: string) => void): Promise<void> {
  const envPublicID = getEnvPublicIDFromSession();
  if (!envPublicID) throw new Error('Missing env context. Please reopen from the Redeven Portal.');

  const origin = codespaceOrigin(codeSpaceID);
  const bootURL = `${origin}/_redeven_boot/`;

  // Important: open in the synchronous click stack to avoid popup blocking.
  const win = window.open('about:blank', `redeven_codespace_${codeSpaceID}`);
  if (!win) throw new Error('Popup was blocked. Please allow popups and try again.');

  // Register for refresh-recover handshake (codespace window -> opener Env App).
  registerSandboxWindow(win, { origin, floe_app: FLOE_APP_CODE, code_space_id: codeSpaceID, app_path: '/' });

  try {
    setStatus('Requesting entry ticket...');
    const entryTicket = await mintEnvEntryTicketForApp({ envId: envPublicID, floeApp: FLOE_APP_CODE, codeSpaceId: codeSpaceID });

    const init = {
      v: 1,
      env_public_id: envPublicID,
      floe_app: FLOE_APP_CODE,
      code_space_id: codeSpaceID,
      app_path: '/',
      entry_ticket: entryTicket,
    };
    const encoded = base64UrlEncode(JSON.stringify(init));

    setStatus('Opening...');
    win.location.assign(`${bootURL}#redeven=${encoded}`);
  } catch (e) {
    try {
      win.close();
    } catch {
      // ignore
    }
    throw e;
  }
}

export function EnvCodespacesPage() {
  const [createId, setCreateId] = createSignal('');
  const [createPath, setCreatePath] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [busyId, setBusyId] = createSignal<string | null>(null);

  const [spaces, { refetch }] = createResource<SpaceStatus[]>(async () => {
    const out = await fetchGatewayJSON<GatewayResp<{ spaces: SpaceStatus[] }>>('/_redeven_proxy/api/spaces', { method: 'GET' });
    const list = out?.data?.spaces;
    return Array.isArray(list) ? list : [];
  });

  const create = async () => {
    setError(null);
    setStatus('Creating...');
    try {
      await fetchGatewayJSON<GatewayResp<SpaceStatus>>('/_redeven_proxy/api/spaces', {
        method: 'POST',
        body: JSON.stringify({
          code_space_id: createId().trim() || undefined,
          workspace_path: createPath().trim() || undefined,
        }),
      });
      setCreateId('');
      setCreatePath('');
      await refetch();
      setStatus('');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = async (id: string) => {
    setBusyId(id);
    setError(null);
    setStatus('Starting...');
    try {
      await fetchGatewayJSON<GatewayResp<SpaceStatus>>(`/_redeven_proxy/api/spaces/${encodeURIComponent(id)}/start`, { method: 'POST' });
      await refetch();
      setStatus('');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const stop = async (id: string) => {
    setBusyId(id);
    setError(null);
    setStatus('Stopping...');
    try {
      await fetchGatewayJSON<GatewayResp<void>>(`/_redeven_proxy/api/spaces/${encodeURIComponent(id)}/stop`, { method: 'POST' });
      await refetch();
      setStatus('');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const del = async (id: string) => {
    if (!window.confirm(`Delete codespace "${id}"?\n\nThis will remove the entire local directory under the agent state directory.`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    setStatus('Deleting...');
    try {
      await fetchGatewayJSON<GatewayResp<void>>(`/_redeven_proxy/api/spaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refetch();
      setStatus('');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const open = async (id: string) => {
    setBusyId(id);
    setError(null);
    setStatus('');
    try {
      await openCodespace(id, (s) => setStatus(s));
      setStatus('');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div class="h-full min-h-0 overflow-auto space-y-3">
      <Panel class="border border-border rounded-md overflow-hidden">
        <PanelContent class="p-4 space-y-3">
          <div class="space-y-1">
            <div class="text-sm font-semibold">Codespaces</div>
            <div class="text-xs text-muted-foreground">Create and open local code-server instances (stored on your machine).</div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input value={createId()} onInput={(e) => setCreateId(e.currentTarget.value)} placeholder="Codespace id (optional)" size="sm" />
            <Input value={createPath()} onInput={(e) => setCreatePath(e.currentTarget.value)} placeholder="Workspace path (optional)" size="sm" />
            <div class="flex gap-2">
              <Button size="sm" variant="default" onClick={() => void create()} disabled={spaces.loading}>
                Create
              </Button>
              <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={spaces.loading}>
                Refresh
              </Button>
            </div>
          </div>

          <Show when={error()}>
            <div class="text-xs text-error break-words">{error()}</div>
          </Show>
          <Show when={status()}>
            <div class="text-xs text-muted-foreground">{status()}</div>
          </Show>

          <div class="relative" style={{ 'min-height': '96px' }}>
            <LoadingOverlay visible={spaces.loading} message="Loading codespaces..." />
            <Show when={!spaces.loading}>
              <Show when={(spaces() ?? []).length > 0} fallback={<div class="text-xs text-muted-foreground">No codespaces.</div>}>
                <table class="w-full text-xs">
                  <thead class="text-muted-foreground">
                    <tr class="text-left">
                      <th class="py-2 pr-2">Codespace</th>
                      <th class="py-2 pr-2">Workspace path</th>
                      <th class="py-2 pr-2">Status</th>
                      <th class="py-2 pr-2">Port</th>
                      <th class="py-2 pr-2">Last opened</th>
                      <th class="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={spaces() ?? []}>
                      {(s) => (
                        <tr class="border-t border-border/60">
                          <td class="py-2 pr-2 font-mono whitespace-nowrap">{s.code_space_id}</td>
                          <td class="py-2 pr-2 font-mono truncate max-w-[320px]" title={s.workspace_path}>
                            {s.workspace_path}
                          </td>
                          <td class="py-2 pr-2 whitespace-nowrap">{s.running ? `running (pid ${s.pid})` : 'stopped'}</td>
                          <td class="py-2 pr-2 font-mono whitespace-nowrap">{s.code_port || ''}</td>
                          <td class="py-2 pr-2 whitespace-nowrap">{fmtTime(s.last_opened_at_unix_ms)}</td>
                          <td class="py-2">
                            <div class="flex flex-wrap gap-2">
                              <Button size="sm" variant="default" disabled={busyId() === s.code_space_id} onClick={() => void open(s.code_space_id)}>
                                Open
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyId() === s.code_space_id} onClick={() => void start(s.code_space_id)}>
                                Start
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyId() === s.code_space_id} onClick={() => void stop(s.code_space_id)}>
                                Stop
                              </Button>
                              <Button size="sm" variant="destructive" disabled={busyId() === s.code_space_id} onClick={() => void del(s.code_space_id)}>
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </Show>
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
