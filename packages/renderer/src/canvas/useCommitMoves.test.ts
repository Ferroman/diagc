// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import { useCommitMoves, type CommitMovesInput } from './useCommitMoves';

/** a top-level zone the view drew 100px above its saved y (a fold above it) */
function input(over: Partial<CommitMovesInput>): CommitMovesInput {
  const zone: Node = { id: 'b', position: { x: 0, y: 300 }, data: {} };
  return {
    editing: false,
    edit: undefined,
    rfNodesRef: { current: [zone] },
    containerBasesRef: { current: new Map<string, Point>() },
    containerShiftsRef: { current: new Map() },
    arrangedRef: { current: new Map<string, NodeGeometry>([['b', { x: 0, y: 0, width: 100, height: 40 }]]) },
    viewShiftRef: { current: new Map([['b', -100]]) },
    savedFrameRef: { current: new Map() },
    setViewPositions: vi.fn(),
    ...over,
  };
}

describe('useCommitMoves', () => {
  it('commits the unshifted position of a shifted node, in edit mode', () => {
    const onNodesMoved = vi.fn();
    const { result } = renderHook(() => useCommitMoves(input({ editing: true, edit: { onNodesMoved } })));
    result.current({ b: { x: 0, y: 320 } });
    // the displacement is the drawn one: from where b was drawn (0, 0 arranged) to where it went
    expect(onNodesMoved).toHaveBeenCalledWith({ b: { x: 0, y: 420 } }, { b: { dx: 0, dy: 320 } });
  });

  it('keeps the unshifted position as the view drag, in view mode', () => {
    const setViewPositions = vi.fn();
    const { result } = renderHook(() => useCommitMoves(input({ setViewPositions })));
    result.current({ b: { x: 0, y: 320 } });
    const update = setViewPositions.mock.calls[0]![0] as (p: Record<string, Point>) => Record<string, Point>;
    expect(update({})).toEqual({ b: { x: 0, y: 420 } });
  });

  it("commits a drilled child relative to its zone's interior, and its displacement as drawn", () => {
    const onNodesMoved = vi.fn();
    const zoneChild: Node = { id: 'r', position: { x: 160, y: 30 }, data: {} };
    const { result } = renderHook(() =>
      useCommitMoves(
        input({
          editing: true,
          edit: { onNodesMoved },
          rfNodesRef: { current: [zoneChild] },
          arrangedRef: { current: new Map([['r', { x: 140, y: 30, width: 100, height: 40 }]]) },
          viewShiftRef: { current: new Map() },
          savedFrameRef: { current: new Map([['r', { x: 100, y: -40 }]]) },
        }),
      ),
    );
    result.current({ r: { x: 160, y: 30 } });
    expect(onNodesMoved).toHaveBeenCalledWith({ r: { x: 60, y: 70 } }, { r: { dx: 20, dy: 0 } });
  });

  it('at 80 px a day, commits the position and the displacement in 20 px-a-day units', () => {
    // a free box 3 days into a stretched bar, dragged 3 days on: a plan reads
    // days off the displacement at 20 px a day, and keeps the box's day saved
    const onNodesMoved = vi.fn();
    const box: Node = { id: 'x', position: { x: 480, y: 50 }, data: {} };
    const { result } = renderHook(() =>
      useCommitMoves(
        input({
          editing: true,
          edit: { onNodesMoved },
          rfNodesRef: { current: [box] },
          arrangedRef: { current: new Map([['x', { x: 240, y: 50, width: 100, height: 40 }]]) },
          viewShiftRef: { current: new Map() },
          scaleRef: { current: 4 },
        }),
      ),
    );
    result.current({ x: { x: 480, y: 50 } });
    expect(onNodesMoved).toHaveBeenCalledWith({ x: { x: 120, y: 50 } }, { x: { dx: 60, dy: 0 } });
  });
});
