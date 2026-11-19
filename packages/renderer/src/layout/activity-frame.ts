import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  containmentOn,
  containmentPlaneOf,
  type BoxSize,
  type CompiledView,
  type DiagramModel,
  type Size,
  type ViewNode,
} from '@diagc/core/internal';
import { textWidth } from './box-size';

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

/**
 * Which way a frame's lanes run. The lanes lie ALONG the flow, so that a lane is
 * as long as the activity and as thick as its own busiest step: rows under a
 * flow that runs across the page, columns under one that runs down it.
 */
export type LaneAxis = 'rows' | 'columns';

export const laneAxisOf = (direction: string | undefined): LaneAxis =>
  direction === 'RIGHT' || direction === 'LEFT' ? 'rows' : 'columns';

/** A box mirrored in the diagonal: x for y, width for height. Rows and columns
 * are one arrangement seen from two sides, so each pass is written for rows and
 * run on flipped boxes for columns. Its own inverse. */
export const flip = <T extends { x: number; y: number; width: number; height: number }>(g: T): T => ({
  ...g,
  x: g.y,
  y: g.x,
  width: g.height,
  height: g.width,
});

/** How long a lane's name strip must be for the name to fit on it: the name is
 * one line (`.dg-activity-name`, 12px semibold) with room at both ends. */
export const laneNameLength = (name: string): number => Math.ceil(textWidth(name, 12) * 1.08) + 16;

interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Band order is containment order: the studio restacks a lane (move-child) or
 * slots a new one beside its neighbour by reordering containment, while the view
 * tree lists children in NODE order, which still says creation order. Only the
 * viewed plane's containment counts: another plane may stack the same lanes in
 * another order. A state machine's regions stack by the same rule
 * (state-machine-layout.ts).
 */
export function containmentRank(
  model: DiagramModel,
  plane: string | undefined,
): (parent: string, child: string) => number {
  const rank = new Map<string, number>();
  containmentOn(model, containmentPlaneOf(model, plane)).forEach((e, i) => {
    const key = `${e.parent}\u0000${e.child}`;
    if (!rank.has(key)) rank.set(key, i);
  });
  return (parent, child) => rank.get(`${parent}\u0000${child}`) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The view with every activity frame's lanes in band order, for the layout run:
 * the lane banding there stacks lanes in the order it is handed, and so does
 * arrangeActivityFrames afterwards — if the two disagree, the second pass moves
 * whole lanes under the routes the first one drew, and every link floats. The
 * same object back when no frame needs it (it is a layout cache key).
 */
export function withLaneOrder(view: CompiledView, model: DiagramModel, plane: string | undefined): CompiledView {
  if (!model.nodes.some((n) => n.type === ACTIVITY_FRAME_TYPE)) return view;
  const rankIn = containmentRank(model, plane);
  let changed = false;
  const visit = (n: ViewNode): ViewNode => {
    let children = n.children.map(visit);
    if (n.node.type === ACTIVITY_FRAME_TYPE) {
      const sorted = [...children].sort((a, b) => rankIn(n.id, a.id) - rankIn(n.id, b.id));
      if (sorted.some((c, i) => c !== children[i])) children = sorted;
    }
    if (children.every((c, i) => c === n.children[i])) return n;
    changed = true;
    return { ...n, children };
  };
  const roots = view.roots.map(visit);
  return changed ? { ...view, roots } : view;
}

export interface BandOptions {
  /** the plane the view was compiled for; its containment orders the lanes */
  plane?: string;
  /** saved overlay sizes, which act as minimums */
  sizes?: Record<string, Size>;
  /** which way the lanes run; rows when absent */
  axis?: LaneAxis;
  /** the caption hung under a member (an activity glyph's name), by id: a lane
   * holds its members' captions too */
  captions?: ReadonlyMap<string, BoxSize>;
}

/**
 * Normalize every activity frame in the view into stacked lane bands, each as
 * long as the frame. Geometry is parent-relative (React Flow nesting): lanes'
 * x/y/w/h and frames' w/h are overridden; frame x/y and all children stay
 * untouched — lanes grow around content, content never moves. Saved overlay
 * sizes act as minimums. Pure and cheap: runs on every placedGeometry recompute.
 *
 * Written for rows; for columns each box is flipped on the way in and out.
 */
export function arrangeActivityFrames<T extends Geo>(
  geometry: ReadonlyMap<string, T>,
  view: CompiledView,
  model: DiagramModel,
  { plane, sizes, axis = 'rows', captions }: BandOptions = {},
): ReadonlyMap<string, T> {
  if (!model.nodes.some((n) => n.type === ACTIVITY_FRAME_TYPE)) return geometry;
  const typeOf = new Map(model.nodes.map((n) => [n.id, n.type]));
  const out = new Map(geometry);
  const { TITLE_STRIP_W, LANE_MIN_W, LANE_MIN_H, PAD } = ACTIVITY_LAYOUT;

  const rankIn = containmentRank(model, plane);
  const turn = <G extends { x: number; y: number; width: number; height: number }>(g: G): G =>
    axis === 'rows' ? g : flip(g);
  // a saved size seen along the flow: `w` its length, `h` its thickness
  const savedOf = (id: string): Size | undefined => {
    const saved = sizes?.[id];
    return saved === undefined || axis === 'rows' ? saved : { w: saved.h, h: saved.w };
  };

  const arrange = (frame: ViewNode): void => {
    const lanes = frame.children
      .filter((c) => typeOf.get(c.id) === ACTIVITY_LANE_TYPE && out.has(c.id))
      .sort((a, b) => rankIn(frame.id, a.id) - rankIn(frame.id, b.id));
    if (lanes.length === 0) {
      // No bands yet (a frame straight off the palette, or one whose last lane
      // was deleted): elk sized it as a label-sized leaf, or around a stray it
      // wrongly holds — either way it would read as a shrunken box. Hold it at
      // one empty band's footprint so it still looks like somewhere to draw.
      const fg = out.get(frame.id)!;
      const least = turn({ x: 0, y: 0, width: TITLE_STRIP_W + LANE_MIN_W, height: LANE_MIN_H });
      out.set(frame.id, {
        ...fg,
        width: Math.max(fg.width, least.width),
        height: Math.max(fg.height, least.height),
      });
      return;
    }
    const heights: number[] = [];
    // LANE_MIN_W's type is the literal `320` (from ACTIVITY_LAYOUT's `as const`),
    // which does not widen through a plain `let` initializer — annotate so the
    // reassignment below (a plain `number`) type-checks.
    let commonW: number = LANE_MIN_W;
    for (const lane of lanes) {
      let right = 0;
      let bottom = 0;
      for (const kid of lane.children) {
        const g = out.get(kid.id);
        if (g === undefined) continue;
        const caption = captions?.get(kid.id);
        // under columns a caption wider than its glyph reaches past it on both sides
        const reach = axis === 'columns' && caption !== undefined ? Math.max(0, (caption.width - g.width) / 2) : 0;
        const box = turn({ x: g.x, y: g.y, width: g.width + reach, height: g.height + (caption?.height ?? 0) });
        right = Math.max(right, box.x + box.width);
        bottom = Math.max(bottom, box.y + box.height);
      }
      const saved = savedOf(lane.id);
      heights.push(Math.max(LANE_MIN_H, bottom + PAD, saved?.h ?? 0, laneNameLength(lane.node.name)));
      commonW = Math.max(commonW, right + PAD, saved?.w ?? 0);
    }
    let y = 0;
    lanes.forEach((lane, i) => {
      const g = out.get(lane.id)!;
      out.set(lane.id, { ...g, ...turn({ x: TITLE_STRIP_W, y, width: commonW, height: heights[i]! }) });
      y += heights[i]!;
    });
    const fg = out.get(frame.id)!;
    const size = turn({ x: 0, y: 0, width: TITLE_STRIP_W + commonW, height: y });
    out.set(frame.id, { ...fg, width: size.width, height: size.height });
  };

  const walk = (n: ViewNode): void => {
    if (typeOf.get(n.id) === ACTIVITY_FRAME_TYPE && out.has(n.id)) arrange(n);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return out;
}

/**
 * How many slots a dragged lane moves in its frame's band order: its new index
 * (the number of OTHER lanes whose middle sits above the dragged lane's middle
 * where it was let go) minus its current one. `lanes` are the frame's lanes as
 * arranged (parent-relative y and height, any order); `droppedY` is the dragged
 * lane's top where the drag ended, in the same frame-relative units. 0 when it
 * lands back in its own slot or is not among `lanes`.
 */
export function laneDropOffset(
  lanes: readonly { id: string; y: number; height: number }[],
  draggedId: string,
  droppedY: number,
): number {
  const ordered = [...lanes].sort((a, b) => a.y - b.y);
  const from = ordered.findIndex((l) => l.id === draggedId);
  if (from === -1) return 0;
  const middle = droppedY + ordered[from]!.height / 2;
  const to = ordered.filter((l) => l.id !== draggedId && l.y + l.height / 2 < middle).length;
  return to - from;
}
