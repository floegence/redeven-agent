import { createContext, createEffect, createMemo, createResource, createSignal, useContext, type Accessor, type Resource, type Setter } from 'solid-js';
import { useNotification } from '@floegence/floe-webapp-core';
import { useProtocol } from '@floegence/floe-webapp-protocol';
import { useEnvContext } from './EnvContext';
import { fetchGatewayJSON } from '../services/gatewayApi';

// ---- API response types (shared between sidebar and main page) ----

export type ModelsResponse = Readonly<{
  default_model: string;
  models: Array<{ id: string; label?: string }>;
}>;

export type SettingsResponse = Readonly<{
  ai: any | null;
}>;

export type ThreadView = Readonly<{
  thread_id: string;
  title: string;
  created_at_unix_ms: number;
  updated_at_unix_ms: number;
  last_message_at_unix_ms: number;
  last_message_preview: string;
}>;

export type ListThreadsResponse = Readonly<{
  threads: ThreadView[];
  next_cursor?: string;
}>;

type CreateThreadResponse = Readonly<{
  thread: ThreadView;
}>;

export type ListThreadMessagesResponse = Readonly<{
  messages: any[];
  next_before_id?: number;
  has_more?: boolean;
  total_returned?: number;
}>;

// ---- Persistence helpers ----

const ACTIVE_THREAD_STORAGE_KEY = 'redeven_ai_active_thread_id';

function readPersistedActiveThreadId(): string | null {
  try {
    const v = String(localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY) ?? '').trim();
    return v || null;
  } catch {
    return null;
  }
}

function persistActiveThreadId(threadId: string): void {
  try {
    localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, threadId);
  } catch {
    // ignore
  }
}

// ---- Context value type ----

export interface AIChatContextValue {
  // AI config
  settings: Resource<SettingsResponse | null>;
  aiEnabled: Accessor<boolean>;

  // Models
  models: Resource<ModelsResponse | null>;
  modelsReady: Accessor<boolean>;
  selectedModel: Accessor<string>;
  setSelectedModel: Setter<string>;
  modelOptions: Accessor<Array<{ value: string; label: string }>>;

  // Threads
  threads: Resource<ListThreadsResponse | null>;
  bumpThreadsSeq: () => void;
  activeThreadId: Accessor<string | null>;
  setActiveThreadId: Setter<string | null>;
  activeThread: Accessor<ThreadView | null>;
  activeThreadTitle: Accessor<string>;

  // Thread creation
  creatingThread: Accessor<boolean>;
  createNewChat: () => Promise<void>;

  // Run state (set by EnvAIPage, read by sidebar)
  running: Accessor<boolean>;
  setRunning: Setter<boolean>;
}

// ---- Context ----

export const AIChatContext = createContext<AIChatContextValue>();

export function useAIChatContext(): AIChatContextValue {
  const ctx = useContext(AIChatContext);
  if (!ctx) {
    throw new Error('AIChatContext is missing');
  }
  return ctx;
}

// ---- Factory: create context value (call inside a component) ----

export function createAIChatContextValue(): AIChatContextValue {
  const env = useEnvContext();
  const protocol = useProtocol();
  const notify = useNotification();

  // Settings resource
  const settingsKey = createMemo<number | null>(() => (protocol.status() === 'connected' ? env.settingsSeq() : null));
  const [settings] = createResource<SettingsResponse | null, number | null>(
    () => settingsKey(),
    async (k) => (k == null ? null : await fetchGatewayJSON<SettingsResponse>('/_redeven_proxy/api/settings', { method: 'GET' })),
  );
  const aiEnabled = createMemo(() => !!settings()?.ai);

  // Models resource
  const modelsKey = createMemo<number | null>(() => {
    if (settingsKey() == null) return null;
    if (!aiEnabled()) return null;
    return env.settingsSeq();
  });

  const [models] = createResource<ModelsResponse | null, number | null>(
    () => modelsKey(),
    async (k) => (k == null ? null : await fetchGatewayJSON<ModelsResponse>('/_redeven_proxy/api/ai/models', { method: 'GET' })),
  );

  const modelsReady = createMemo(() => !!models() && !models.loading && !models.error);

  const [selectedModel, setSelectedModel] = createSignal('');

  createEffect(() => {
    const m = models();
    if (!m) return;
    const current = selectedModel().trim();
    if (!current && m.default_model) {
      setSelectedModel(m.default_model);
    }
  });

  const modelOptions = createMemo(() => {
    const m = models();
    if (!m) return [];
    return m.models.map((it) => ({
      value: it.id,
      label: it.label ?? it.id,
    }));
  });

  // Threads resource
  const [threadsSeq, setThreadsSeq] = createSignal(0);
  const bumpThreadsSeq = () => setThreadsSeq((n) => n + 1);

  const threadsKey = createMemo<number | null>(() => {
    if (settingsKey() == null) return null;
    if (!aiEnabled()) return null;
    return threadsSeq();
  });

  const [threads] = createResource<ListThreadsResponse | null, number | null>(
    () => threadsKey(),
    async (k) =>
      k == null
        ? null
        : await fetchGatewayJSON<ListThreadsResponse>('/_redeven_proxy/api/ai/threads?limit=200', {
            method: 'GET',
          }),
  );

  // Active thread
  const [activeThreadId, setActiveThreadId] = createSignal<string | null>(null);
  const activeThread = createMemo<ThreadView | null>(() => {
    const list = threads();
    const id = activeThreadId();
    if (!list || !id) return null;
    return list.threads.find((t) => t.thread_id === id) ?? null;
  });
  const activeThreadTitle = createMemo(() => {
    const t = activeThread();
    return t?.title?.trim() || 'New chat';
  });

  // Persist activeThreadId to localStorage
  createEffect(() => {
    const id = activeThreadId();
    if (!id) return;
    persistActiveThreadId(id);
  });

  // Run state (owned by EnvAIPage but exposed for sidebar to read)
  const [running, setRunning] = createSignal(false);

  // Thread creation
  const [creatingThread, setCreatingThread] = createSignal(false);

  const createThread = async (): Promise<ThreadView> => {
    const resp = await fetchGatewayJSON<CreateThreadResponse>('/_redeven_proxy/api/ai/threads', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    });
    return resp.thread;
  };

  const createNewChat = async () => {
    if (protocol.status() !== 'connected') {
      notify.error('Not connected', 'Connecting to agent...');
      return;
    }
    if (!aiEnabled()) {
      notify.error('AI not configured', 'Open Settings to enable AI.');
      return;
    }

    setCreatingThread(true);
    try {
      const th = await createThread();
      bumpThreadsSeq();
      setActiveThreadId(th.thread_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error('Failed to create chat', msg || 'Request failed.');
    } finally {
      setCreatingThread(false);
    }
  };

  // Ensure we always have an active thread when AI is enabled.
  let initInFlight = false;
  createEffect(() => {
    if (protocol.status() !== 'connected' || !aiEnabled()) {
      setActiveThreadId(null);
      return;
    }
    const list = threads();
    if (!list || threads.loading || threads.error) return;

    const current = activeThreadId();
    if (current && list.threads.some((t) => t.thread_id === current)) return;

    const persisted = readPersistedActiveThreadId();
    const picked =
      (persisted && list.threads.some((t) => t.thread_id === persisted) ? persisted : null) ||
      (list.threads[0]?.thread_id ? String(list.threads[0].thread_id) : null);

    if (picked) {
      setActiveThreadId(picked);
      return;
    }

    if (initInFlight) return;
    initInFlight = true;
    void (async () => {
      try {
        const th = await createThread();
        bumpThreadsSeq();
        setActiveThreadId(th.thread_id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify.error('Failed to create chat', msg || 'Request failed.');
      } finally {
        initInFlight = false;
      }
    })();
  });

  return {
    settings,
    aiEnabled,
    models,
    modelsReady,
    selectedModel,
    setSelectedModel,
    modelOptions,
    threads,
    bumpThreadsSeq,
    activeThreadId,
    setActiveThreadId,
    activeThread,
    activeThreadTitle,
    creatingThread,
    createNewChat,
    running,
    setRunning,
  };
}
