import type { Node, NodeChange } from '@xyflow/react';
import type { Box } from './box';

/** a guide to draw, absolute flow coordinates: a vertical line at x=`at`
 * (axis 'x') or a horizontal one at y=`at` (axis 'y'), spanning from..to */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface GuideSnap {
  dx: number;
  dy: number;
  lines: Guide[];
}

/** screen px within which a guide takes hold; divided by zoom for flow units */
export const GUIDE_THRESHOLD_PX = 8;

const NONE: GuideSnap = { dx: 0, dy: 0, lines: [] };

/**
 * Compare the moving box's left/centre/right (top/middle/bottom) with every
 * candidate's; per axis the closest match within `threshold` wins and yields
 * the delta that lands on it plus a line spanning both boxes. Pure; absolute
 * coordinates in, so parent nesting is the caller's business.
 */
export function computeGuides(moving: Box, candidates: readonly Box[], threshold: number): GuideSnap {
  const stops = (b: Box, axis: 'x' | 'y') =>
    axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];
  const pick = (axis: 'x' | 'y'): { d: number; at: number; other: Box } | undefined => {
    const mine = stops(moving, axis);
    let hit: { d: number; at: number; other: Box } | undefined;
    for (const c of candidates) {
      if (c.id === moving.id) continue;
      for (const t of stops(c, axis)) {
        for (const m of mine) {
          const d = t - m;
          if (Math.abs(d) <= threshold && (hit === undefined || Math.abs(d) < Math.abs(hit.d))) hit = { d, at: t, other: c };
        }
      }
    }
    return hit;
  };
  const hx = pick('x');
  const hy = pick('y');
  if (hx === undefined && hy === undefined) return NONE;
  const dx = hx?.d ?? 0;
  const dy = hy?.d ?? 0;
  // the line spans the SNAPPED moving box and the matched box
  const lines: Guide[] = [];
  if (hx !== undefined) {
    lines.push({
      axis: 'x',
      at: hx.at,
      from: Math.min(moving.y + dy, hx.other.y),
      to: Math.max(moving.y + dy + moving.h, hx.other.y + hx.other.h),
    });
  }
  if (hy !== undefined) {
    lines.push({
      axis: 'y',
      at: hy.at,
      from: Math.min(moving.x + dx, hy.other.x),
      to: Math.max(moving.x + dx + moving.w, hy.other.x + hy.other.w),
    });
  }
  return { dx, dy, lines };
}

export interface NodeBoxSource {
  /** React Flow's node copy: parentId, measured sizes */
  nodes: readonly Node[];
  /** a node's absolute position (React Flow internals), or undefined if unknown */
  absoluteOf: (id: string) => { x: number; y: number } | undefined;
}

type PositionChange = Extract<NodeChange, { type: 'position' }>;

const sizeOf = (n: Node | undefined): { width: number; height: number } | undefined => {
  if (n === undefined) return undefined;
  const w = n.measured?.width ?? (typeof n.style?.width === 'number' ? n.style.width : undefined);
  const h = n.measured?.height ?? (typeof n.style?.height === 'number' ? n.style.height : undefined);
  return w !== undefined && h !== undefined ? { width: w, height: h } : undefined;
};

/**
 * Intercept one drag frame: when exactly one node is being dragged, replace its
 * change's position with the guide-snapped one and return the lines to draw.
 * Any other frame — no drag, a multi-node drag, an unmeasured node — passes
 * through with no lines, which is also how the guides get cleared on drop
 * (the final frame arrives with `dragging: false`).
 *
 * Candidates are the node's SIBLINGS (same parent): the overlay is parent-
 * relative, so that is the coordinate space a box is free to line up in.
 * Sticky by construction: React Flow re-derives each frame from the raw
 * pointer, so the box snaps within reach and releases beyond it.
 */
export function snapDragChanges(
  changes: NodeChange[],
  src: NodeBoxSource,
  threshold: number,
): { changes: NodeChange[]; lines: Guide[] } {
  const passthrough = { changes, lines: [] as Guide[] };
  const drags = changes.filter(
    (c): c is PositionChange => c.type === 'position' && c.dragging === true && c.position !== undefined,
  );
  if (drags.length !== 1) return passthrough;
  const drag = drags[0]!;
  const node = src.nodes.find((n) => n.id === drag.id);
  const size = sizeOf(node);
  if (node === undefined || size === undefined || drag.position === undefined) return passthrough;
  const parentAbs = node.parentId !== undefined ? src.absoluteOf(node.parentId) : { x: 0, y: 0 };
  if (parentAbs === undefined) return passthrough;
  const moving: Box = {
    id: node.id,
    x: parentAbs.x + drag.position.x,
    y: parentAbs.y + drag.position.y,
    w: size.width,
    h: size.height,
  };
  const candidates: Box[] = [];
  for (const n of src.nodes) {
    if (n.id === node.id || n.parentId !== node.parentId) continue;
    const s = sizeOf(n);
    const abs = src.absoluteOf(n.id);
    if (s === undefined || abs === undefined) continue;
    candidates.push({ id: n.id, x: abs.x, y: abs.y, w: s.width, h: s.height });
  }
  const snap = computeGuides(moving, candidates, threshold);
  if (snap.lines.length === 0) return passthrough;
  const snapped: PositionChange = {
    ...drag,
    position: { x: drag.position.x + snap.dx, y: drag.position.y + snap.dy },
    ...(drag.positionAbsolute !== undefined
      ? { positionAbsolute: { x: drag.positionAbsolute.x + snap.dx, y: drag.positionAbsolute.y + snap.dy } }
      : {}),
  };
  return { changes: changes.map((c) => (c === drag ? snapped : c)), lines: snap.lines };
}
