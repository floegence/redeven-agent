import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';

const DOCX_RENDER_CLASS_NAME = 'docx-preview-container';
const DOCX_PREVIEW_INSET = 12;

type DocxLayout = {
  width: number;
  height: number;
};

type DocxRenderAsync = typeof import('docx-preview').renderAsync;

function parsePixelValue(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readElementWidth(element: HTMLElement): number {
  return Math.max(element.offsetWidth, element.scrollWidth, parsePixelValue(element.style.width));
}

function readElementHeight(element: HTMLElement): number {
  return Math.max(
    element.offsetHeight,
    element.scrollHeight,
    parsePixelValue(element.style.height),
    parsePixelValue(element.style.minHeight),
  );
}

function measureDocxLayout(host: HTMLDivElement): DocxLayout | null {
  const pages = Array.from(host.querySelectorAll<HTMLElement>(`section.${DOCX_RENDER_CLASS_NAME}`));
  const width = Math.max(host.offsetWidth, host.scrollWidth, ...pages.map(readElementWidth));
  const height = Math.max(host.offsetHeight, host.scrollHeight, ...pages.map(readElementHeight));

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export interface DocxPreviewPaneProps {
  bytes?: Uint8Array<ArrayBuffer> | null;
}

export function DocxPreviewPane(props: DocxPreviewPaneProps) {
  const [renderError, setRenderError] = createSignal<string | null>(null);
  const [viewportWidth, setViewportWidth] = createSignal(0);
  const [layout, setLayout] = createSignal<DocxLayout | null>(null);
  let viewportEl: HTMLDivElement | undefined;
  let hostEl: HTMLDivElement | undefined;

  const syncViewportMetrics = () => {
    setViewportWidth(viewportEl?.clientWidth ?? 0);
    const measuredLayout = hostEl ? measureDocxLayout(hostEl) : null;
    if (measuredLayout) {
      setLayout(measuredLayout);
    }
  };

  onMount(() => {
    syncViewportMetrics();
    if (!viewportEl) return;

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncViewportMetrics);
      onCleanup(() => {
        window.removeEventListener('resize', syncViewportMetrics);
      });
      return;
    }

    const observer = new ResizeObserver(() => {
      syncViewportMetrics();
    });
    observer.observe(viewportEl);
    onCleanup(() => {
      observer.disconnect();
    });
  });

  createEffect(() => {
    const bytes = props.bytes;
    const host = hostEl;

    setRenderError(null);
    setLayout(null);
    if (host) {
      host.innerHTML = '';
    }
    if (!bytes || !host) return;

    let disposed = false;

    void (async () => {
      try {
        const module = await import('docx-preview');
        if (disposed) return;

        const renderAsync = (module.renderAsync ?? null) as DocxRenderAsync | null;
        if (!renderAsync) {
          throw new Error('renderAsync not found');
        }

        await renderAsync(bytes, host, undefined, {
          className: DOCX_RENDER_CLASS_NAME,
          inWrapper: false,
          breakPages: true,
          ignoreWidth: false,
          ignoreLastRenderedPageBreak: true,
          useBase64URL: false,
        });
        if (disposed) return;

        await waitForNextFrame();
        if (disposed) return;

        syncViewportMetrics();
      } catch (error) {
        if (disposed) return;
        setRenderError(error instanceof Error ? error.message : String(error));
      }
    })();

    onCleanup(() => {
      disposed = true;
      if (host) {
        host.innerHTML = '';
      }
    });
  });

  const scale = createMemo(() => {
    const currentLayout = layout();
    if (!currentLayout) return 1;
    const availableWidth = Math.max(0, viewportWidth() - DOCX_PREVIEW_INSET * 2);
    if (availableWidth <= 0) return 1;
    return Math.min(1, availableWidth / currentLayout.width);
  });

  const frameStyle = createMemo<Record<string, string> | undefined>(() => {
    const currentLayout = layout();
    if (!currentLayout) return undefined;

    return {
      width: `${currentLayout.width * scale()}px`,
      height: `${currentLayout.height * scale()}px`,
    };
  });

  const contentStyle = createMemo<Record<string, string> | undefined>(() => {
    const currentLayout = layout();
    if (!currentLayout) return undefined;

    return {
      width: `${currentLayout.width}px`,
      height: `${currentLayout.height}px`,
      transform: `scale(${scale()})`,
      'transform-origin': 'top left',
    };
  });

  return (
    <Show
      when={!renderError()}
      fallback={
        <div class="p-4 text-sm text-error">
          <div class="mb-1 font-medium">Failed to load file</div>
          <div class="text-xs text-muted-foreground">{renderError()}</div>
        </div>
      }
    >
      <div ref={viewportEl} class="docx-preview-pane h-full min-h-full w-full">
        <div class="box-border min-h-full w-full p-3">
          <div class="docx-preview-pane__frame relative mx-auto" style={frameStyle()}>
            <div class="docx-preview-pane__content absolute top-0 left-0" style={contentStyle()}>
              <div ref={hostEl} class="docx-preview-pane__document" />
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
