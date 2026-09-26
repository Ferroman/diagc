import { resolveContainmentPlane, type DiagramModel } from '@diagc/core';
import { ACTIVITY_LAYOUT } from '@diagc/renderer';

type Point = { x: number; y: number };
type Bounds = { x: number; y: number; width: number; height: number };

/** Containers inside an activity frame that elements are placed into. */
const ACTIVITY_HOMES = new Set(['activity-lane', 'activity-region']);
/** The frame's own furniture: never a home for a dropped glyph, and never
 * climbed past (a frame in a lane is not ours to re-home). */
const ACTIVITY_CHROME = new Set(['activity-frame', ...ACTIVITY_HOMES]);

const parentsIn = (model: DiagramModel, plane: string | undefined) => {
  const planeId = resolveContainmentPlane(model, plane);
  const base = resolveContainmentPlane(model, undefined);
  return model.containment.filter((e) => (e.plane ?? base) === planeId);
};

/**
 * Where a node placed "into" `targetId` should actually nest, when the target is
 * part of an activity diagram. The generic rule — nest under whatever was hit or
 * selected — builds models validation refuses (only lanes may sit in a frame)
 * or nonsense (an action inside an action), and the studio only validates at
 * save, so the frame just shrank to wrap the stray.
 *
 *  - a frame → the lane whose band holds `point.y` (clamped to the first/last
 *    lane), or the first lane without a point; a lane-less frame → top level
 *  - an activity glyph (action, decision, …) → the lane/region holding it
 *  - anything else passes through unchanged
 */
export function homeActivityParent(
  model: DiagramModel,
  plane: string | undefined,
  targetId: string | undefined,
  point?: Point,
  boundsOf?: (id: string) => Bounds | undefined,
): string | undefined {
  if (targetId === undefined) return undefined;
  const typeOf = (id: string) => model.nodes.find((n) => n.id === id)?.type;
  const type = typeOf(targetId);
  if (type === undefined || !type.startsWith('activity-')) return targetId;
  const edges = parentsIn(model, plane);

  if (type === 'activity-frame') {
    // declaration order is band order (arrangeActivityFrames)
    const lanes = edges.filter((e) => e.parent === targetId && typeOf(e.child) === 'activity-lane').map((e) => e.child);
    if (lanes.length === 0) return undefined;
    if (point === undefined || boundsOf === undefined) return lanes[0];
    for (const lane of lanes) {
      const b = boundsOf(lane);
      if (b !== undefined && point.y < b.y + b.height) return lane;
    }
    return lanes[lanes.length - 1];
  }
  if (ACTIVITY_CHROME.has(type)) return targetId;
  // a glyph: climb to the band or region it sits in
  const parent = edges.find((e) => e.child === targetId)?.parent;
  return parent !== undefined && ACTIVITY_HOMES.has(typeOf(parent) ?? '') ? parent : targetId;
}

/**
 * The parent-relative spot for a node of `size` centered on the drop `point`
 * inside activity container `parentId`, or undefined when the parent is not a
 * lane/region or is not on the canvas (the node then falls to elk, as any
 * nested add does). Kept clear of the lane's rotated label strip.
 */
export function activityDropPosition(
  model: DiagramModel,
  parentId: string | undefined,
  point: Point,
  size: { width: number; height: number },
  boundsOf: (id: string) => Bounds | undefined,
): Point | undefined {
  if (parentId === undefined) return undefined;
  const type = model.nodes.find((n) => n.id === parentId)?.type;
  if (type === undefined || !ACTIVITY_HOMES.has(type)) return undefined;
  const b = boundsOf(parentId);
  if (b === undefined) return undefined;
  const minX = type === 'activity-lane' ? ACTIVITY_LAYOUT.LANE_STRIP_W : 0;
  return {
    x: Math.max(minX, Math.round(point.x - b.x - size.width / 2)),
    y: Math.max(0, Math.round(point.y - b.y - size.height / 2)),
  };
}
