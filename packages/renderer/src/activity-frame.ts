import type { CompiledView, DiagramModel, ViewNode } from '@diagc/core';

/** geometry constants for activity frames; the studio's ActivityPanel reads
 * these for its cascade placement, so they live on the package surface */
export const ACTIVITY_LAYOUT = {
  /** frame's rotated-title strip, left edge */
  TITLE_STRIP_W: 28,
  /** each lane's rotated-label strip (inside the lane's width) */
  LANE_STRIP_W: 28,
  /** minimum shared lane width */
  LANE_MIN_W: 320,
  /** minimum lane height */
  LANE_MIN_H: 120,
  /** content padding inside a lane */
  PAD: 24,
} as const;

interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize every activity frame in the view into full-width stacked lane
 * bands. Geometry is parent-relative (React Flow nesting): lanes' x/y/w/h and
 * frames' w/h are overridden; frame x/y and all children stay untouched —
 * lanes grow around content, content never moves. Saved overlay sizes act as
 * minimums. Pure and cheap: runs on every placedGeometry recompute.
 */
export function arrangeActivityFrames<T extends Geo>(
  geometry: ReadonlyMap<string, T>,
  view: CompiledView,
  model: DiagramModel,
  sizes?: Record<string, { w: number; h: number }>,
): ReadonlyMap<string, T> {
  if (!model.nodes.some((n) => n.type === 'activity-frame')) return geometry;
  const typeOf = new Map(model.nodes.map((n) => [n.id, n.type]));
  const out = new Map(geometry);
  const L = ACTIVITY_LAYOUT;

  const arrange = (frame: ViewNode): void => {
    const lanes = frame.children.filter((c) => typeOf.get(c.id) === 'activity-lane' && out.has(c.id));
    if (lanes.length === 0) {
      // No bands yet (a frame straight off the palette, or one whose last lane
      // was deleted): elk sized it as a label-sized leaf, or around a stray it
      // wrongly holds — either way it would read as a shrunken box. Hold it at
      // one empty band's footprint so it still looks like somewhere to draw.
      const fg = out.get(frame.id)!;
      out.set(frame.id, {
        ...fg,
        width: Math.max(fg.width, L.TITLE_STRIP_W + L.LANE_MIN_W),
        height: Math.max(fg.height, L.LANE_MIN_H),
      });
      return;
    }
    const heights: number[] = [];
    // L.LANE_MIN_W's type is the literal `320` (from ACTIVITY_LAYOUT's `as const`),
    // which does not widen through a plain `let` initializer — annotate so the
    // reassignment below (a plain `number`) type-checks.
    let commonW: number = L.LANE_MIN_W;
    for (const lane of lanes) {
      let right = 0;
      let bottom = 0;
      for (const kid of lane.children) {
        const g = out.get(kid.id);
        if (g === undefined) continue;
        right = Math.max(right, g.x + g.width);
        bottom = Math.max(bottom, g.y + g.height);
      }
      const saved = sizes?.[lane.id];
      heights.push(Math.max(L.LANE_MIN_H, bottom + L.PAD, saved?.h ?? 0));
      commonW = Math.max(commonW, right + L.PAD, saved?.w ?? 0);
    }
    let y = 0;
    lanes.forEach((lane, i) => {
      const g = out.get(lane.id)!;
      out.set(lane.id, { ...g, x: L.TITLE_STRIP_W, y, width: commonW, height: heights[i]! });
      y += heights[i]!;
    });
    const fg = out.get(frame.id)!;
    out.set(frame.id, { ...fg, width: L.TITLE_STRIP_W + commonW, height: y });
  };

  const walk = (n: ViewNode): void => {
    if (typeOf.get(n.id) === 'activity-frame' && out.has(n.id)) arrange(n);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return out;
}
