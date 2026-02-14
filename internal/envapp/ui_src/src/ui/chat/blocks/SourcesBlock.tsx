// SourcesBlock — grid display of web search source links.

import { For } from 'solid-js';
import type { Component } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';

export interface SourcesBlockProps {
  sources: Array<{ title: string; url: string }>;
  class?: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const SourcesBlock: Component<SourcesBlockProps> = (props) => {
  return (
    <div class={cn('chat-sources-block', props.class)}>
      <div class="chat-sources-header">
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
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
        <span>Sources ({props.sources.length})</span>
      </div>
      <div class="chat-sources-list">
        <For each={props.sources}>
          {(src) => (
            <a
              class="chat-sources-item"
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                class="chat-sources-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <div class="chat-sources-item-text">
                <span class="chat-sources-title">{src.title}</span>
                <span class="chat-sources-domain">{extractDomain(src.url)}</span>
              </div>
            </a>
          )}
        </For>
      </div>
    </div>
  );
};
