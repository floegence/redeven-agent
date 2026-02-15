/// <reference lib="webworker" />

// Markdown worker — parses markdown into HTML using marked.
//
// Runs off the main thread to keep streaming chat rendering smooth.

import { Marked } from 'marked';

type MarkdownWorkerRequestLike = {
  id: string;
  content: string;
};

type MarkdownWorkerResponseLike = {
  id: string;
  html: string;
  error?: string;
};

const ctx: DedicatedWorkerGlobalScope = self as any;

let markedInstance: Marked | null = null;

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLanguageClass(lang?: string): string {
  const v = String(lang ?? '').trim();
  if (!v) return '';
  // Avoid breaking attributes if the model/user prints weird code fence info strings.
  const safe = v.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe ? ` language-${safe}` : '';
}

function getMarked(): Marked {
  if (markedInstance) return markedInstance;

  const instance = new Marked();

  // Keep renderer output aligned with the UI styles in chat.css.
  const renderer = {
    link(token: { href: string; title?: string | null; text: string }) {
      const titleAttr = token.title ? ` title="${token.title}"` : '';
      return `<a href="${token.href}" class="chat-md-link" target="_blank" rel="noopener noreferrer"${titleAttr}>${token.text}</a>`;
    },
    codespan(token: { text: string }) {
      return `<code class="chat-md-inline-code">${escapeHtml(token.text)}</code>`;
    },
    code(token: { text: string; lang?: string }) {
      const langClass = normalizeLanguageClass(token.lang).trim() || 'language-text';
      return `<pre class="chat-md-code-block"><code class="${langClass}">${escapeHtml(token.text)}</code></pre>`;
    },
    blockquote(token: { text: string }) {
      return `<blockquote class="chat-md-blockquote">${token.text}</blockquote>`;
    },
    image(token: { href: string; title?: string | null; text: string }) {
      const titleAttr = token.title ? ` title="${token.title}"` : '';
      return `<img src="${token.href}" alt="${token.text}" class="chat-md-image"${titleAttr} />`;
    },
  };

  instance.use({ renderer });
  markedInstance = instance;
  return markedInstance;
}

ctx.addEventListener('message', (ev: MessageEvent<MarkdownWorkerRequestLike>) => {
  const data = ev.data as any;
  const id = String(data?.id ?? '').trim();
  if (!id) return;

  const content = String(data?.content ?? '');

  try {
    const html = getMarked().parse(content, { async: false }) as string;
    const res: MarkdownWorkerResponseLike = { id, html: String(html ?? '') };
    ctx.postMessage(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const res: MarkdownWorkerResponseLike = {
      id,
      html: '',
      error: msg || 'Markdown parse error.',
    };
    ctx.postMessage(res);
  }
});

