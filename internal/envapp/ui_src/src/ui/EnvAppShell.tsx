import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import {
  Activity,
  ActivityAppsMain,
  BottomBarItem,
  Copy,
  Code,
  Files,
  Grid,
  Grid3x3,
  LayoutDashboard,
  Moon,
  Panel,
  PanelContent,
  Refresh,
  Search,
  Shell,
  StatusIndicator,
  Sun,
  Terminal,
  Tooltip,
  type ActivityBarItem,
  type FloeComponent,
  useCommand,
  useComponentRegistry,
  useLayout,
  useNotification,
  useTheme,
  useWidgetRegistry,
} from '@floegence/floe-webapp-core';
import { useProtocol } from '@floegence/floe-webapp-protocol';

import { EnvContext } from './pages/EnvContext';
import { EnvDeckPage } from './pages/EnvDeckPage';
import { EnvTerminalPage } from './pages/EnvTerminalPage';
import { EnvMonitorPage } from './pages/EnvMonitorPage';
import { EnvFileBrowserPage } from './pages/EnvFileBrowserPage';
import { EnvCodespacesPage } from './pages/EnvCodespacesPage';
import { EnvPluginMarketPage } from './pages/EnvPluginMarketPage';
import { redevenDeckWidgets } from './deck/redevenDeckWidgets';
import { GrantAuditDialog } from './widgets/GrantAuditDialog';
import { getSandboxWindowInfo } from './services/sandboxWindowRegistry';
import {
  channelInitEntry,
  exchangeBrokerToEntryTicket,
  getBrokerTokenFromSession,
  getEnvPublicIDFromSession,
  getEnvironment,
  mintEnvEntryTicketForApp,
  type EnvironmentDetail,
} from './services/controlplaneApi';

type NavTab = 'deck' | 'terminal' | 'monitor' | 'files' | 'codespaces' | 'market';

const FLOE_APP_AGENT = 'com.floegence.redeven.agent';
const CODE_SPACE_ID_ENV_UI = 'env-ui';

export function EnvAppShell() {
  const layout = useLayout();
  const theme = useTheme();
  const registry = useComponentRegistry();
  const widgetRegistry = useWidgetRegistry();
  const protocol = useProtocol();
  const cmd = useCommand();
  const notify = useNotification();

  widgetRegistry.registerAll(redevenDeckWidgets);

  const [envId] = createSignal(getEnvPublicIDFromSession());

  const [env] = createResource<EnvironmentDetail | null, string | null>(
    () => envId() || null,
    (id) => (id ? getEnvironment(id) : null),
  );

  const [connectError, setConnectError] = createSignal<string | null>(null);
  const [connecting, setConnecting] = createSignal(false);
  const [auditOpen, setAuditOpen] = createSignal(false);
  let connectSeq = 0;

  const status = createMemo(() => (connectError() ? 'error' : protocol.status()));
  const isConnected = () => protocol.status() === 'connected' && !!protocol.client();

  // Connection supervisor:
  // - Env App must be resilient to agent restarts (control/ws reconnect).
  // - We do NOT rely on protocol autoReconnect, because a fresh grant is required after disruptions.
  // - We try to avoid spamming grant audits when agent is clearly offline by probing env agent status first.
  let superviseSeq = 1;
  let superviseTimer: number | null = null;
  let superviseInFlight = false;
  let reconnectAttempt = 0;
  let agentPollAttempt = 0;

  const clearSuperviseTimer = () => {
    if (superviseTimer == null) return;
    window.clearTimeout(superviseTimer);
    superviseTimer = null;
  };

  const resetSuperviseBackoff = () => {
    reconnectAttempt = 0;
    agentPollAttempt = 0;
  };

  const backoffMs = (attempt: number, baseMs: number, capMs: number) => {
    const a = Math.max(0, attempt);
    const exp = Math.min(capMs, baseMs * Math.pow(2, a));
    const jitter = exp * (0.2 * Math.random());
    return Math.round(Math.min(capMs, exp + jitter));
  };

  const scheduleSuperviseTick = (seq: number, delayMs: number) => {
    clearSuperviseTimer();
    superviseTimer = window.setTimeout(() => {
      superviseTimer = null;
      void superviseTick(seq);
    }, Math.max(0, delayMs));
  };

  const kickReconnect = (opts?: { immediate?: boolean; resetBackoff?: boolean }) => {
    if (opts?.resetBackoff) resetSuperviseBackoff();
    const seq = superviseSeq;
    if (opts?.immediate) {
      clearSuperviseTimer();
      void superviseTick(seq);
      return;
    }
    if (superviseTimer != null) return;
    scheduleSuperviseTick(seq, 0);
  };

  const superviseTick = async (seq: number) => {
    if (seq !== superviseSeq) return;
    if (superviseInFlight) return;
    superviseInFlight = true;
    try {
      if (isConnected()) {
        resetSuperviseBackoff();
        clearSuperviseTimer();
        return;
      }
      if (connecting()) {
        scheduleSuperviseTick(seq, 500);
        return;
      }

      // Browser offline: wait for 'online' and keep a slow poll loop.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        agentPollAttempt += 1;
        scheduleSuperviseTick(seq, backoffMs(agentPollAttempt, 1000, 10_000));
        return;
      }

      const id = envId();
      if (!id) {
        setConnectError('Missing env context. Please reopen from the Redeven Portal.');
        return;
      }

      // Probe agent status to avoid grant-audit spam while the agent is clearly offline.
      try {
        const detail = await getEnvironment(id);
        const st = detail?.agent?.status;
        if (st && st !== 'online') {
          agentPollAttempt += 1;
          reconnectAttempt = 0;
          scheduleSuperviseTick(seq, backoffMs(agentPollAttempt, 1000, 10_000));
          return;
        }
        agentPollAttempt = 0;
      } catch (e) {
        // Missing broker token is not recoverable inside sandbox.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Missing broker token')) {
          setConnectError(msg);
          return;
        }
        // For transient failures (meta/network), allow reconnect attempt below.
      }

      await connect();
      if (seq !== superviseSeq) return;
      if (isConnected()) {
        resetSuperviseBackoff();
        clearSuperviseTimer();
        return;
      }

      reconnectAttempt += 1;
      scheduleSuperviseTick(seq, backoffMs(reconnectAttempt, 1000, 30_000));
    } finally {
      superviseInFlight = false;
    }
  };

  const connect = async () => {
    const id = envId();
    if (!id) {
      setConnectError('Missing env context. Please reopen from the Redeven Portal.');
      return;
    }

    const seq = ++connectSeq;
    setConnectError(null);
    setConnecting(true);

    try {
      protocol.disconnect();

      const brokerToken = getBrokerTokenFromSession();
      if (!brokerToken) {
        throw new Error('Missing broker token. Please reopen from the Redeven Portal.');
      }

      const entryTicket = await exchangeBrokerToEntryTicket({
        endpointId: id,
        floeApp: FLOE_APP_AGENT,
        brokerToken,
        codeSpaceId: CODE_SPACE_ID_ENV_UI,
      });
      if (seq !== connectSeq) return;

      const grant = await channelInitEntry({ endpointId: id, floeApp: FLOE_APP_AGENT, entryTicket });
      if (seq !== connectSeq) return;

      await protocol.connect({
        mode: 'tunnel',
        grant,
        autoReconnect: { enabled: false },
      });
    } catch (e) {
      if (seq !== connectSeq) return;
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === connectSeq) setConnecting(false);
    }
  };

  onMount(() => {
    layout.setSidebarCollapsed(true);
    layout.setSidebarActiveTab(layout.isMobile() ? 'terminal' : 'deck');
  });

  onCleanup(() => {
    superviseSeq += 1;
    clearSuperviseTimer();
    connectSeq += 1;
    protocol.disconnect();
  });

  // Cross-window handshake: allow non-Env App sandbox windows (codespaces/3rd-party apps) to
  // request a fresh entry_ticket after refresh, without leaking broker_token outside the Env App origin.
  onMount(() => {
    const onMessage = (ev: MessageEvent) => {
      const data: any = ev.data;
      if (!data || typeof data !== 'object') return;
      if (String(data.type ?? '') !== 'redeven:boot_ready') return;

      const payload: any = data.payload;
      const floeApp = String(payload?.floe_app ?? '').trim();
      const codeSpaceID = String(payload?.code_space_id ?? '').trim();
      if (!floeApp || !codeSpaceID) return;

      const info = getSandboxWindowInfo(ev.source);
      if (!info) return;
      if (ev.origin !== info.origin) return;
      if (floeApp !== info.floe_app || codeSpaceID !== info.code_space_id) return;

      const envPublicID = envId();
      if (!envPublicID) return;

      void (async () => {
        try {
          const entryTicket = await mintEnvEntryTicketForApp({ envId: envPublicID, floeApp, codeSpaceId: codeSpaceID });
          (ev.source as Window).postMessage(
            {
              type: 'redeven:boot_init',
              payload: {
                v: 1,
                env_public_id: envPublicID,
                floe_app: floeApp,
                code_space_id: codeSpaceID,
                app_path: info.app_path,
                entry_ticket: entryTicket,
              },
            },
            info.origin,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          notify.error('Failed to refresh session', msg);
        }
      })();
    };

    window.addEventListener('message', onMessage);
    onCleanup(() => window.removeEventListener('message', onMessage));
  });

  // Auto reconnect: kick on status/connecting changes, and on common browser lifecycle events.
  // - status/client changes: handle agent restarts and WS drops
  // - focus/visibility/online: reduce perceived downtime
  onMount(() => {
    kickReconnect({ immediate: true, resetBackoff: true });

    const onOnline = () => kickReconnect({ immediate: true, resetBackoff: true });
    const onFocus = () => kickReconnect({ immediate: true });
    const onVisibility = () => {
      if (!document.hidden) kickReconnect({ immediate: true });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    onCleanup(() => {
      clearSuperviseTimer();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  });

  createEffect(() => {
    // Track these signals to react to dropped connections and completed manual reconnect attempts.
    const _connecting = connecting();
    if (_connecting) return;
    if (isConnected()) {
      resetSuperviseBackoff();
      clearSuperviseTimer();
      return;
    }
    kickReconnect({ immediate: true });
  });

  const components: FloeComponent[] = [
    { id: 'deck', name: 'Deck', icon: LayoutDashboard, component: EnvDeckPage, sidebar: { order: 1, fullScreen: true } },
    { id: 'terminal', name: 'Terminal', icon: Terminal, component: EnvTerminalPage, sidebar: { order: 2, fullScreen: true } },
    { id: 'monitor', name: 'Monitoring', icon: Activity, component: EnvMonitorPage, sidebar: { order: 3, fullScreen: true } },
    { id: 'files', name: 'File Browser', icon: Files, component: EnvFileBrowserPage, sidebar: { order: 4, fullScreen: true } },
    { id: 'codespaces', name: 'Codespaces', icon: Code, component: EnvCodespacesPage, sidebar: { order: 5, fullScreen: true } },
    { id: 'market', name: 'Plugin Market', icon: Grid, component: EnvPluginMarketPage, sidebar: { order: 6, fullScreen: true } },
  ];
  registry.registerAll(components);

  const goTab = (tab: NavTab) => {
    let next = tab;
    if (layout.isMobile() && next === 'deck') next = 'terminal';
    layout.setSidebarActiveTab(next);
  };

  const activityItems = (): ActivityBarItem[] => {
    const items: ActivityBarItem[] = [];

    if (!layout.isMobile()) {
      items.push({ id: 'deck', icon: LayoutDashboard, label: 'Deck', onClick: () => goTab('deck') });
    }
    items.push(
      { id: 'terminal', icon: Terminal, label: 'Terminal', onClick: () => goTab('terminal') },
      { id: 'monitor', icon: Activity, label: 'Monitoring', onClick: () => goTab('monitor') },
      { id: 'files', icon: Files, label: 'File Browser', onClick: () => goTab('files') },
      { id: 'codespaces', icon: Code, label: 'Codespaces', onClick: () => goTab('codespaces') },
      { id: 'market', icon: Grid, label: 'Plugin Market', onClick: () => goTab('market') },
    );
    return items;
  };

  const envName = () => {
    if (env.state !== 'ready') return 'Loading...';
    return env()?.name || 'Environment';
  };

  function portalOrigin(): string {
    // The Env App runs on a sandbox subdomain (env-<env_id>.<region>.<base>),
    // while the Portal is on the region root domain (<region>.<base>).
    const proto = window.location.protocol;
    const host = window.location.hostname.trim().toLowerCase();
    const port = window.location.port ? `:${window.location.port}` : '';
    const parts = host.split('.');
    // sandbox origin always has an extra label (sandbox_id.<region>.<base>).
    if (parts.length >= 4) {
      parts.shift();
      return `${proto}//${parts.join('.')}${port}`;
    }
    return `${proto}//${host}${port}`;
  }

  // Env App command palette commands (navigation + common actions).
  // Note: register commands once per Shell lifecycle to avoid duplicates during HMR/remount.
  onMount(() => {
    const unregister = cmd.registerAll([
      {
        id: 'redeven.env.goToDeck',
        title: 'Go to Deck',
        description: 'Open the deck view',
        category: 'Navigation',
        keybind: 'mod+shift+d',
        icon: LayoutDashboard,
        execute: () => goTab('deck'),
      },
      {
        id: 'redeven.env.goToTerminal',
        title: 'Go to Terminal',
        description: 'Open the terminal',
        category: 'Navigation',
        keybind: 'mod+shift+t',
        icon: Terminal,
        execute: () => goTab('terminal'),
      },
      {
        id: 'redeven.env.goToMonitoring',
        title: 'Go to Monitoring',
        description: 'Open monitoring',
        category: 'Navigation',
        keybind: 'mod+shift+m',
        icon: Activity,
        execute: () => goTab('monitor'),
      },
      {
        id: 'redeven.env.goToFiles',
        title: 'Go to File Browser',
        description: 'Browse remote files',
        category: 'Navigation',
        keybind: 'mod+shift+f',
        icon: Files,
        execute: () => goTab('files'),
      },
      {
        id: 'redeven.env.goToCodespaces',
        title: 'Go to Codespaces',
        description: 'Open codespaces',
        category: 'Navigation',
        keybind: 'mod+shift+c',
        icon: Code,
        execute: () => goTab('codespaces'),
      },
      {
        id: 'redeven.env.goToMarket',
        title: 'Go to Plugin Market',
        description: 'Browse plugins',
        category: 'Navigation',
        keybind: 'mod+shift+p',
        icon: Grid,
        execute: () => goTab('market'),
      },
      {
        id: 'redeven.env.backToEnvironments',
        title: 'Back to Environments',
        description: 'Return to the environments list',
        category: 'Navigation',
        keybind: 'mod+shift+e',
        icon: Grid3x3,
        execute: () => window.location.assign(`${portalOrigin()}/`),
      },
      {
        id: 'redeven.env.reconnect',
        title: 'Reconnect',
        description: 'Reconnect to the environment tunnel',
        category: 'Environment',
        keybind: 'mod+shift+r',
        icon: Refresh,
        execute: () => {
          if (connecting()) return;
          kickReconnect({ immediate: true, resetBackoff: true });
        },
      },
      {
        id: 'redeven.env.copyEnvId',
        title: 'Copy Environment ID',
        description: 'Copy the environment id to clipboard',
        category: 'Environment',
        icon: Copy,
        execute: async () => {
          const id = envId() || '';
          if (!id) {
            notify.error('Copy failed', 'Missing environment id');
            return;
          }

          try {
            await navigator.clipboard.writeText(id);
            notify.success('Copied', 'Environment id copied to clipboard');
          } catch {
            notify.error('Copy failed', 'Clipboard permission denied');
          }
        },
      },
      {
        id: 'redeven.env.toggleTheme',
        title: 'Toggle Theme',
        description: 'Switch between light and dark theme',
        category: 'View',
        keybind: 'mod+shift+l',
        icon: () => (theme.resolvedTheme() === 'light' ? <Moon class="w-4 h-4" /> : <Sun class="w-4 h-4" />),
        execute: () => {
          theme.toggleTheme();
          const nextTheme = theme.resolvedTheme() === 'light' ? 'dark' : 'light';
          notify.info('Theme changed', `Switched to ${nextTheme} theme`);
        },
      },
      {
        id: 'redeven.env.openCommandPalette',
        title: 'Open Command Palette',
        description: 'Open the command palette',
        category: 'General',
        keybind: 'mod+k',
        icon: Search,
        execute: () => cmd.open(),
      },
    ]);

    onCleanup(() => unregister());
  });

  return (
    <EnvContext.Provider value={{ env_id: envId, env, connect, connecting, connectError }}>
      <Shell
        logo={
          <Tooltip content="Back to environments" placement="bottom" delay={0}>
            <button
              type="button"
              class="flex items-center justify-center w-8 h-8 rounded cursor-pointer hover:bg-muted/60 transition-colors"
              onClick={() => window.location.assign(`${portalOrigin()}/`)}
              aria-label="Back to environments"
            >
              <img src="/logo.png" alt="Redeven" class="w-6 h-6 object-contain" />
            </button>
          </Tooltip>
        }
        activityItems={activityItems()}
        topBarActions={
          <div class="flex items-center gap-1">
            <Tooltip content="Command palette" placement="bottom" delay={0}>
              <button
                type="button"
                class="flex items-center justify-center w-8 h-8 rounded cursor-pointer hover:bg-muted/60 transition-colors"
                onClick={() => cmd.open()}
                aria-label="Command palette"
              >
                <Search class="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="Toggle theme" placement="bottom" delay={0}>
              <button
                type="button"
                class="flex items-center justify-center w-8 h-8 rounded cursor-pointer hover:bg-muted/60 transition-colors"
                onClick={() => theme.toggleTheme()}
                aria-label="Toggle theme"
              >
                {theme.resolvedTheme() === 'light' ? <Moon class="w-4 h-4" /> : <Sun class="w-4 h-4" />}
              </button>
            </Tooltip>
          </div>
        }
        bottomBarItems={
          <>
            <div class="flex items-center gap-2 min-w-0">
              <BottomBarItem class="min-w-0">
                <span class="truncate">{envName()}</span>
              </BottomBarItem>
              <BottomBarItem class="min-w-0">
                <span class="truncate">{envId() || '(missing env id)'}</span>
              </BottomBarItem>
            </div>
            <div class="flex items-center gap-2">
              <StatusIndicator status={status()} />
              <BottomBarItem onClick={() => setAuditOpen(true)}>Audit log</BottomBarItem>
              <BottomBarItem
                onClick={connecting() ? undefined : () => kickReconnect({ immediate: true, resetBackoff: true })}
                class={connecting() ? 'opacity-60 pointer-events-none' : undefined}
              >
                {connecting() ? 'Connecting...' : 'Reconnect'}
              </BottomBarItem>
            </div>
          </>
        }
      >
        <div class="h-full min-h-0 overflow-hidden flex flex-col">
          <Show when={connectError()}>
            <Panel class="h-auto rounded-none border-0 border-b border-error/40">
              <PanelContent class="p-3 text-xs">
                <div class="text-error font-medium">Connection failed</div>
                <div class="text-muted-foreground break-words">{connectError()}</div>
              </PanelContent>
            </Panel>
          </Show>

          <div class="flex-1 min-h-0 overflow-hidden relative">
            <ActivityAppsMain activeId={() => layout.sidebarActiveTab()} />
          </div>
        </div>

        <GrantAuditDialog open={auditOpen()} envId={envId()} onClose={() => setAuditOpen(false)} />
      </Shell>
    </EnvContext.Provider>
  );
}
