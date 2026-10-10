// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { layoutPlaneKey, model, type LayoutOverlay } from '@diagc/core/internal';
import { useViewModeMoves, type ViewModeMovesInput } from './useViewModeMoves';

const json = model('moves').toJSON();

/** the hook's input, written flat: the props it reads, and the mode */
function input({ editing = false, ...props }: Partial<ViewModeMovesInput['props']> & { editing?: boolean } = {}) {
  return { props: { model: json, ...props }, editing };
}

const saved: LayoutOverlay = {
  version: 1,
  planes: {},
  edgeLabels: { [layoutPlaneKey(json, undefined)]: { r1: { l1: { t: 0.8 }, l2: { t: 0.1, side: 'top' } } } },
};

describe('useViewModeMoves', () => {
  it('holds Alt from keydown to keyup, and lets go on a blur', () => {
    const { result } = renderHook(() => useViewModeMoves(input()));
    act(() => void fireEvent.keyDown(window, { key: 'Alt' }));
    expect(result.current.altHeld).toBe(true);
    act(() => void fireEvent.keyUp(window, { key: 'Alt' }));
    expect(result.current.altHeld).toBe(false);
    act(() => void fireEvent.keyDown(window, { key: 'Alt' }));
    act(() => void fireEvent.blur(window));
    expect(result.current.altHeld).toBe(false);
  });

  it('draws a slid label over its saved spot, and keeps no side for the centre', () => {
    const { result } = renderHook(() => useViewModeMoves(input({ layout: saved })));
    expect(result.current.labelMoves).toBe(saved.edgeLabels![layoutPlaneKey(json, undefined)]);
    act(() => result.current.moveViewLabel('r1', 'l1', 0.3, 'center'));
    expect(result.current.labelMoves).toEqual({ r1: { l1: { t: 0.3 }, l2: { t: 0.1, side: 'top' } } });
  });

  it('draws only the saved placements while editing, and none when a viewer sets them aside', () => {
    const editing = renderHook(() => useViewModeMoves(input({ layout: saved, editing: true })));
    act(() => editing.result.current.moveViewLabel('r1', 'l1', 0.3, 'bottom'));
    expect(editing.result.current.labelMoves).toBe(saved.edgeLabels![layoutPlaneKey(json, undefined)]);
    const aside = renderHook(() => useViewModeMoves(input({ layout: saved, ignoreSavedPositions: true })));
    expect(aside.result.current.labelMoves).toBeUndefined();
  });

  it('resets both sets on an edit-mode toggle, and reports each reset', () => {
    const onViewPositionsChange = vi.fn();
    const onViewLabelMovesChange = vi.fn();
    const { result, rerender } = renderHook(
      (editing: boolean) => useViewModeMoves(input({ editing, onViewPositionsChange, onViewLabelMovesChange })),
      { initialProps: false },
    );
    act(() => {
      result.current.setViewPositions({ a: { x: 1, y: 2 } });
      result.current.moveViewLabel('r1', 'l1', 0.5, 'top');
    });
    expect(onViewPositionsChange).toHaveBeenLastCalledWith({ a: { x: 1, y: 2 } });
    expect(onViewLabelMovesChange).toHaveBeenLastCalledWith({ r1: { l1: { t: 0.5, side: 'top' } } });
    rerender(true);
    expect(result.current.viewPositions).toEqual({});
    expect(onViewPositionsChange).toHaveBeenLastCalledWith({});
    expect(onViewLabelMovesChange).toHaveBeenLastCalledWith({});
  });
});
