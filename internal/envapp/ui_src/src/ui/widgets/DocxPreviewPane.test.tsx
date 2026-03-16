// @vitest-environment jsdom

import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocxPreviewPane } from './DocxPreviewPane';

const renderAsyncMock = vi.hoisted(() => vi.fn());
const resizeObserverState = vi.hoisted(() => ({
  observers: [] as Array<{
    callback: ResizeObserverCallback;
    elements: Element[];
  }>,
}));

vi.mock('docx-preview', () => ({
  renderAsync: renderAsyncMock,
}));

function defineElementSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, 'offsetWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => height,
  });
}

function setViewportWidth(element: HTMLElement, width: number) {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
}

function triggerResizeObservers() {
  for (const observer of resizeObserverState.observers) {
    observer.callback(
      observer.elements.map((element) => ({ target: element }) as ResizeObserverEntry),
      {} as ResizeObserver,
    );
  }
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(predicate: () => boolean, errorMessage: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flushAsyncWork();
  }
  throw new Error(errorMessage);
}

function mockRenderedDocx(width: number, height: number) {
  renderAsyncMock.mockImplementation(async (_bytes, container: HTMLElement, _styleContainer, options: { className: string }) => {
    const page = document.createElement('section');
    page.className = options.className;
    page.style.width = `${width}px`;
    page.style.minHeight = `${height}px`;
    defineElementSize(page, width, height);
    container.appendChild(page);
    defineElementSize(container, width, height);
  });
}

beforeEach(() => {
  renderAsyncMock.mockReset();
  resizeObserverState.observers.length = 0;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    return window.setTimeout(() => {
      callback(performance.now());
    }, 0);
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    window.clearTimeout(handle);
  });

  vi.stubGlobal('ResizeObserver', class {
    private readonly record: {
      callback: ResizeObserverCallback;
      elements: Element[];
    };

    constructor(callback: ResizeObserverCallback) {
      this.record = {
        callback,
        elements: [],
      };
      resizeObserverState.observers.push(this.record);
    }

    observe(element: Element) {
      this.record.elements.push(element);
    }

    unobserve(element: Element) {
      this.record.elements = this.record.elements.filter((entry) => entry !== element);
    }

    disconnect() {
      this.record.elements = [];
    }
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DocxPreviewPane', () => {
  it('renders docx without the library wrapper and scales down in a narrow viewport', async () => {
    mockRenderedDocx(800, 1200);

    const host = document.createElement('div');
    document.body.appendChild(host);

    render(() => <DocxPreviewPane bytes={new Uint8Array([1, 2, 3])} />, host);

    const viewport = host.querySelector('.docx-preview-pane') as HTMLDivElement | null;
    expect(viewport).toBeTruthy();
    setViewportWidth(viewport!, 424);

    triggerResizeObservers();
    await flushAsyncWork();

    expect(renderAsyncMock).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(HTMLElement),
      undefined,
      expect.objectContaining({
        className: 'docx-preview-container',
        inWrapper: false,
      }),
    );

    const frame = host.querySelector('.docx-preview-pane__frame') as HTMLDivElement | null;
    const content = host.querySelector('.docx-preview-pane__content') as HTMLDivElement | null;

    await waitFor(() => frame?.style.width === '400px' && content?.style.transform === 'scale(0.5)', 'Docx preview did not scale down');

    expect(frame?.style.width).toBe('400px');
    expect(frame?.style.height).toBe('600px');
    expect(content?.style.transform).toBe('scale(0.5)');
  });

  it('keeps a 1:1 page scale when the viewport is wide enough', async () => {
    mockRenderedDocx(800, 1200);

    const host = document.createElement('div');
    document.body.appendChild(host);

    render(() => <DocxPreviewPane bytes={new Uint8Array([1, 2, 3])} />, host);

    const viewport = host.querySelector('.docx-preview-pane') as HTMLDivElement | null;
    expect(viewport).toBeTruthy();
    setViewportWidth(viewport!, 960);

    triggerResizeObservers();
    await flushAsyncWork();

    const frame = host.querySelector('.docx-preview-pane__frame') as HTMLDivElement | null;
    const content = host.querySelector('.docx-preview-pane__content') as HTMLDivElement | null;

    await waitFor(() => frame?.style.width === '800px' && content?.style.transform === 'scale(1)', 'Docx preview did not keep 1:1 scale');

    expect(frame?.style.width).toBe('800px');
    expect(frame?.style.height).toBe('1200px');
    expect(content?.style.transform).toBe('scale(1)');
  });

  it('recomputes the scale when the viewport width changes', async () => {
    mockRenderedDocx(800, 1200);

    const host = document.createElement('div');
    document.body.appendChild(host);

    render(() => <DocxPreviewPane bytes={new Uint8Array([1, 2, 3])} />, host);

    const viewport = host.querySelector('.docx-preview-pane') as HTMLDivElement | null;
    expect(viewport).toBeTruthy();

    setViewportWidth(viewport!, 824);
    triggerResizeObservers();
    await flushAsyncWork();

    const content = host.querySelector('.docx-preview-pane__content') as HTMLDivElement | null;
    await waitFor(() => content?.style.transform === 'scale(1)', 'Docx preview did not render at natural scale');
    expect(content?.style.transform).toBe('scale(1)');

    setViewportWidth(viewport!, 424);
    triggerResizeObservers();
    await waitFor(() => content?.style.transform === 'scale(0.5)', 'Docx preview did not update after resize');

    expect(content?.style.transform).toBe('scale(0.5)');
  });

  it('clears the rendered document when the component unmounts', async () => {
    mockRenderedDocx(800, 1200);

    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(() => <DocxPreviewPane bytes={new Uint8Array([1, 2, 3])} />, host);

    const viewport = host.querySelector('.docx-preview-pane') as HTMLDivElement | null;
    expect(viewport).toBeTruthy();
    setViewportWidth(viewport!, 960);

    triggerResizeObservers();
    await flushAsyncWork();

    const documentHost = host.querySelector('.docx-preview-pane__document') as HTMLDivElement | null;
    expect(documentHost?.innerHTML).not.toBe('');

    dispose();

    expect(documentHost?.innerHTML).toBe('');
  });
});
