// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STROKE_WIDTH } from '@diagc/core/internal';
import { useDrawTool, type UseDrawToolOptions } from './useDrawTool';

const mount = (initial: UseDrawToolOptions) =>
  renderHook((props: UseDrawToolOptions) => useDrawTool(props), { initialProps: initial });
const editingOn = (selected = 'a', enteredPath: string[] = []) => ({ editing: true, selected, enteredPath });

describe('useDrawTool', () => {
  // Breaks if the defaults change: Select, no pen colour (the theme's ink), the
  // default stroke width.
  it('starts on Select with the default pen', () => {
    const { result } = mount(editingOn());
    expect(result.current).toMatchObject({ tool: 'select', penColor: '', penWidth: DEFAULT_STROKE_WIDTH });
  });

  // Breaks if leaving edit mode stops dropping the pen: it would swallow canvas
  // clicks in view mode with nothing to draw on.
  it('drops back to Select on leaving edit mode, and on a diagram switch that does', () => {
    const { result, rerender } = mount(editingOn('a'));
    act(() => result.current.setTool('pen'));
    rerender({ editing: false, selected: 'a', enteredPath: [] });
    expect(result.current.tool).toBe('select');

    rerender(editingOn('a'));
    act(() => result.current.setTool('eraser'));
    rerender({ editing: false, selected: 'b', enteredPath: [] });
    expect(result.current.tool).toBe('select');
  });

  // Breaks if drilling in stops dropping the pen: drawings are a top-level layer
  // and the toolbar disables both tools there.
  it('drops back to Select on drilling in', () => {
    const { result, rerender } = mount(editingOn());
    act(() => result.current.setTool('pen'));
    rerender(editingOn('a', ['sys']));
    expect(result.current.tool).toBe('select');
  });

  // Breaks if the effect starts resetting on renders where nothing it watches
  // changed.
  it('keeps the tool while editing on the top level', () => {
    const { result, rerender } = mount(editingOn());
    act(() => result.current.setTool('pen'));
    rerender(editingOn());
    expect(result.current.tool).toBe('pen');
  });

  // Breaks if the Pen and Eraser keys start working while drilled in, or stop
  // reporting that they did nothing (a key that does nothing must not be claimed).
  it('refuses the pen keys while drilled in', () => {
    const { result, rerender } = mount(editingOn('a', ['sys']));
    let took: boolean | undefined;
    act(() => void (took = result.current.drawWith('pen')()));
    expect(took).toBe(false);
    expect(result.current.tool).toBe('select');
    rerender(editingOn());
    act(() => void (took = result.current.drawWith('eraser')()));
    expect(took).toBe(true);
    expect(result.current.tool).toBe('eraser');
  });

  // Breaks if a pen patch overwrites the half it does not name.
  it('changes only the pen setting a patch names', () => {
    const { result } = mount(editingOn());
    act(() => result.current.setPen({ color: '#f00' }));
    act(() => result.current.setPen({ width: 6 }));
    expect(result.current).toMatchObject({ penColor: '#f00', penWidth: 6 });
  });

  // Breaks if the toolbar's onSetTool changes identity between renders.
  it('hands out a stable setTool', () => {
    const { result, rerender } = mount(editingOn());
    const first = result.current.setTool;
    act(() => result.current.setPen({ width: 3 }));
    rerender(editingOn());
    expect(result.current.setTool).toBe(first);
  });
});
