// ToolCallBlock — tool call display with approval workflow and ask_user interaction.

import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import type { Component } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';
import { useChatContext } from '../ChatProvider';
import type { Message, ToolCallBlock as ToolCallBlockType } from '../types';
import { BlockRenderer } from './BlockRenderer';

const ASK_USER_TOOL_NAME = 'ask_user';

export interface ToolCallBlockProps {
  block: ToolCallBlockType;
  messageId: string;
  blockIndex: number;
  class?: string;
}

type AskUserDisplay = {
  question: string;
  source: string;
  options: string[];
};

// Chevron icon for collapse toggle (rotatable)
const ChevronIcon: Component<{ collapsed: boolean }> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style={{
      transform: props.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
      transition: 'transform 0.15s ease',
    }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Status icons for different tool call states
const StatusIcon: Component<{ status: ToolCallBlockType['status'] }> = (props) => {
  const iconStyle = { 'flex-shrink': '0' } as const;

  return (
    <>
      {props.status === 'pending' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="chat-tool-status-icon chat-tool-status-pending"
          style={iconStyle}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )}
      {props.status === 'running' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="chat-tool-status-icon chat-tool-status-running chat-tool-spinner"
          style={iconStyle}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {props.status === 'success' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="chat-tool-status-icon chat-tool-status-success"
          style={iconStyle}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {props.status === 'error' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="chat-tool-status-icon chat-tool-status-error"
          style={iconStyle}
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </>
  );
};

function summarizeArgs(args: Record<string, unknown>): string {
  const text = JSON.stringify(args);
  if (text.length <= 50) return text;
  return text.slice(0, 47) + '...';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeAskUserOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const options: string[] = [];
  for (const item of value) {
    const text = asTrimmedString(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(text);
    if (options.length >= 4) break;
  }
  return options;
}

function buildAskUserDisplay(block: ToolCallBlockType): AskUserDisplay | null {
  if (String(block.toolName ?? '').trim() !== ASK_USER_TOOL_NAME) {
    return null;
  }
  const args = asRecord(block.args);
  const result = asRecord(block.result);
  const question = asTrimmedString(args?.question) || asTrimmedString(result?.question);
  if (!question) {
    return null;
  }
  const optionsFromResult = normalizeAskUserOptions(result?.options);
  const optionsFromArgs = normalizeAskUserOptions(args?.options);
  const source = asTrimmedString(result?.source);
  return {
    question,
    source,
    options: optionsFromResult.length > 0 ? optionsFromResult : optionsFromArgs,
  };
}

function humanizeAskUserSource(source: string): string {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return normalized
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

interface AskUserToolCardProps {
  block: ToolCallBlockType;
  messageId: string;
  display: AskUserDisplay;
  class?: string;
}

function extractUserReplyText(message: Message): string {
  const blocks = Array.isArray(message.blocks) ? message.blocks : [];
  const textParts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'markdown') {
      const content = asTrimmedString(block.content);
      if (content) {
        textParts.push(content);
      }
    }
  }
  const merged = textParts.join('\n').trim();
  if (merged) {
    return merged;
  }
  if (blocks.length > 0) {
    return '[Non-text reply]';
  }
  return '';
}

const AskUserToolCard: Component<AskUserToolCardProps> = (props) => {
  const ctx = useChatContext();
  const [selectedOptionIndex, setSelectedOptionIndex] = createSignal<number>(-1);
  const [useCustomReply, setUseCustomReply] = createSignal(false);
  const [customReply, setCustomReply] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [submittedReply, setSubmittedReply] = createSignal('');

  const historicalReply = createMemo(() => {
    const messages = ctx.messages();
    const currentIndex = messages.findIndex((message) => message.id === props.messageId);
    if (currentIndex < 0) {
      return '';
    }
    for (let index = currentIndex + 1; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'user') {
        continue;
      }
      return extractUserReplyText(message);
    }
    return '';
  });
  const promptKey = createMemo(
    () => `${props.display.question}\u001f${props.display.options.join('\u001f')}`,
  );
  const sourceLabel = createMemo(() => humanizeAskUserSource(props.display.source));
  const resolvedReply = createMemo(() => submittedReply() || historicalReply());
  const controlsDisabled = createMemo(
    () => submitting() || ctx.isWorking() || resolvedReply().length > 0,
  );
  const canSubmitCustomReply = createMemo(
    () => useCustomReply() && customReply().trim().length > 0 && !controlsDisabled(),
  );
  const resolvedReplyLabel = createMemo(() =>
    historicalReply().length > 0 ? 'Selected reply' : 'Reply sent',
  );

  createEffect(() => {
    promptKey();
    setSelectedOptionIndex(-1);
    setUseCustomReply(false);
    setCustomReply('');
    setSubmitting(false);
    setSubmittedReply('');
  });

  const submitReply = async (value: string) => {
    const content = asTrimmedString(value);
    if (!content || controlsDisabled()) {
      return;
    }
    setSubmitting(true);
    try {
      await ctx.sendMessage(content, []);
      setSubmittedReply(content);
    } catch (error) {
      console.error('ask_user reply submit failed', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOptionSelect = (index: number) => {
    if (controlsDisabled()) return;
    const option = props.display.options[index];
    if (!option) return;
    setSelectedOptionIndex(index);
    setUseCustomReply(false);
    void submitReply(option);
  };

  const handleCustomFocus = () => {
    if (controlsDisabled()) return;
    setUseCustomReply(true);
    setSelectedOptionIndex(-1);
  };

  const handleCustomInput = (value: string) => {
    setCustomReply(value);
    if (!useCustomReply()) {
      setUseCustomReply(true);
      setSelectedOptionIndex(-1);
    }
  };

  const handleCustomSubmit = async () => {
    if (!canSubmitCustomReply()) {
      return;
    }
    await submitReply(customReply());
  };

  return (
    <div class={cn('chat-tool-ask-user-block', resolvedReply() && 'chat-tool-ask-user-block-completed', props.class)}>
      <div class="chat-tool-ask-user-head">
        <span class="chat-tool-ask-user-badge">Input Requested</span>
        <Show when={sourceLabel()}>
          <span class="chat-tool-ask-user-source-tag">{sourceLabel()}</span>
        </Show>
      </div>

      <p class="chat-tool-ask-user-question">{props.display.question}</p>

      <Show when={resolvedReply()} fallback={
        <>
          <div class="chat-tool-ask-user-options" role="radiogroup" aria-label="Ask user reply options">
            <For each={props.display.options}>
              {(option, index) => (
                <label
                  class={cn(
                    'chat-tool-ask-user-option-row',
                    !useCustomReply() &&
                      selectedOptionIndex() === index() &&
                      'chat-tool-ask-user-option-row-selected',
                  )}
                >
                  <input
                    type="radio"
                    class="chat-tool-ask-user-option-radio"
                    name={`ask-user-reply-${props.block.toolId}`}
                    checked={!useCustomReply() && selectedOptionIndex() === index()}
                    onChange={() => handleOptionSelect(index())}
                    disabled={controlsDisabled()}
                  />
                  <span class="chat-tool-ask-user-option-text">{option}</span>
                </label>
              )}
            </For>

            <label
              class={cn(
                'chat-tool-ask-user-option-row chat-tool-ask-user-custom-row',
                useCustomReply() && 'chat-tool-ask-user-custom-row-active',
              )}
            >
              <input
                type="radio"
                class="chat-tool-ask-user-option-radio"
                name={`ask-user-reply-${props.block.toolId}`}
                checked={useCustomReply()}
                onChange={() => handleCustomFocus()}
                disabled={controlsDisabled()}
              />
              <div class="chat-tool-ask-user-custom-main">
                <input
                  class="chat-tool-ask-user-custom-input"
                  value={customReply()}
                  onFocus={() => handleCustomFocus()}
                  onInput={(event) => handleCustomInput(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleCustomSubmit();
                    }
                  }}
                  placeholder="None of above"
                  aria-label="Custom ask user reply"
                  disabled={controlsDisabled()}
                />
                <button
                  type="button"
                  class="chat-tool-ask-user-custom-submit"
                  disabled={!canSubmitCustomReply()}
                  onClick={() => void handleCustomSubmit()}
                >
                  Send
                </button>
              </div>
            </label>
          </div>
          <p class="chat-tool-ask-user-hint">Select one reply, or type your own and send.</p>
        </>
      }>
        <div class="chat-tool-ask-user-submitted">
          <span class="chat-tool-ask-user-submitted-label">{resolvedReplyLabel()}</span>
          <p class="chat-tool-ask-user-submitted-text">{resolvedReply()}</p>
        </div>
      </Show>

      <Show when={props.block.error}>
        <div class="chat-tool-ask-user-error">{props.block.error}</div>
      </Show>
    </div>
  );
};

/**
 * Renders a tool call block with collapsible body, status indicators,
 * and an approval workflow for tools that require user consent.
 */
export const ToolCallBlock: Component<ToolCallBlockProps> = (props) => {
  const ctx = useChatContext();
  const askUserDisplay = createMemo(() => buildAskUserDisplay(props.block));

  const isCollapsed = () => props.block.collapsed ?? false;
  const showApproval = () =>
    props.block.requiresApproval === true &&
    props.block.approvalState === 'required';

  const handleToggle = () => {
    ctx.toggleToolCollapse(props.messageId, props.block.toolId);
  };

  const handleApprove = (event: MouseEvent) => {
    event.stopPropagation();
    ctx.approveToolCall(props.messageId, props.block.toolId, true);
  };

  const handleReject = (event: MouseEvent) => {
    event.stopPropagation();
    ctx.approveToolCall(props.messageId, props.block.toolId, false);
  };

  const collapsedSummary = () => summarizeArgs(props.block.args);

  if (askUserDisplay()) {
    return (
      <AskUserToolCard
        block={props.block}
        messageId={props.messageId}
        display={askUserDisplay() as AskUserDisplay}
        class={props.class}
      />
    );
  }

  return (
    <div class={cn('chat-tool-call-block', props.class)}>
      <div class="chat-tool-call-header" onClick={handleToggle}>
        <button
          class="chat-tool-collapse-btn"
          aria-label={isCollapsed() ? 'Expand' : 'Collapse'}
        >
          <ChevronIcon collapsed={isCollapsed()} />
        </button>

        <StatusIcon status={props.block.status} />

        <span class="chat-tool-name">{props.block.toolName}</span>

        <Show when={showApproval()}>
          <div class="chat-tool-approval-actions">
            <button
              class="chat-tool-approval-btn chat-tool-approval-btn-approve"
              onClick={handleApprove}
            >
              Allow
            </button>
            <button
              class="chat-tool-approval-btn chat-tool-approval-btn-reject"
              onClick={handleReject}
            >
              Deny
            </button>
          </div>
        </Show>

        <Show when={isCollapsed()}>
          <span class="chat-tool-summary">{collapsedSummary()}</span>
        </Show>
      </div>

      <Show when={!isCollapsed()}>
        <div class="chat-tool-call-body">
          <div class="chat-tool-section">
            <div class="chat-tool-section-label">Arguments</div>
            <pre class="chat-tool-args">
              {JSON.stringify(props.block.args, null, 2)}
            </pre>
          </div>

          <Show when={props.block.result !== undefined}>
            <div class="chat-tool-section">
              <div class="chat-tool-section-label">Result</div>
              <pre class="chat-tool-result">
                {JSON.stringify(props.block.result, null, 2)}
              </pre>
            </div>
          </Show>

          <Show when={props.block.error}>
            <div class="chat-tool-section chat-tool-error-section">
              <div class="chat-tool-section-label">Error</div>
              <div class="chat-tool-error">{props.block.error}</div>
            </div>
          </Show>

          <Show when={props.block.children && props.block.children.length > 0}>
            <div class="chat-tool-children">
              <For each={props.block.children}>
                {(child) => (
                  <BlockRenderer
                    block={child}
                    messageId={props.messageId}
                    blockIndex={props.blockIndex}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
