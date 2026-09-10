// @vitest-environment jsdom
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import { NUDGE_IDLE_MS, useNudge, type NudgeInput } from './useNudge';

const nodes = (): Node[] => [
  { id: 'a', position: { x: 10, y: 10 }, data: {}, selected: true },
  { id: 'b', position: { x: 50, y: 50 }, data: {} },
];

function setup(over: Partial<NudgeInput> = {}) {
  const nodesRef = { current: nodes() };
  // mimic React Flow: applying a position change updates the copy the next key reads
  const applyMoves = vi.fn((moves: Record<string, { x: number; y: number }>) => {
    nodesRef.current = nodesRef.current.map((n) => (moves[n.id] !== undefined ? { ...n, position: moves[n.id]! } : n));
  });
  const commit = vi.fn();
  const hook = renderHook(() => useNudge({ enabled: true, step: 5, nodesRef, applyMoves, commit, ...over }));
  const nodeEl = document.createElement('div');
  nodeEl.className = 'react-flow__node';
  document.body.appendChild(nodeEl);
  const press = (key: string, init: Partial<KeyboardEvent> = {}, target: Element = nodeEl) => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    act(() =>
      hook.result.current.onKeyDownCapture({
        key, target, preventDefault, stopPropagation, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...init,
      } as never),
    );
    return { preventDefault, stopPropagation };
  };
  return { hook, nodesRef, applyMoves, commit, nodeEl, press };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useNudge', () => {
  it('moves the selected nodes at once and commits the burst once after the idle window', () => {
    const { press, applyMoves, commit } = setup();
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowDown');
    expect(applyMoves).toHaveBeenCalledTimes(3);
    expect(applyMoves).toHaveBeenLastCalledWith({ a: { x: 20, y: 15 } });
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(NUDGE_IDLE_MS);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ a: { x: 20, y: 15 } });
  });

  it('Shift multiplies the step, and the grid step replaces the default when snapping', () => {
    const { press, applyMoves } = setup({ step: 10 });
    press('ArrowLeft', { shiftKey: true });
    expect(applyMoves).toHaveBeenLastCalledWith({ a: { x: -30, y: 10 } });
  });

  it('claims the key so the page never scrolls and React Flow never sees it', () => {
    const { press } = setup();
    const { preventDefault, stopPropagation } = press('ArrowUp');
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('ignores keys typed in a field, with a modifier, outside a node, or with nothing selected', () => {
    const { press, applyMoves } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('ArrowRight', {}, input);
    press('ArrowRight', { ctrlKey: true });
    press('ArrowRight', {}, document.body);
    expect(applyMoves).not.toHaveBeenCalled();

    const none = setup({ nodesRef: { current: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }] } });
    none.press('ArrowRight');
    expect(none.applyMoves).not.toHaveBeenCalled();
  });

  it('flush commits the pending burst immediately; unmount flushes too', () => {
    const { press, commit, hook } = setup();
    press('ArrowRight');
    act(() => hook.result.current.flush());
    expect(commit).toHaveBeenCalledWith({ a: { x: 15, y: 10 } });
    press('ArrowRight');
    hook.unmount();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith({ a: { x: 20, y: 10 } });
  });

  it('a blur leaving a node flushes; a blur elsewhere does not', () => {
    const { press, commit, hook, nodeEl } = setup();
    press('ArrowRight');
    act(() => hook.result.current.onBlurCapture({ target: document.body } as never));
    expect(commit).not.toHaveBeenCalled();
    act(() => hook.result.current.onBlurCapture({ target: nodeEl } as never));
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const { press, applyMoves } = setup({ enabled: false });
    press('ArrowRight');
    expect(applyMoves).not.toHaveBeenCalled();
  });

  it('claims modifier+arrow (stops propagation) without moving anything or preventing the default, so the browser shortcut still runs and React Flow never performs its own uncommitted nudge', () => {
    const { press, applyMoves, commit } = setup();
    const { preventDefault, stopPropagation } = press('ArrowLeft', { altKey: true });
    expect(stopPropagation).toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(applyMoves).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(NUDGE_IDLE_MS));
    expect(commit).not.toHaveBeenCalled();
  });

  it('nudges the selection from a keydown on the marquee selection rectangle too', () => {
    const { press, applyMoves } = setup();
    const rect = document.createElement('div');
    rect.className = 'react-flow__nodesselection-rect';
    document.body.appendChild(rect);
    press('ArrowRight', {}, rect);
    expect(applyMoves).toHaveBeenLastCalledWith({ a: { x: 15, y: 10 } });
  });
});
