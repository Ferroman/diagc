import type { Node } from '@xyflow/react';
import { ACTIVITY_LANE_TYPE, type Point } from '@diagc/core/internal';
import { laneDropOffset } from '../layout/activity-frame';
import type { Positions } from './useNudge';

// What a finished drag means, step by step, apart from the pointer and the
// host: React Flow's drag is a gesture jsdom cannot drive, so the steps are
// pure and tested on their own (see useNodeDragging for the order they run in).

/** Snap back: a node the notation drags only to be dropped (the plan's actors)
 * is never reported as moved — it returns to the spot the layout laid it at,
 * whether or not the gesture reported a drop. `skip` lists every such node,
 * `resets` those whose laid spot is known. */
export function snapBackResets(
  boxIds: readonly string[],
  snapsBack: (id: string) => boolean,
  laidAt: (id: string) => Point | undefined,
): { skip: string[]; resets: Positions } {
  const skip: string[] = [];
  const resets: Positions = {};
  for (const id of boxIds) {
    if (!snapsBack(id)) continue;
    skip.push(id);
    const pos = laidAt(id);
    if (pos !== undefined) resets[id] = pos;
  }
  return { skip, resets };
}

/** Lane reorder: an activity lane has no position of its own — its band is
 * stacked from containment order (arrangeActivityFrames) — so dragging one is
 * a reorder: where its middle lands among its sibling bands says how many
 * slots it moves. Undefined unless `id` is a lane inside a frame. */
export function laneDrop(
  nodes: readonly Node[],
  id: string,
  arranged: ReadonlyMap<string, { y: number; height: number }> | null,
): { frameId: string; offset: number } | undefined {
  const typeOf = (n: Node) => (n.data as { typeId?: string }).typeId;
  const rf = nodes.find((n) => n.id === id);
  const frameId = rf?.parentId;
  if (rf === undefined || frameId === undefined || typeOf(rf) !== ACTIVITY_LANE_TYPE) return undefined;
  const lanes = nodes
    .filter((n) => n.parentId === frameId && typeOf(n) === ACTIVITY_LANE_TYPE)
    .flatMap((n) => {
      const g = arranged?.get(n.id);
      return g === undefined ? [] : [{ id: n.id, y: g.y, height: g.height }];
    });
  return { frameId, offset: laneDropOffset(lanes, id, rf.position.y) };
}

/** Drop into: where the dropped box sits inside its target, both absolute. */
export const dropOffset = (dragged: Point, target: Point): Point => ({
  x: dragged.x - target.x,
  y: dragged.y - target.y,
});

/** Move: the boxes left for the move once drops, snap-backs and lane
 * reorders are taken out; the batch itself when none were. */
export const movesLeft = (boxes: Positions, skip: ReadonlySet<string>): Positions =>
  skip.size === 0 ? boxes : Object.fromEntries(Object.entries(boxes).filter(([id]) => !skip.has(id)));
