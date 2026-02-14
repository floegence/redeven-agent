// ShellBlock — terminal-style command display with collapsible output and status indicators.

import { Show, createSignal, createEffect } from 'solid-js';
import type { Component } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';

export interface ShellBlockProps {
  command: string;
  output?: string;
  exitCode?: number;
  status: 'running' | 'success' | 'error';
  class?: string;
}

/**
 * Renders a terminal-style block showing a shell command, its output,
 * and exit code. Output is collapsed by default (except when running)
 * and can be toggled by clicking the header.
 */
export const ShellBlock: Component<ShellBlockProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  // Auto-expand when running; preserve user choice when finished.
  createEffect(() => {
    if (props.status === 'running') {
      setExpanded(true);
    }
  });

  const hasOutput = () => !!props.output;
  const canToggle = () => hasOutput() || props.status === 'running';

  const statusClass = () => {
    switch (props.status) {
      case 'running':
        return 'chat-shell-block-running';
      case 'error':
        return 'chat-shell-block-error';
      default:
        return 'chat-shell-block-success';
    }
  };

  const handleHeaderClick = () => {
    if (!canToggle()) return;
    setExpanded((v) => !v);
  };

  return (
    <div class={cn('chat-shell-block', statusClass(), props.class)}>
      {/* Command header — clickable to toggle */}
      <div
        class={cn('chat-shell-command', canToggle() && 'chat-shell-command-toggle')}
        onClick={handleHeaderClick}
      >
        {/* Status icon */}
        <Show when={props.status === 'running'}>
          <span class="chat-shell-status-icon" aria-label="Running">
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
              class="chat-shell-spinner"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        </Show>
        <Show when={props.status === 'success'}>
          <span class="chat-shell-status-icon chat-shell-status-success" aria-label="Success">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        </Show>
        <Show when={props.status === 'error'}>
          <span class="chat-shell-status-icon chat-shell-status-error" aria-label="Error">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </span>
        </Show>

        <span class="chat-shell-prompt">$</span>
        <span class="chat-shell-command-text">{props.command}</span>

        {/* Exit code / duration inline */}
        <Show when={props.status !== 'running' && props.exitCode !== undefined}>
          <span class={cn(
            'chat-shell-exit-inline',
            props.exitCode === 0 ? 'chat-shell-exit-inline-success' : 'chat-shell-exit-inline-error',
          )}>
            exit {props.exitCode}
          </span>
        </Show>

        {/* Chevron toggle */}
        <Show when={canToggle()}>
          <span class={cn('chat-shell-toggle', expanded() && 'chat-shell-toggle-open')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </Show>
      </div>

      {/* Collapsible output area */}
      <div
        class={cn(
          'chat-shell-output-wrapper',
          expanded() ? 'chat-shell-output-wrapper-open' : 'chat-shell-output-wrapper-closed',
        )}
      >
        <Show when={props.output}>
          <div
            class={cn(
              'chat-shell-output',
              props.status === 'error' && 'chat-shell-output-error',
            )}
          >
            <pre>{props.output}</pre>
          </div>
        </Show>
      </div>
    </div>
  );
};
