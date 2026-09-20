// @vitest-environment jsdom
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCanvasGestures, type CanvasGesturesInput } from './useCanvasGestures';

function inputFor(over: Partial<CanvasGesturesInput> = {}): CanvasGesturesInput {
  return {
    editing: true,
    tool: 'pen',
    drillRoot: undefined,
    chromeless: false,
    builtinKeys: true,
    modelId: 'm1',
    pen: undefined,
    onAddStroke: undefined,
    toFlow: (p) => p,
    ...over,
  };
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });

describe('useCanvasGestures', () => {
  it('activates pen/eraser from the edit tool, but never while drilled', () => {
    const { result, rerender } = renderHook((p: CanvasGesturesInput) => useCanvasGestures(p), {
      initialProps: inputFor(),
    });
    expect(result.current.penActive).toBe(true);
    expect(result.current.gestureCaptured).toBe(true);
    rerender(inputFor({ tool: 'eraser' }));
    expect(result.current.eraserActive).toBe(true);
    expect(result.current.penActive).toBe(false);
    expect(result.current.gestureCaptured).toBe(false); // the eraser clicks strokes, it does not own a drag
    rerender(inputFor({ drillRoot: 'sys' }));
    expect(result.current.penActive).toBe(false);
    expect(result.current.eraserActive).toBe(false);
  });

  it('L toggles the laser, which suspends the pen; Escape switches it off', () => {
    const { result } = renderHook((p: CanvasGesturesInput) => useCanvasGestures(p), { initialProps: inputFor() });
    press('l');
    expect(result.current.laserOn).toBe(true);
    expect(result.current.penActive).toBe(false); // the laser owns the drag
    expect(result.current.gestureCaptured).toBe(true);
    press('Escape');
    expect(result.current.laserOn).toBe(false);
    expect(result.current.penActive).toBe(true);
  });

  it('ignores L with a modifier held or typed into a form field', () => {
    const { result } = renderHook((p: CanvasGesturesInput) => useCanvasGestures(p), { initialProps: inputFor() });
    press('l', { ctrlKey: true }); // Ctrl+L is the browser's address bar
    expect(result.current.laserOn).toBe(false);
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    });
    expect(result.current.laserOn).toBe(false);
    input.remove();
  });

  it('does not install the shortcut for the chrome-less export', () => {
    const { result } = renderHook((p: CanvasGesturesInput) => useCanvasGestures(p), {
      initialProps: inputFor({ chromeless: true }),
    });
    press('l');
    expect(result.current.laserOn).toBe(false);
  });

  it('switching diagrams turns the laser off', () => {
    const { result, rerender } = renderHook((p: CanvasGesturesInput) => useCanvasGestures(p), {
      initialProps: inputFor(),
    });
    press('l');
    expect(result.current.laserOn).toBe(true);
    rerender(inputFor({ modelId: 'm2' }));
    expect(result.current.laserOn).toBe(false);
  });

  it('leaves L to the host when built-in keys are off, but Escape still switches the laser off', () => {
    const { result } = renderHook((p: CanvasGesturesInput) => useCanvasGestures(p), {
      initialProps: inputFor({ builtinKeys: false }),
    });
    press('l');
    expect(result.current.laserOn).toBe(false); // the host owns the binding now
    act(() => result.current.setLaserOn(true));
    press('Escape');
    expect(result.current.laserOn).toBe(false); // a cancel is not a preference
  });
});
