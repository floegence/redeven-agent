// TodosBlock — inline display of write_todos results as a compact card list.

import { For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';

export interface TodosBlockProps {
  version: number;
  updatedAtUnixMs: number;
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    note?: string;
  }>;
  class?: string;
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'in_progress':
      return { label: 'In progress', cls: 'chat-todos-status-badge-progress' };
    case 'completed':
      return { label: 'Completed', cls: 'chat-todos-status-badge-completed' };
    case 'cancelled':
      return { label: 'Cancelled', cls: 'chat-todos-status-badge-cancelled' };
    default:
      return { label: 'Pending', cls: 'chat-todos-status-badge-pending' };
  }
}

function formatTime(ms: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const TodosBlock: Component<TodosBlockProps> = (props) => {
  return (
    <div class={cn('chat-todos-block', props.class)}>
      <div class="chat-todos-list">
        <For each={props.todos}>
          {(item) => {
            const badge = () => statusBadge(item.status);
            return (
              <div class="chat-todos-item">
                <div class="chat-todos-item-row">
                  <span class={cn('chat-todos-status-badge', badge().cls)}>
                    {badge().label}
                  </span>
                  <span class="chat-todos-content">{item.content}</span>
                </div>
                <Show when={item.note}>
                  <div class="chat-todos-note">{item.note}</div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <div class="chat-todos-footer">
        <span>Version {props.version}</span>
        <Show when={props.updatedAtUnixMs > 0}>
          <span>Updated {formatTime(props.updatedAtUnixMs)}</span>
        </Show>
      </div>
    </div>
  );
};
