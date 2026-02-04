import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { useNotification } from '@floegence/floe-webapp-core';
import { Globe, RefreshIcon, Trash } from '@floegence/floe-webapp-core/icons';
import { Panel, PanelContent } from '@floegence/floe-webapp-core/layout';
import { LoadingOverlay } from '@floegence/floe-webapp-core/loading';
import { Button, Card, ConfirmDialog, Dialog, Input } from '@floegence/floe-webapp-core/ui';

import { getEnvironmentFloeApps, getEnvPublicIDFromSession, mintEnvEntryTicketForApp, type EnvFloeApp } from '../services/controlplaneApi';
import { fetchGatewayJSON } from '../services/gatewayApi';
import { registerSandboxWindow } from '../services/sandboxWindowRegistry';
import { useEnvContext } from './EnvContext';

type Health = Readonly<{
  status: 'healthy' | 'unreachable' | 'unknown';
  last_checked_at_unix_ms: number;
  latency_ms: number;
  last_error: string;
}>;

type PortForward = Readonly<{
  forward_id: string;
  target_url: string;
  name: string;
  description: string;
  health_path: string;
  insecure_skip_verify: boolean;
  created_at_unix_ms: number;
  updated_at_unix_ms: number;
  last_opened_at_unix_ms: number;
  health: Health;
}>;

const FLOE_APP_PORT_FORWARD = 'com.floegence.redeven.portforward';

function fmtRelativeTime(ms: number): string {
  if (!ms) return 'Never';
  try {
    const now = Date.now();
    const diff = now - ms;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  } catch {
    return String(ms);
  }
}

function portForwardOrigin(forwardID: string): string {
  const scheme = window.location.protocol;
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port ? `:${window.location.port}` : '';
  const parts = host.split('.');
  const restHost = parts.slice(1).join('.') || host;
  return `${scheme}//pf-${forwardID}.${restHost}${port}`;
}

function base64UrlEncode(raw: string): string {
  const b64 = btoa(raw);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function healthBadgeClass(status: Health['status']): string {
  switch (status) {
    case 'healthy':
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'unreachable':
      return 'text-destructive bg-destructive/10 border-destructive/20';
    default:
      return 'text-muted-foreground bg-muted/30 border-border';
  }
}

function healthLabel(status: Health['status']): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'unreachable':
      return 'Unreachable';
    default:
      return 'Unknown';
  }
}

async function openPortForward(forwardID: string, setStatus: (s: string) => void): Promise<void> {
  const envPublicID = getEnvPublicIDFromSession();
  if (!envPublicID) throw new Error('Missing env context. Please reopen from the Redeven Portal.');

  const origin = portForwardOrigin(forwardID);
  const bootURL = `${origin}/_redeven_boot/?env=${encodeURIComponent(envPublicID)}`;

  const win = window.open('about:blank', `redeven_portforward_${forwardID}`);
  if (!win) throw new Error('Popup was blocked. Please allow popups and try again.');

  registerSandboxWindow(win, { origin, floe_app: FLOE_APP_PORT_FORWARD, code_space_id: forwardID, app_path: '/' });

  try {
    setStatus('Updating forward...');
    await fetchGatewayJSON(`/_redeven_proxy/api/forwards/${encodeURIComponent(forwardID)}/touch`, { method: 'POST' });

    setStatus('Requesting entry ticket...');
    const entryTicket = await mintEnvEntryTicketForApp({ envId: envPublicID, floeApp: FLOE_APP_PORT_FORWARD, codeSpaceId: forwardID });

    const init = {
      v: 1,
      env_public_id: envPublicID,
      floe_app: FLOE_APP_PORT_FORWARD,
      code_space_id: forwardID,
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

export function EnvPortForwardsPage() {
  const ctx = useEnvContext();
  const notify = useNotification();

  const permissionReady = () => ctx.env.state === 'ready';
  const canExecute = () => Boolean(ctx.env()?.permissions?.can_execute);
  const canAdmin = () => Boolean(ctx.env()?.permissions?.can_admin);

  const [apps, { refetch: refetchApps }] = createResource<EnvFloeApp[], string>(() => ctx.env_id(), (id) => getEnvironmentFloeApps(id));
  const portForwardEnabled = createMemo(() => {
    const list = apps() ?? [];
    const pf = list.find((a) => String(a?.app_id ?? '').trim() === FLOE_APP_PORT_FORWARD);
    return Boolean(pf?.enabled);
  });

  const [refreshSeq, setRefreshSeq] = createSignal(0);
  const bumpRefresh = () => setRefreshSeq((n) => n + 1);

  const [forwards] = createResource<PortForward[], number | null>(
    () => {
      if (!permissionReady()) return null;
      if (!canExecute()) return null;
      return refreshSeq();
    },
    async () => {
      const out = await fetchGatewayJSON<{ forwards: PortForward[] }>(`/_redeven_proxy/api/forwards`, { method: 'GET' });
      return Array.isArray(out?.forwards) ? out.forwards : [];
    },
  );

  const [busyID, setBusyID] = createSignal<string | null>(null);
  const [busyText, setBusyText] = createSignal<string>('');

  const [createOpen, setCreateOpen] = createSignal(false);
  const [createTarget, setCreateTarget] = createSignal('');
  const [createName, setCreateName] = createSignal('');
  const [createDescription, setCreateDescription] = createSignal('');

  const [deleteID, setDeleteID] = createSignal<string | null>(null);
  const [deleting, setDeleting] = createSignal(false);

  const resetCreate = () => {
    setCreateTarget('');
    setCreateName('');
    setCreateDescription('');
  };

  const doCreate = async () => {
    const target = createTarget().trim();
    if (!target) {
      notify.error('Missing target', 'Please enter a target like localhost:3000.');
      return;
    }
    try {
      setBusyID('__create__');
      setBusyText('Creating...');
      await fetchGatewayJSON(`/_redeven_proxy/api/forwards`, {
        method: 'POST',
        body: JSON.stringify({
          target,
          name: createName().trim(),
          description: createDescription().trim(),
        }),
      });
      setCreateOpen(false);
      resetCreate();
      bumpRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error('Failed to create forward', msg);
    } finally {
      setBusyID(null);
      setBusyText('');
    }
  };

  const doDelete = async (id: string) => {
    const fid = String(id ?? '').trim();
    if (!fid) return;
    try {
      setDeleting(true);
      await fetchGatewayJSON(`/_redeven_proxy/api/forwards/${encodeURIComponent(fid)}`, { method: 'DELETE' });
      bumpRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error('Failed to delete forward', msg);
    } finally {
      setDeleting(false);
      setDeleteID(null);
    }
  };

  const doOpen = async (f: PortForward) => {
    const fid = String(f?.forward_id ?? '').trim();
    if (!fid) return;
    if (busyID()) return;

    try {
      setBusyID(fid);
      setBusyText('Opening...');
      await openPortForward(fid, (s) => setBusyText(s));
      bumpRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error('Failed to open port forward', msg);
    } finally {
      setBusyID(null);
      setBusyText('');
    }
  };

  return (
    <Panel>
      <PanelContent>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-start gap-2">
            <div class="mt-0.5 text-muted-foreground">
              <Globe class="w-4 h-4" />
            </div>
            <div>
              <div class="text-base font-semibold">Port Forwards</div>
              <div class="text-xs text-muted-foreground">Forward any HTTP service reachable from the agent.</div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                bumpRefresh();
                void refetchApps();
              }}
              disabled={!!busyID() || (permissionReady() && !canExecute())}
            >
              <RefreshIcon class="w-4 h-4 mr-1" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                resetCreate();
                setCreateOpen(true);
              }}
              disabled={!!busyID() || (permissionReady() && !canExecute())}
            >
              New Forward
            </Button>
          </div>
        </div>

        <Show when={permissionReady() && !canExecute()}>
          <div class="mt-3 text-xs text-muted-foreground">Execute permission is required to manage port forwards.</div>
        </Show>

        <Show when={apps.state === 'ready' && !portForwardEnabled()}>
          <div class="mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
            <div class="text-xs text-muted-foreground">
              Port Forward is disabled for this environment. Enable it in Plugin Market to open forwards.
            </div>
            <Button size="sm" variant="outline" disabled={!canAdmin()} onClick={() => ctx.goTab('market')}>
              Plugin Market
            </Button>
          </div>
        </Show>

        <div class="mt-4">
          <Show when={forwards.error}>
            <div class="text-sm text-destructive">Failed to load forwards: {String(forwards.error)}</div>
          </Show>

          <Show
            when={forwards.state === 'ready' && (forwards()?.length ?? 0) > 0}
            fallback={
              <div class="text-sm text-muted-foreground py-12 text-center">
                <Show when={permissionReady() && canExecute()} fallback={<span>Port forwards are not available.</span>}>
                  <span>No port forwards. Create one to expose a service running on (or reachable from) the agent.</span>
                </Show>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <For each={forwards()}>
                {(f) => (
                  <Card class="h-full">
                    <div class="p-4 space-y-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="text-sm font-medium truncate">{f.name || `Forward ${f.forward_id}`}</div>
                          <div class="text-xs text-muted-foreground truncate">{f.target_url}</div>
                        </div>
                        <div
                          class={`shrink-0 px-2 py-0.5 rounded border text-[11px] ${healthBadgeClass(f.health?.status ?? 'unknown')}`}
                          title={f.health?.last_error || ''}
                        >
                          {healthLabel(f.health?.status ?? 'unknown')}
                        </div>
                      </div>

                      <Show when={f.description}>
                        <div class="text-xs text-muted-foreground line-clamp-2">{f.description}</div>
                      </Show>

                      <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <div>Last opened: {fmtRelativeTime(f.last_opened_at_unix_ms)}</div>
                        <div>
                          {f.health?.status === 'healthy' && f.health?.latency_ms ? `${f.health.latency_ms}ms` : ''}
                        </div>
                      </div>

                      <div class="flex items-center justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void doOpen(f)}
                          disabled={!portForwardEnabled() || busyID() === '__create__' || busyID() === f.forward_id}
                          title={!portForwardEnabled() ? 'Enable Port Forward in Plugin Market to open.' : ''}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteID(f.forward_id)}
                          disabled={!!busyID()}
                          title="Delete"
                        >
                          <Trash class="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </For>
            </div>
          </Show>
        </div>

        <Dialog
          open={createOpen()}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) resetCreate();
          }}
          title="Create Port Forward"
          footer={
            <div class="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)} disabled={busyID() === '__create__'}>
                Cancel
              </Button>
              <Button size="sm" variant="default" onClick={() => void doCreate()} disabled={busyID() === '__create__'}>
                Create
              </Button>
            </div>
          }
        >
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium mb-1">Target</label>
              <Input
                value={createTarget()}
                onInput={(e) => setCreateTarget(e.currentTarget.value)}
                placeholder="localhost:3000"
                size="sm"
                class="w-full"
              />
              <div class="text-[11px] text-muted-foreground mt-1">Examples: localhost:3000, 127.0.0.1:8080, https://example.com</div>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Name</label>
              <Input value={createName()} onInput={(e) => setCreateName(e.currentTarget.value)} placeholder="My Service" size="sm" class="w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Description</label>
              <Input
                value={createDescription()}
                onInput={(e) => setCreateDescription(e.currentTarget.value)}
                placeholder="Optional description"
                size="sm"
                class="w-full"
              />
            </div>
          </div>
        </Dialog>

        <ConfirmDialog
          open={!!deleteID()}
          onOpenChange={(open) => {
            if (!open) setDeleteID(null);
          }}
          title="Delete Port Forward"
          confirmText="Delete"
          variant="destructive"
          loading={deleting()}
          onConfirm={() => void doDelete(deleteID() || '')}
        >
          <div class="space-y-2">
            <p class="text-sm">Are you sure you want to delete this port forward?</p>
            <p class="text-xs text-muted-foreground">This only removes the forwarding configuration on the agent.</p>
          </div>
        </ConfirmDialog>

        <LoadingOverlay visible={!!busyID()} message={busyText() || 'Working...'} />
      </PanelContent>
    </Panel>
  );
}
