import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { Panel, PanelContent } from '@floegence/floe-webapp-core/layout';
import { LoadingOverlay } from '@floegence/floe-webapp-core/loading';
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input } from '@floegence/floe-webapp-core/ui';
import { getEnvironmentFloeApps, setEnvironmentFloeAppEnabled, type EnvFloeApp } from '../services/controlplaneApi';
import { useEnvContext } from './EnvContext';

export function EnvPluginMarketPage() {
  const ctx = useEnvContext();
  const envId = () => ctx.env_id();

  const [query, setQuery] = createSignal('');
  const [saving, setSaving] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const canAdmin = () => Boolean(ctx.env()?.permissions?.can_admin);
  const permissionReady = () => ctx.env.state === 'ready';

  const [apps, { mutate, refetch }] = createResource<EnvFloeApp[], string>(envId, (id) => getEnvironmentFloeApps(id));

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const all = apps() ?? [];
    if (!q) return all;
    return all.filter((a) => {
      const hay = `${a.display_name ?? ''}\n${a.description ?? ''}\n${a.app_id ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });

  const toggle = async (app: EnvFloeApp) => {
    if (!canAdmin()) return;
    if (saving()) return;

    setActionError(null);
    setSaving(app.app_id);
    try {
      const next = await setEnvironmentFloeAppEnabled(envId(), app.app_id, !app.enabled);
      mutate(next);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      await refetch();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div class="h-full min-h-0 overflow-auto space-y-3">
      <Panel class="border border-border rounded-md overflow-hidden">
        <PanelContent class="p-4 space-y-3">
          <div class="space-y-1">
            <div class="text-sm font-semibold">Plugin Market</div>
            <div class="text-xs text-muted-foreground">Enable apps per environment.</div>
          </div>

          <Show when={permissionReady() && !canAdmin()}>
            <div class="text-xs text-muted-foreground">
              You don't have permission to manage apps in this environment.
            </div>
          </Show>

          <div class="flex items-center gap-2">
            <Input
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search apps..."
              size="sm"
              class="max-w-sm"
            />
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Refresh
            </Button>
          </div>

          <Show when={actionError()}>
            <div class="text-xs text-error break-words">{actionError()}</div>
          </Show>

          <div class="relative" style={{ 'min-height': '96px' }}>
            <LoadingOverlay visible={apps.loading} message="Loading apps..." />

            <Show when={!apps.loading}>
              <Show when={(filtered() ?? []).length > 0} fallback={<div class="text-xs text-muted-foreground">No apps found.</div>}>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <For each={filtered()}>
                    {(app) => (
                      <Card class="border border-border">
                        <CardHeader>
                          <CardTitle class="text-sm">{app.display_name || app.app_id}</CardTitle>
                          <CardDescription class="text-xs">{app.description || 'No description.'}</CardDescription>
                        </CardHeader>
                        <CardContent class="text-[11px] text-muted-foreground space-y-1">
                          <div>App ID: {app.app_id}</div>
                          <div>{app.is_official ? 'Official' : 'Community'}</div>
                        </CardContent>
                        <CardFooter class="flex items-center justify-between gap-2">
                          <div class="text-xs">{app.enabled ? 'Enabled' : 'Disabled'}</div>
                          <Button
                            size="sm"
                            variant={app.enabled ? 'outline' : 'default'}
                            disabled={!canAdmin() || saving() === app.app_id}
                            onClick={() => void toggle(app)}
                          >
                            <Show when={saving() !== app.app_id} fallback="Saving...">
                              {app.enabled ? 'Disable' : 'Enable'}
                            </Show>
                          </Button>
                        </CardFooter>
                      </Card>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
