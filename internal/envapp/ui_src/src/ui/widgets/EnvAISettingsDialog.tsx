import { Show, createEffect, createMemo, createResource, createSignal } from 'solid-js';
import { Button, ConfirmDialog, Dialog, LoadingOverlay, useNotification } from '@floegence/floe-webapp-core';

import { fetchGatewayJSON } from '../services/gatewayApi';

type AIProvider = Readonly<{
  id: string;
  type: 'openai' | 'anthropic' | 'openai_compatible';
  base_url?: string;
  api_key_env: string;
}>;

type AIModel = Readonly<{ id: string; label?: string }>;

type AIConfig = Readonly<{
  default_model: string;
  models?: AIModel[];
  providers: AIProvider[];
}>;

type AIConfigView = Readonly<{
  config_path: string;
  enabled: boolean;
  ai: AIConfig | null;
}>;

function defaultAIConfigTemplate(): string {
  return JSON.stringify(
    {
      default_model: 'openai/gpt-5-mini',
      models: [{ id: 'openai/gpt-5-mini', label: 'GPT-5 Mini' }],
      providers: [{ id: 'openai', type: 'openai', base_url: 'https://api.openai.com/v1', api_key_env: 'OPENAI_API_KEY' }],
    },
    null,
    2,
  );
}

export function EnvAISettingsDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const notify = useNotification();

  const [draft, setDraft] = createSignal('');
  const [dirty, setDirty] = createSignal(false);
  const [errorText, setErrorText] = createSignal<string | null>(null);

  const [saveLoading, setSaveLoading] = createSignal(false);

  const [disableDialogOpen, setDisableDialogOpen] = createSignal(false);
  const [disableLoading, setDisableLoading] = createSignal(false);

  const [cfg, { refetch }] = createResource<AIConfigView | null, boolean>(
    () => props.open,
    async (open) => (open ? await fetchGatewayJSON<AIConfigView>('/_redeven_proxy/api/ai/config', { method: 'GET' }) : null),
  );

  const configPath = createMemo(() => String(cfg()?.config_path ?? '').trim());

  // Reset local state on open.
  let lastOpen = false;
  createEffect(() => {
    const open = props.open;
    if (open && !lastOpen) {
      setErrorText(null);
      setDirty(false);
      setDraft('');
      void refetch();
    }
    lastOpen = open;
  });

  // Initialize the editor content after the config loads (but do not override user edits).
  createEffect(() => {
    if (!props.open) return;
    if (dirty()) return;
    const v = cfg();
    if (!v) return;
    const next = v.ai ? JSON.stringify(v.ai, null, 2) : defaultAIConfigTemplate();
    setDraft(next);
  });

  const doSave = async () => {
    setErrorText(null);
    const raw = String(draft() ?? '').trim();
    if (!raw) {
      setErrorText('Please provide an AI config JSON object, or click "Disable AI".');
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setErrorText('Invalid JSON.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setErrorText('AI config must be a JSON object.');
      return;
    }

    setSaveLoading(true);
    try {
      await fetchGatewayJSON<AIConfigView>('/_redeven_proxy/api/ai/config', {
        method: 'PUT',
        body: JSON.stringify({ ai: parsed }),
      });
      notify.success('Saved', 'AI settings updated.');
      props.onSaved?.();
      props.onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorText(msg || 'Save failed.');
      notify.error('Save failed', msg || 'Request failed.');
    } finally {
      setSaveLoading(false);
    }
  };

  const doDisable = async () => {
    setDisableLoading(true);
    setErrorText(null);
    try {
      await fetchGatewayJSON<AIConfigView>('/_redeven_proxy/api/ai/config', {
        method: 'PUT',
        body: JSON.stringify({ ai: null }),
      });
      notify.success('Disabled', 'AI has been disabled.');
      props.onSaved?.();
      setDisableDialogOpen(false);
      props.onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorText(msg || 'Disable failed.');
      notify.error('Disable failed', msg || 'Request failed.');
    } finally {
      setDisableLoading(false);
    }
  };

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
        title="AI Settings"
        footer={
          <div class="flex items-center justify-between gap-2 w-full">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDisableDialogOpen(true)}
              disabled={saveLoading() || cfg.loading}
            >
              Disable AI
            </Button>
            <div class="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={saveLoading() || cfg.loading}>
                Refresh
              </Button>
              <Button size="sm" variant="default" onClick={() => void doSave()} loading={saveLoading()} disabled={cfg.loading}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={props.onClose} disabled={saveLoading() || cfg.loading}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div class="space-y-2">
          <div class="text-xs text-muted-foreground">
            API keys are never stored. Use <code class="px-1 py-0.5 bg-muted rounded">api_key_env</code> and provide the key via environment variables when starting the agent.
          </div>

          <Show when={configPath()}>
            <div class="text-xs text-muted-foreground">
              Config file: <code class="px-1 py-0.5 bg-muted rounded">{configPath()}</code>
            </div>
          </Show>

          <Show when={errorText()}>
            <div class="text-xs text-error break-words">{errorText()}</div>
          </Show>

          <div class="relative" style={{ 'min-height': '240px' }}>
            <LoadingOverlay visible={cfg.loading} message="Loading AI settings..." />
            <textarea
              class="w-full h-[300px] font-mono text-xs border border-border rounded px-2 py-2 bg-background resize-y"
              value={draft()}
              onInput={(e) => {
                setDraft(e.currentTarget.value);
                setDirty(true);
              }}
              spellcheck={false}
              placeholder="{ ... }"
              disabled={cfg.loading}
            />
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={disableDialogOpen()}
        onOpenChange={(open) => setDisableDialogOpen(open)}
        title="Disable AI"
        confirmText="Disable"
        variant="destructive"
        loading={disableLoading()}
        onConfirm={() => void doDisable()}
      >
        <div class="space-y-2">
          <p class="text-sm">Are you sure you want to disable AI?</p>
          <p class="text-xs text-muted-foreground">
            This will remove the <code class="px-1 py-0.5 bg-muted rounded">ai</code> section from the agent config file.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}

