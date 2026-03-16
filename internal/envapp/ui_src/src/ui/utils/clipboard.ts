const CLIPBOARD_UNAVAILABLE_MESSAGE = 'Clipboard is not available.';
const CLIPBOARD_WRITE_FAILED_MESSAGE = 'Failed to copy text to clipboard.';

function normalizeClipboardWriteError(error: unknown): Error {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'NotAllowedError') {
    return new Error('Clipboard permission denied.');
  }
  if (error instanceof Error) {
    return new Error(error.message || CLIPBOARD_WRITE_FAILED_MESSAGE);
  }

  const message = String(error ?? '').trim();
  return new Error(message || CLIPBOARD_WRITE_FAILED_MESSAGE);
}

function canUseLegacyClipboard(documentRef: Document | undefined): documentRef is Document & {
  execCommand: (commandId: string) => boolean;
} {
  return Boolean(documentRef?.body) && typeof documentRef?.execCommand === 'function';
}

function writeTextWithLegacyClipboard(text: string, documentRef: Document): void {
  if (!canUseLegacyClipboard(documentRef)) {
    throw new Error(CLIPBOARD_UNAVAILABLE_MESSAGE);
  }

  const textarea = documentRef.createElement('textarea');
  const activeElement = documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;

  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  documentRef.body.append(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    if (!documentRef.execCommand('copy')) {
      throw new Error(CLIPBOARD_WRITE_FAILED_MESSAGE);
    }
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}

export async function writeTextToClipboard(text: string): Promise<void> {
  const normalizedText = String(text ?? '');

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(normalizedText);
      return;
    } catch (error) {
      try {
        writeTextWithLegacyClipboard(normalizedText, document);
        return;
      } catch {
        throw normalizeClipboardWriteError(error);
      }
    }
  }

  if (typeof document !== 'undefined') {
    writeTextWithLegacyClipboard(normalizedText, document);
    return;
  }

  throw new Error(CLIPBOARD_UNAVAILABLE_MESSAGE);
}
