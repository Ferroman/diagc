// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core/internal';
import { useTeamView } from './useTeamView';

const a = model('a').toJSON();
const b = model('b').toJSON();

describe('useTeamView', () => {
  it('uncontrolled, it keeps its own state', () => {
    const { result } = renderHook(() => useTeamView({ model: a }));
    expect(result.current.grouped).toBe(false);
    expect(result.current.hidden.size).toBe(0);
    act(() => result.current.setGrouped(true));
    expect(result.current.grouped).toBe(true);
    act(() => result.current.toggleHidden('pay'));
    expect([...result.current.hidden]).toEqual(['pay']);
    act(() => result.current.toggleHidden('pay'));
    expect(result.current.hidden.size).toBe(0);
  });

  it('keeps one Set identity while the hidden ids are unchanged', () => {
    const { result, rerender } = renderHook(() => useTeamView({ model: a }));
    act(() => result.current.toggleHidden('pay'));
    const first = result.current.hidden;
    rerender();
    expect(result.current.hidden).toBe(first);
  });

  it('controlled, every change goes through the callbacks', () => {
    const onGroupedChange = vi.fn();
    const onHiddenActorsChange = vi.fn();
    const { result } = renderHook(() =>
      useTeamView({ model: a, grouped: false, hiddenActors: ['x'], onGroupedChange, onHiddenActorsChange }),
    );
    act(() => result.current.setGrouped(true));
    expect(onGroupedChange).toHaveBeenLastCalledWith(true);
    act(() => result.current.toggleHidden('y'));
    expect(onHiddenActorsChange).toHaveBeenLastCalledWith(['x', 'y']);
    act(() => result.current.toggleHidden('x'));
    expect(onHiddenActorsChange).toHaveBeenLastCalledWith([]);
    // the host owns it: nothing moves until the props do
    expect(result.current.grouped).toBe(false);
    expect([...result.current.hidden]).toEqual(['x']);
  });

  it('a new diagram opens ungrouped with nothing hidden, and says so', () => {
    const onGroupedChange = vi.fn();
    const onHiddenActorsChange = vi.fn();
    const { result, rerender } = renderHook(
      (p: { m: typeof a }) => useTeamView({ model: p.m, onGroupedChange, onHiddenActorsChange }),
      {
        initialProps: { m: a },
      },
    );
    act(() => result.current.setGrouped(true));
    act(() => result.current.toggleHidden('pay'));
    rerender({ m: b });
    expect(result.current.grouped).toBe(false);
    expect(result.current.hidden.size).toBe(0);
    expect(onGroupedChange).toHaveBeenLastCalledWith(false);
    expect(onHiddenActorsChange).toHaveBeenLastCalledWith([]);
  });
});
