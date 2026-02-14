// SourcesBlock — refined grid display of web search source links with favicon,
// numbered badges, and collapsible overflow.

import { For, Show, createSignal } from 'solid-js';
import type { Component } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';

export interface SourcesBlockProps {
  sources: Array<{ title: string; url: string }>;
  class?: string;
}

/** Visible-by-default threshold; sources beyond this are collapsed. */
const VISIBLE_LIMIT = 4;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Build a Google Favicon API URL for the given domain. */
function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`;
}

export const SourcesBlock: Component<SourcesBlockProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const visibleSources = () => {
    if (expanded() || props.sources.length <= VISIBLE_LIMIT) {
      return props.sources;
    }
    return props.sources.slice(0, VISIBLE_LIMIT);
  };

  const hiddenCount = () => Math.max(0, props.sources.length - VISIBLE_LIMIT);

  return (
    <div class={cn('chat-sources-block', props.class)}>
      {/* Header */}
      <div class="chat-sources-header">
        {/* BookOpen icon */}
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
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <span>Sources</span>
        <span class="chat-sources-count-badge">{props.sources.length}</span>
      </div>

      {/* Source list */}
      <div class="chat-sources-list">
        <For each={visibleSources()}>
          {(src, index) => {
            const domain = extractDomain(src.url);
            const [faviconError, setFaviconError] = createSignal(false);

            return (
              <a
                class="chat-sources-item"
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="chat-sources-badge">
                  <Show
                    when={!faviconError()}
                    fallback={<span class="chat-sources-badge-number">{index() + 1}</span>}
                  >
                    <img
                      class="chat-sources-favicon"
                      src={faviconUrl(domain)}
                      alt=""
                      width="16"
                      height="16"
                      loading="lazy"
                      onError={() => setFaviconError(true)}
                    />
                  </Show>
                  <span class="chat-sources-index">{index() + 1}</span>
                </div>
                <div class="chat-sources-item-text">
                  <span class="chat-sources-title">{src.title}</span>
                  <span class="chat-sources-domain">{domain}</span>
                </div>
              </a>
            );
          }}
        </For>
      </div>

      {/* Expand / collapse toggle */}
      <Show when={hiddenCount() > 0}>
        <button
          class="chat-sources-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          <svg
            class={cn('chat-sources-toggle-icon', expanded() && 'chat-sources-toggle-icon-open')}
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
            <path d="m6 9 6 6 6-6" />
          </svg>
          {expanded()
            ? 'Show less'
            : `Show ${hiddenCount()} more source${hiddenCount() > 1 ? 's' : ''}`}
        </button>
      </Show>
    </div>
  );
};
