import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Button, FloatingWindow } from '@floegence/floe-webapp-core/ui';
import type { AskFlowerComposerAnchor } from '../pages/EnvContext';
import type { AskFlowerContextItem, AskFlowerIntent } from '../pages/askFlowerIntent';
import { resolveSuggestedWorkingDirAbsolute } from '../utils/askFlowerPath';

const WINDOW_DEFAULT_SIZE = { width: 760, height: 560 };
const WINDOW_MIN_SIZE = { width: 560, height: 420 };
const WINDOW_MAX_SIZE = { width: 1080, height: 820 };
const WINDOW_VIEWPORT_MARGIN = 12;
const WINDOW_ANCHOR_OFFSET = 8;

type AskFlowerComposerWindowProps = {
  open: boolean;
  intent: AskFlowerIntent | null;
  anchor?: AskFlowerComposerAnchor | null;
  onClose: () => void;
  onSend: (userPrompt: string) => Promise<void>;
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function toWindowPosition(anchor: AskFlowerComposerAnchor | null | undefined): { x: number; y: number } | undefined {
  if (!anchor) return undefined;
  if (typeof window === 'undefined') return undefined;

  const availableWidth = Math.max(0, window.innerWidth - WINDOW_VIEWPORT_MARGIN * 2);
  const availableHeight = Math.max(0, window.innerHeight - WINDOW_VIEWPORT_MARGIN * 2);
  const windowWidth = Math.min(WINDOW_DEFAULT_SIZE.width, availableWidth || WINDOW_DEFAULT_SIZE.width);
  const windowHeight = Math.min(WINDOW_DEFAULT_SIZE.height, availableHeight || WINDOW_DEFAULT_SIZE.height);
  const maxX = Math.max(WINDOW_VIEWPORT_MARGIN, window.innerWidth - windowWidth - WINDOW_VIEWPORT_MARGIN);
  const maxY = Math.max(WINDOW_VIEWPORT_MARGIN, window.innerHeight - windowHeight - WINDOW_VIEWPORT_MARGIN);

  return {
    x: clamp(anchor.x + WINDOW_ANCHOR_OFFSET, WINDOW_VIEWPORT_MARGIN, maxX),
    y: clamp(anchor.y + WINDOW_ANCHOR_OFFSET, WINDOW_VIEWPORT_MARGIN, maxY),
  };
}

function sourceLabel(source: AskFlowerIntent['source']): string {
  if (source === 'file_browser') return 'File Browser';
  if (source === 'file_preview') return 'File Preview';
  return 'Terminal';
}

function contextLine(item: AskFlowerContextItem): string {
  if (item.kind === 'file_path') {
    if (item.isDirectory) return `Directory: ${item.path}`;
    return `File: ${item.path}`;
  }
  if (item.kind === 'file_selection') {
    return `Selected ${Math.max(0, item.selectionChars)} chars from ${item.path}`;
  }

  const workingDir = String(item.workingDir ?? '').trim() || '/';
  if (Math.max(0, item.selectionChars) > 0) {
    return `Selected ${Math.max(0, item.selectionChars)} terminal chars (working directory: ${workingDir})`;
  }
  return `Terminal working directory: ${workingDir}`;
}

function attachmentLine(files: File[]): string | null {
  if (files.length <= 0) return null;
  if (files.length === 1) return `Queued attachment: ${files[0]?.name ?? '1 file'}`;
  return `Queued attachments: ${files.length} files`;
}

function summarizeContextItems(items: AskFlowerContextItem[]): { filePaths: number; fileSelections: number; terminalSelections: number } {
  let filePaths = 0;
  let fileSelections = 0;
  let terminalSelections = 0;
  for (const item of items) {
    if (item.kind === 'file_path') {
      filePaths += 1;
      continue;
    }
    if (item.kind === 'file_selection') {
      fileSelections += 1;
      continue;
    }
    terminalSelections += 1;
  }
  return { filePaths, fileSelections, terminalSelections };
}

export function AskFlowerComposerWindow(props: AskFlowerComposerWindowProps) {
  const [userPrompt, setUserPrompt] = createSignal('');
  const [validationError, setValidationError] = createSignal('');
  const [sending, setSending] = createSignal(false);
  let textareaEl: HTMLTextAreaElement | undefined;

  const position = createMemo(() => toWindowPosition(props.anchor ?? null));

  const contextLines = createMemo(() => {
    const intent = props.intent;
    if (!intent) return [] as string[];

    const lines: string[] = [`Source: ${sourceLabel(intent.source)}`];
    if (intent.contextItems.length > 0) {
      lines.push(...intent.contextItems.map((item) => contextLine(item)));
    }

    const suggestedWorkingDir = resolveSuggestedWorkingDirAbsolute({
      suggestedWorkingDirAbs: intent.suggestedWorkingDirAbs,
      suggestedWorkingDirVirtual: intent.suggestedWorkingDirVirtual,
      fsRootAbs: intent.fsRootAbs,
    });
    if (suggestedWorkingDir) {
      lines.push(`Suggested working directory: ${suggestedWorkingDir}`);
    }

    const attachments = attachmentLine(intent.pendingAttachments);
    if (attachments) {
      lines.push(attachments);
    }

    return lines;
  });

  const contextSummary = createMemo(() => {
    const intent = props.intent;
    if (!intent) {
      return { filePaths: 0, fileSelections: 0, terminalSelections: 0 };
    }
    return summarizeContextItems(intent.contextItems);
  });

  const suggestedWorkingDir = createMemo(() => {
    const intent = props.intent;
    if (!intent) return '';
    return resolveSuggestedWorkingDirAbsolute({
      suggestedWorkingDirAbs: intent.suggestedWorkingDirAbs,
      suggestedWorkingDirVirtual: intent.suggestedWorkingDirVirtual,
      fsRootAbs: intent.fsRootAbs,
    });
  });

  const attachmentNames = createMemo(() => {
    const intent = props.intent;
    if (!intent) return [] as string[];
    return intent.pendingAttachments
      .map((file) => String(file?.name ?? '').trim())
      .filter((name) => !!name);
  });

  const cleanedNotes = createMemo(() => {
    const intent = props.intent;
    if (!intent) return [] as string[];
    return intent.notes
      .map((note) => String(note ?? '').trim())
      .filter((note) => !!note);
  });

  const promptCharCount = createMemo(() => String(userPrompt() ?? '').trim().length);

  const resetDraft = (intent: AskFlowerIntent | null) => {
    setValidationError('');
    setSending(false);
    setUserPrompt(String(intent?.userPrompt ?? '').trim());
    requestAnimationFrame(() => {
      textareaEl?.focus();
      const el = textareaEl;
      if (!el) return;
      const pos = el.value.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  };

  createEffect(() => {
    if (!props.open) return;
    resetDraft(props.intent);
  });

  createEffect(() => {
    if (!props.open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (sending()) return;
      const target = event.target as Node | null;
      if (!target) {
        props.onClose();
        return;
      }
      const windowEl = document.querySelector<HTMLElement>('.ask-flower-composer-window');
      if (windowEl?.contains(target)) return;
      props.onClose();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => {
      window.removeEventListener('pointerdown', onPointerDown, true);
    });
  });

  const submit = async () => {
    if (sending()) return;
    const trimmedPrompt = String(userPrompt()).trim();
    if (!trimmedPrompt) {
      setValidationError('Please enter your question before sending.');
      requestAnimationFrame(() => textareaEl?.focus());
      return;
    }
    setSending(true);
    try {
      await props.onSend(trimmedPrompt);
    } finally {
      setSending(false);
    }
  };

  return (
    <Show when={props.open && props.intent} keyed>
      {(intent) => (
        <FloatingWindow
          open
          onOpenChange={(next) => {
            if (sending()) return;
            if (!next) props.onClose();
          }}
          title="Ask Flower"
          defaultPosition={position()}
          defaultSize={WINDOW_DEFAULT_SIZE}
          minSize={WINDOW_MIN_SIZE}
          maxSize={WINDOW_MAX_SIZE}
          class="ask-flower-composer-window"
          zIndex={130}
          footer={(
            <>
              <Button variant="ghost" onClick={props.onClose} disabled={sending()}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void submit()} disabled={sending()}>
                {sending() ? 'Sending...' : 'Send'}
              </Button>
            </>
          )}
        >
          <div class="h-full min-h-0 flex flex-col gap-4">
            <div class="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-4 shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <div class="text-sm font-semibold text-foreground">Focus your request</div>
                  <div class="text-xs text-muted-foreground">
                    Describe the outcome you want. Flower will use the context below automatically.
                  </div>
                </div>
                <div class="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  {sourceLabel(intent.source)}
                </div>
              </div>

              <div class="mt-3 rounded-xl border border-border/70 bg-background/85 p-3 shadow-inner">
                <label class="text-xs font-medium text-foreground" for={`ask-flower-user-prompt-${intent.id}`}>
                  Your question
                </label>
                <textarea
                  ref={textareaEl}
                  id={`ask-flower-user-prompt-${intent.id}`}
                  class="mt-2 w-full min-h-[170px] max-h-[280px] resize-y rounded-xl border border-border/80 bg-background px-4 py-3 text-sm leading-6 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={userPrompt()}
                  placeholder="What do you want Flower to help you with?"
                  disabled={sending()}
                  onInput={(event) => {
                    setUserPrompt(event.currentTarget.value);
                    if (validationError()) {
                      setValidationError('');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.isComposing) return;
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
                <div class="mt-2 flex items-center gap-2 text-[11px]">
                  <Show when={validationError()}>
                    <span class="text-error">{validationError()}</span>
                  </Show>
                  <span class="ml-auto text-muted-foreground">{promptCharCount()} chars</span>
                </div>
              </div>
            </div>

            <div class="min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div class="min-h-0 rounded-xl border border-border/70 bg-background/80 p-3 flex flex-col gap-3">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context overview</div>
                <div class="flex flex-wrap gap-2">
                  <div class="rounded-full border border-border bg-muted/35 px-2.5 py-1 text-[11px] text-muted-foreground">
                    File paths: {contextSummary().filePaths}
                  </div>
                  <div class="rounded-full border border-border bg-muted/35 px-2.5 py-1 text-[11px] text-muted-foreground">
                    File selections: {contextSummary().fileSelections}
                  </div>
                  <div class="rounded-full border border-border bg-muted/35 px-2.5 py-1 text-[11px] text-muted-foreground">
                    Terminal context: {contextSummary().terminalSelections}
                  </div>
                </div>
                <div class="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <ul class="space-y-2">
                    <For each={contextLines()}>
                      {(line) => (
                        <li class="rounded-md border border-border/50 bg-background/80 px-2.5 py-2 text-xs text-foreground/90 break-all">
                          {line}
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </div>

              <div class="min-h-0 rounded-xl border border-border/70 bg-background/80 p-3 flex flex-col gap-3">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Working directory</div>
                <div class="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-xs font-mono text-foreground break-all">
                  {suggestedWorkingDir() || 'Use environment default working directory'}
                </div>

                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments</div>
                <div class="rounded-lg border border-border/60 bg-muted/20 p-2.5 max-h-24 overflow-auto">
                  <Show
                    when={attachmentNames().length > 0}
                    fallback={<div class="text-xs text-muted-foreground">No attachments queued.</div>}
                  >
                    <ul class="space-y-1">
                      <For each={attachmentNames()}>
                        {(name) => <li class="text-xs text-foreground break-all">{name}</li>}
                      </For>
                    </ul>
                  </Show>
                </div>

                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
                <div class="min-h-0 flex-1 rounded-lg border border-border/60 bg-muted/20 p-2.5 overflow-auto">
                  <Show
                    when={cleanedNotes().length > 0}
                    fallback={<div class="text-xs text-muted-foreground">No extra notes.</div>}
                  >
                    <ul class="space-y-1">
                      <For each={cleanedNotes()}>
                        {(note) => <li class="text-xs text-muted-foreground break-words">{note}</li>}
                      </For>
                    </ul>
                  </Show>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>Tip: Press Cmd/Ctrl + Enter to send.</span>
              <span>{sending() ? 'Flower is preparing your request...' : 'Review context and send when ready.'}</span>
            </div>
          </div>
        </FloatingWindow>
      )}
    </Show>
  );
}
