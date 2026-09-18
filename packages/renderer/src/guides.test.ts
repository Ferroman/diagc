import { describe, expect, it } from 'vitest';
import type { Node, NodeChange } from '@xyflow/react';
import type { Box } from './box';
import { computeGuides, snapDragChanges, snapDragFrame, type SnapMemo } from './guides';

const box = (id: string, x: number, y: number, w = 100, h = 50): Box => ({ id, x, y, w, h });

describe('computeGuides', () => {
  it('snaps a left edge onto a neighbour left edge within the threshold, drawing one line', () => {
    const r = computeGuides(box('m', 106, 300), [box('a', 100, 0)], 8);
    expect(r.dx).toBe(-6);
    expect(r.dy).toBe(0);
    // the line spans both boxes vertically at the matched x
    expect(r.lines).toEqual([{ axis: 'x', at: 100, from: 0, to: 350 }]);
  });

  it('matches centres and far edges too, and the nearest candidate wins', () => {
    // moving edges 107 / 157 / 207 vs a's 100 / 160 / 220: centre is 3 off, the rest further
    const r = computeGuides(box('m', 107, 300), [box('a', 100, 0, 120)], 8);
    expect(r.dx).toBe(3);
  });

  it('snaps both axes independently and returns one line per axis', () => {
    const r = computeGuides(box('m', 104, 203), [box('a', 100, 0), box('b', 400, 200)], 8);
    expect(r).toMatchObject({ dx: -4, dy: -3 });
    expect(r.lines.map((l) => l.axis).sort()).toEqual(['x', 'y']);
  });

  it('ignores anything beyond the threshold and the moving box itself', () => {
    const r = computeGuides(box('m', 120, 300), [box('a', 100, 0), box('m', 120, 300)], 8);
    expect(r).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it('is total: no candidates → no snap', () => {
    expect(computeGuides(box('m', 0, 0), [], 8)).toEqual({ dx: 0, dy: 0, lines: [] });
  });
});

describe('snapDragChanges', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 100, y: 0 }, data: {}, measured: { width: 100, height: 50 } },
    { id: 'm', position: { x: 300, y: 300 }, data: {}, measured: { width: 100, height: 50 } },
    { id: 'p', position: { x: 0, y: 500 }, data: {}, measured: { width: 400, height: 200 } },
    { id: 'c', position: { x: 20, y: 40 }, data: {}, parentId: 'p', measured: { width: 100, height: 50 } },
    { id: 'u', position: { x: 700, y: 700 }, data: {} }, // unmeasured
  ];
  const abs = (id: string) =>
    ({ a: { x: 100, y: 0 }, m: { x: 300, y: 300 }, p: { x: 0, y: 500 }, c: { x: 20, y: 540 }, u: { x: 700, y: 700 } })[id];
  const drag = (id: string, x: number, y: number): Extract<NodeChange, { type: 'position' }> => ({
    id,
    type: 'position',
    position: { x, y },
    dragging: true,
  });

  it('writes the snapped position through into the SAME change/position objects XYDrag owns', () => {
    // XYDrag re-emits its own dragItem.position object in the settle frame and
    // onNodeDragStop, so a fresh object here would never reach either — the
    // snap must mutate the change (and its position) in place.
    const change = drag('m', 106, 300);
    const changes = [change];
    const r = snapDragChanges(changes, { nodes, absoluteOf: abs }, 8);
    expect(r.changes).toBe(changes);
    expect(r.changes[0]).toBe(change);
    expect(change.position).toEqual({ x: 100, y: 300 });
    expect(r.lines).toHaveLength(1);
  });

  it('shifts positionAbsolute in place by the same delta when present', () => {
    const change: Extract<NodeChange, { type: 'position' }> = {
      id: 'm',
      type: 'position',
      position: { x: 106, y: 300 },
      positionAbsolute: { x: 106, y: 300 },
      dragging: true,
    };
    snapDragChanges([change], { nodes, absoluteOf: abs }, 8);
    expect(change.positionAbsolute).toEqual({ x: 100, y: 300 });
  });

  it('compares siblings only: a child never snaps to a root node', () => {
    // c's absolute left would be 106 — 6px off a's — but a is not c's sibling
    const change = drag('c', 106, 40);
    const r = snapDragChanges([change], { nodes, absoluteOf: abs }, 8);
    expect(r.changes[0]).toBe(change);
    expect(r.lines).toEqual([]);
  });

  it('passes multi-node drags, non-drag frames and unmeasured nodes through untouched', () => {
    const two = [drag('m', 106, 300), drag('a', 106, 0)];
    expect(snapDragChanges(two, { nodes, absoluteOf: abs }, 8)).toEqual({ changes: two, lines: [] });
    const settled: NodeChange[] = [{ id: 'm', type: 'position', position: { x: 106, y: 300 }, dragging: false }];
    expect(snapDragChanges(settled, { nodes, absoluteOf: abs }, 8)).toEqual({ changes: settled, lines: [] });
    const unmeasured = [drag('u', 106, 700)];
    expect(snapDragChanges(unmeasured, { nodes, absoluteOf: abs }, 8)).toEqual({ changes: unmeasured, lines: [] });
  });
});

describe('snapDragFrame', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 100, y: 0 }, data: {}, measured: { width: 100, height: 50 } },
    { id: 'm', position: { x: 300, y: 300 }, data: {}, measured: { width: 100, height: 50 } },
  ];
  const abs = (id: string) => ({ a: { x: 100, y: 0 }, m: { x: 300, y: 300 } })[id];
  const frame = (x: number, dragging: boolean): NodeChange[] => [
    { id: 'm', type: 'position', position: { x, y: 300 }, dragging },
  ];
  const posOf = (changes: NodeChange[]) => (changes[0] as Extract<NodeChange, { type: 'position' }>).position;

  it('re-applies the last snap to a settle frame that arrives with the raw position (expandParent children)', () => {
    const memo: { current: SnapMemo | null } = { current: null };
    const dragFrame = frame(106, true);
    expect(snapDragFrame(dragFrame, { nodes, absoluteOf: abs }, 8, memo).lines).toHaveLength(1);
    expect(posOf(dragFrame)).toEqual({ x: 100, y: 300 });
    // React Flow built a FRESH position for the drop, so the snap is not in it
    const settle = frame(106, false);
    expect(snapDragFrame(settle, { nodes, absoluteOf: abs }, 8, memo).lines).toEqual([]);
    expect(posOf(settle)).toEqual({ x: 100, y: 300 });
    expect(memo.current).toBeNull();
  });

  it('leaves alone a settle frame the write-through already reached', () => {
    const memo: { current: SnapMemo | null } = { current: null };
    snapDragFrame(frame(106, true), { nodes, absoluteOf: abs }, 8, memo);
    const settle = frame(100, false); // XYDrag's own object, snapped in place last frame
    snapDragFrame(settle, { nodes, absoluteOf: abs }, 8, memo);
    expect(posOf(settle)).toEqual({ x: 100, y: 300 });
  });

  it('forgets the snap once the box is dragged out of reach', () => {
    const memo: { current: SnapMemo | null } = { current: null };
    snapDragFrame(frame(106, true), { nodes, absoluteOf: abs }, 8, memo);
    snapDragFrame(frame(160, true), { nodes, absoluteOf: abs }, 8, memo);
    expect(memo.current).toBeNull();
    const settle = frame(160, false);
    snapDragFrame(settle, { nodes, absoluteOf: abs }, 8, memo);
    expect(posOf(settle)).toEqual({ x: 160, y: 300 });
  });
});
