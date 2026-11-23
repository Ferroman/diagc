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
    setViewPositions: vi.fn(),
    ...over,
  };
}

describe('useCommitMoves', () => {
  it('commits the unshifted position of a shifted node, in edit mode', () => {
    const onNodesMoved = vi.fn();
    const { result } = renderHook(() => useCommitMoves(input({ editing: true, edit: { onNodesMoved } })));
    result.current({ b: { x: 0, y: 320 } });
    expect(onNodesMoved).toHaveBeenCalledWith({ b: { x: 0, y: 420 } }, { b: { dx: 0, dy: 420 } });
  });

  it('keeps the unshifted position as the view drag, in view mode', () => {
    const setViewPositions = vi.fn();
    const { result } = renderHook(() => useCommitMoves(input({ setViewPositions })));
    result.current({ b: { x: 0, y: 320 } });
    const update = setViewPositions.mock.calls[0]![0] as (p: Record<string, Point>) => Record<string, Point>;
    expect(update({})).toEqual({ b: { x: 0, y: 420 } });
  });
});
