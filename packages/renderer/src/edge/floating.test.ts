import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { connectionSides, getEdgeParams, reconnectPin, sideFromPosition, type FloatingNode } from './floating';

const box = (x: number, y: number, width = 100, height = 50): FloatingNode => ({
  internals: { positionAbsolute: { x, y } },
  measured: { width, height },
});

describe('getEdgeParams', () => {
  it('routes through facing sides for horizontally separated nodes', () => {
    const a = box(0, 0);
    const b = box(300, 0);
    const p = getEdgeParams(a, b);
    expect(p.sourcePos).toBe(Position.Right);
    expect(p.targetPos).toBe(Position.Left);
    expect(p.sx).toBe(100); // right border of a
    expect(p.tx).toBe(300); // left border of b
    expect(p.sy).toBe(25); // vertical center
  });

  it('routes through facing sides for vertically separated nodes', () => {
    const a = box(0, 0);
    const b = box(0, 200);
    const p = getEdgeParams(a, b);
    expect(p.sourcePos).toBe(Position.Bottom);
    expect(p.targetPos).toBe(Position.Top);
    expect(p.sy).toBe(50); // bottom border of a
    expect(p.ty).toBe(200); // top border of b
  });

  it('is direction-sensitive: swapping endpoints swaps the sides', () => {
    const a = box(0, 0);
    const b = box(300, 0);
    const forward = getEdgeParams(a, b);
    const backward = getEdgeParams(b, a);
    expect(forward.sourcePos).toBe(Position.Right);
    expect(backward.sourcePos).toBe(Position.Left);
    expect(backward.targetPos).toBe(Position.Right);
  });

  it('honors pinned sides over the automatic facing side', () => {
    const a = box(0, 0);
    const b = box(300, 0);
    const p = getEdgeParams(a, b, { sourceSide: 'top', targetSide: 'bottom' });
    expect(p.sourcePos).toBe(Position.Top);
    expect(p.sx).toBe(50); // top-center of a
    expect(p.sy).toBe(0);
    expect(p.targetPos).toBe(Position.Bottom);
    expect(p.tx).toBe(350); // bottom-center of b
    expect(p.ty).toBe(50);
  });

  it('tolerates unmeasured (zero-size) nodes without NaN', () => {
    const a: FloatingNode = { internals: { positionAbsolute: { x: 0, y: 0 } } };
    const b = box(10, 10);
    const p = getEdgeParams(a, b);
    for (const v of [p.sx, p.sy, p.tx, p.ty]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('connectionSides', () => {
  it('maps the gesture handles to pinned sides', () => {
    expect(connectionSides({ sourceHandle: 'right', targetHandle: 'top' })).toEqual({
      fromSide: 'right',
      toSide: 'top',
    });
  });

  it('omits an end whose handle is missing or unknown', () => {
    expect(connectionSides({ sourceHandle: null, targetHandle: 'weird' })).toEqual({});
    expect(connectionSides({ sourceHandle: 'left' })).toEqual({ fromSide: 'left' });
  });
});

describe('sideFromPosition', () => {
  it('maps each React Flow Position to its Side string', () => {
    expect(sideFromPosition(Position.Top)).toBe('top');
    expect(sideFromPosition(Position.Right)).toBe('right');
    expect(sideFromPosition(Position.Bottom)).toBe('bottom');
    expect(sideFromPosition(Position.Left)).toBe('left');
  });
});

describe('reconnectPin', () => {
  const rel = { from: 'a', to: 'b' };

  it('floats the source end when it is dragged onto a different node', () => {
    // dropped on node c; loose mode still snaps a handle, which we ignore
    const conn = { source: 'c', target: 'b', sourceHandle: 'left', targetHandle: 'top' };
    expect(reconnectPin('source', conn, rel)).toEqual({ end: 'from', side: null });
  });

  it('pins the source end to the dragged side when re-dropped on the same node', () => {
    const conn = { source: 'a', target: 'b', sourceHandle: 'left', targetHandle: 'top' };
    expect(reconnectPin('source', conn, rel)).toEqual({ end: 'from', side: 'left' });
  });

  it('floats the target end when it is dragged onto a different node', () => {
    const conn = { source: 'a', target: 'c', sourceHandle: 'right', targetHandle: 'bottom' };
    expect(reconnectPin('target', conn, rel)).toEqual({ end: 'to', side: null });
  });

  it('pins the target end to the dragged side when re-dropped on the same node', () => {
    const conn = { source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'top' };
    expect(reconnectPin('target', conn, rel)).toEqual({ end: 'to', side: 'top' });
  });

  it('infers the moved end from the node diff when the dragged end is unknown', () => {
    const conn = { source: 'c', target: 'b', sourceHandle: 'left', targetHandle: 'top' };
    expect(reconnectPin(null, conn, rel)).toEqual({ end: 'from', side: null });
  });

  it('returns undefined when nothing moved and the dragged end is unknown', () => {
    const conn = { source: 'a', target: 'b', sourceHandle: 'left', targetHandle: 'top' };
    expect(reconnectPin(null, conn, rel)).toBeUndefined();
  });
});
