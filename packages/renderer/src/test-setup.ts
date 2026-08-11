import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Without vitest `globals: true`, testing-library's auto-cleanup never
// registers — unmount between tests explicitly or DOMs leak across tests.
afterEach(cleanup);

// Shims for @xyflow/react under jsdom (per xyflow testing guidance).
// React Flow measures node dimensions through a ResizeObserver: its callback reads
// `entry.target` and pulls offsetWidth/offsetHeight (shimmed below). Edges are only
// laid out once both endpoints are measured, so a no-op observe would leave every edge
// (and its label) unrendered. Fire the callback on observe, matching xyflow's own jsdom
// testing guidance, so nodes gain dimensions and edges resolve.
class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // The node observer reads offsetWidth/offsetHeight off the target; the pane's extent
    // observer reads entry.contentRect. Provide both so neither path throws under jsdom.
    const entry = {
      target,
      contentRect: { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 },
    };
    this.callback([entry as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
    this.m22 = scale !== undefined ? +scale : 1;
  }
}

if (typeof window !== 'undefined') {
  // jsdom has no DragEvent constructor (https://github.com/jsdom/jsdom/issues/2913), so
  // testing-library's fireEvent.drop falls back to the base Event constructor, which
  // silently drops clientX/clientY (they aren't part of EventInit). Shim DragEvent as a
  // thin MouseEvent subclass — MouseEvent already carries clientX/clientY under jsdom —
  // so drop handlers that read the pointer position see real values in tests. Declared
  // inside this guard because `extends MouseEvent` would throw in the node environment
  // some sibling test files run under (MouseEvent doesn't exist there).
  class DragEventStub extends MouseEvent {
    dataTransfer: DataTransfer | null;
    constructor(type: string, eventInitDict?: MouseEventInit & { dataTransfer?: DataTransfer | null }) {
      super(type, eventInitDict);
      this.dataTransfer = eventInitDict?.dataTransfer ?? null;
    }
  }
  window.DragEvent = window.DragEvent ?? (DragEventStub as unknown as typeof DragEvent);
  window.ResizeObserver = window.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);
  // jsdom has no layout engine, so it doesn't implement elementFromPoint at all (not even
  // as a stub) — DiagramView's library-entry drop resolves the drop-target node through it,
  // so it must exist (and be spy-able) under test. Default to "nothing there" (matches real
  // browsers when the point is outside the viewport); tests that care mock a real return.
  window.document.elementFromPoint =
    window.document.elementFromPoint ?? ((): Element | null => null);
  (globalThis as Record<string, unknown>)['DOMMatrixReadOnly'] =
    (globalThis as Record<string, unknown>)['DOMMatrixReadOnly'] ?? DOMMatrixReadOnlyStub;
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetHeight: { get: () => 600, configurable: true },
    offsetWidth: { get: () => 800, configurable: true },
  });
  (window.SVGElement.prototype as unknown as { getBBox: () => object }).getBBox =
    (window.SVGElement.prototype as unknown as { getBBox?: () => object }).getBBox ??
    (() => ({ x: 0, y: 0, width: 0, height: 0 }));

  // jsdom 29 canonicalizes specified SVG paint colors (e.g. `#123456` -> `rgb(18, 52, 86)`)
  // when they are written to an inline style. Real browsers preserve the specified value in
  // the `style` attribute and only normalize in getComputedStyle, so tint assertions that read
  // the raw attribute fail under jsdom. Restore browser-accurate behavior by storing the
  // specified value verbatim for the paint properties React writes on edge paths.
  const cssProps = (globalThis as Record<string, unknown>)['CSSStyleProperties'] as
    | { prototype: object }
    | undefined;
  const marker = '__dgPaintShim';
  const g = globalThis as Record<string, unknown>;
  if (cssProps !== undefined && g[marker] !== true) {
    const probe = window.document.createElementNS('http://www.w3.org/2000/svg', 'path').style;
    const implSymbol = Object.getOwnPropertySymbols(probe).find((s) => {
      const impl = (probe as unknown as Record<symbol, unknown>)[s] as { _setProperty?: unknown } | null;
      return impl !== null && typeof impl === 'object' && typeof impl._setProperty === 'function';
    });
    if (implSymbol !== undefined) {
      g[marker] = true;
      for (const prop of ['stroke', 'fill']) {
        const original = Object.getOwnPropertyDescriptor(cssProps.prototype, prop);
        Object.defineProperty(cssProps.prototype, prop, {
          configurable: true,
          enumerable: original?.enumerable ?? true,
          get(this: object) {
            return original?.get?.call(this);
          },
          set(this: Record<symbol, unknown>, value: unknown) {
            const impl = this[implSymbol] as { _setProperty: (p: string, v: string) => void };
            impl._setProperty(prop, String(value).trim());
          },
        });
      }
    }
  }
}
