// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFitKey } from './useFitKey';

const press = (key: string, init: KeyboardEventInit & { target?: Element } = {}) => {
  const { target, ...rest } = init;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...rest });
  (target ?? window).dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useFitKey', () => {
  it('fits the view on F, and takes the key', () => {
    const fit = vi.fn();
    renderHook(() => useFitKey({ chromeless: false, builtinKeys: true, fit }));
    const event = press('f');
    expect(fit).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    press('F');
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it('calls the latest fit, so a host that rebuilds it every render is not stuck with the first', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = renderHook(({ fit }) => useFitKey({ chromeless: false, builtinKeys: true, fit }), {
      initialProps: { fit: first },
    });
    view.rerender({ fit: second });
    press('f');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('leaves a modified, repeated or typed F to the browser and the field', () => {
    const fit = vi.fn();
    renderHook(() => useFitKey({ chromeless: false, builtinKeys: true, fit }));
    press('f', { ctrlKey: true });
    press('f', { metaKey: true });
    press('f', { altKey: true });
    press('f', { repeat: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('f', { target: input });
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    press('f', { target: editable });
    expect(fit).not.toHaveBeenCalled();
  });

  it('stands down for the export render and for a host that owns the keyboard', () => {
    const fit = vi.fn();
    renderHook(() => useFitKey({ chromeless: true, builtinKeys: true, fit }));
    renderHook(() => useFitKey({ chromeless: false, builtinKeys: false, fit }));
    press('f');
    expect(fit).not.toHaveBeenCalled();
  });

  it('removes its listener when unmounted', () => {
    const fit = vi.fn();
    const view = renderHook(() => useFitKey({ chromeless: false, builtinKeys: true, fit }));
    view.unmount();
    press('f');
    expect(fit).not.toHaveBeenCalled();
  });
});
