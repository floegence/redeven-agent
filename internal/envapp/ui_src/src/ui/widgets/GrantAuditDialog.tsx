import { For, Show, createMemo, createResource } from 'solid-js';
import { Button, Dialog, LoadingOverlay, useNotification } from '@floegence/floe-webapp-core';

import { getGrantAudits, type GrantAuditEntry } from '../services/controlplaneApi';

function fmtTime(iso: string): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}

function formatPerm(e: GrantAuditEntry): string {
  const parts: string[] = [];
  if (e.can_read_files) parts.push('R');
  if (e.can_write_files) parts.push('W');
  if (e.can_execute) parts.push('X');
  return parts.length > 0 ? parts.join('') : '-';
}

export function GrantAuditDialog(props: { open: boolean; envId: string; onClose: () => void }) {
  const notify = useNotification();

  const envId = createMemo(() => String(props.envId ?? '').trim());

  const [entries, { refetch }] = createResource<GrantAuditEntry[], string | null>(
    () => (props.open ? envId() || null : null),
    async (id) => (id ? getGrantAudits(id, 50) : []),
  );

  const errorText = createMemo(() => {
    const e = entries.error;
    if (!e) return '';
    return e instanceof Error ? e.message : String(e);
  });

  const copy = async (label: string, value: string) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      notify.success('Copied', `${label} copied to clipboard`);
    } catch {
      notify.error('Copy failed', 'Clipboard permission denied');
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title="Audit log"
      footer={
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={entries.loading || !envId()}>
            Refresh
          </Button>
          <Button size="sm" variant="default" onClick={props.onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div class="space-y-2">
        <div class="text-xs text-muted-foreground">Recent grant events for this environment.</div>

        <Show when={errorText()}>
          <div class="text-xs text-error break-words">{errorText()}</div>
        </Show>

        <div class="relative" style={{ 'min-height': '160px' }}>
          <LoadingOverlay visible={entries.loading} message="Loading audit log..." />

          <Show when={!entries.loading}>
            <Show when={(entries() ?? []).length > 0} fallback={<div class="text-xs text-muted-foreground">No audit entries.</div>}>
              <div class="max-h-[60vh] overflow-auto">
                <table class="w-full text-xs">
                  <thead class="text-muted-foreground">
                    <tr class="text-left">
                      <th class="py-2 pr-2 whitespace-nowrap">Time</th>
                      <th class="py-2 pr-2 whitespace-nowrap">User</th>
                      <th class="py-2 pr-2 whitespace-nowrap">App</th>
                      <th class="py-2 pr-2 whitespace-nowrap">Perm</th>
                      <th class="py-2 pr-2 whitespace-nowrap">Status</th>
                      <th class="py-2 whitespace-nowrap">Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={entries() ?? []}>
                      {(e) => (
                        <tr class="border-t border-border/60">
                          <td class="py-2 pr-2 whitespace-nowrap">{fmtTime(e.created_at)}</td>
                          <td class="py-2 pr-2 font-mono truncate max-w-[200px]" title={e.user_public_id}>
                            {e.user_public_id}
                          </td>
                          <td class="py-2 pr-2 font-mono truncate max-w-[240px]" title={e.floe_app}>
                            {e.floe_app}
                          </td>
                          <td class="py-2 pr-2 whitespace-nowrap">{formatPerm(e)}</td>
                          <td class={`py-2 pr-2 whitespace-nowrap ${e.status === 'failure' ? 'text-error' : ''}`}>
                            {e.status}
                            <Show when={e.error_code}>
                              <span class="text-muted-foreground">{` (${e.error_code})`}</span>
                            </Show>
                          </td>
                          <td class="py-2 font-mono truncate max-w-[240px]" title={e.channel_id}>
                            <button type="button" class="hover:underline" onClick={() => void copy('Channel ID', e.channel_id)}>
                              {e.channel_id}
                            </button>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Dialog>
  );
}

