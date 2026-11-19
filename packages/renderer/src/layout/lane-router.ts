import type { BoxSize, Point } from '@diagc/core/internal';

/**
 * Orthogonal routes for the links inside a banded activity frame.
 *
 * Elk lays the frame out as one graph with the lanes dissolved (swimlane.ts);
 * the banding then moves each lane's nodes by its own offset, and any route
 * whose ends moved differently — every link between lanes — is dropped. Left to
 * float, such a link is a curve from box to box that knows nothing of what lies
 * between, and in a busy frame it cuts through boxes, captions and labels.
 *
 * The banded frame still has elk's columns, though: a layer's nodes share an x
 * range and layers are spaced apart, so there are vertical GAPS no box reaches
 * at any height, and every lane keeps an empty pad strip along its top and
 * bottom. A link runs out of its source sideways to the nearest gap, along the
 * gap to a free CORRIDOR (its own row, the target's, or a lane's pad strip),
 * across to the gap beside its target, and in. Vertical runs that share a gap
 * are spread apart so parallel links stay readable.
 *
 * A link that goes BACK along the flow (a loop, a retry) cannot leave forwards
 * and arrive from behind without turning round twice. It leaves its source
 * sideways instead, runs back along a lane's pad strip, and comes into its target
 * from the side (`backRoute`). And a decision sends its branches out of
 * different corners (`fanOut`). A label sits beside its source, where a guard is read.
 *
 * Everything here is written for a flow that runs to the right. A frame whose
 * flow runs down is routed flipped (swimlane.ts).
 *
 * Pure geometry in absolute flow coordinates; no elk, no DOM.
 */

export interface RouterBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** a caption hung on the box (activity glyph name): an obstacle too */
  caption?: BoxSize;
  /** where the caption hangs: under the box, or — a column frame, routed flipped
   * (swimlane.ts) — on its right, where `caption` is the flipped caption */
  captionSide?: 'bottom' | 'right';
  /** a decision: its outgoing links leave by different corners */
  fanOut?: boolean;
}

export type HSide = 'left' | 'right';
export type VSide = 'top' | 'bottom';

export interface RouterEdge {
  id: string;
  from: string;
  to: string;
  /** a fixed end, honoured: the route leaves and arrives on that side */
  fromSide?: HSide | VSide;
  toSide?: HSide | VSide;
  hasLabel?: boolean;
  /** the label's box as drawn, for a label placed beside its source */
  labelSize?: BoxSize;
}

export interface RouterInput {
  boxes: readonly RouterBox[];
  /** horizontal y lines known to be clear of members (lane pad strips) */
  corridors: readonly number[];
  edges: readonly RouterEdge[];
}

export interface RouterResult {
  routes: Map<string, Point[]>;
  labelSpots: Map<string, Point>;
}

/** clearance kept between a route and any obstacle */
const MARGIN = 6;
/** spacing between parallel vertical runs in one gap */
const LANE_STEP = 10;
/** where the runs sharing one corridor sit, off its middle: MARGIN apart, and no
 * nearer a box than MARGIN (a pad strip is four margins wide) */
const CORRIDOR_SLOTS = [0, MARGIN, -MARGIN];
/** room between a source and the label set beside it */
const LABEL_GAP = 6;
/** a gap narrower than this carries no route */
const MIN_GAP = 2 * MARGIN;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** the box plus its caption, as one obstacle */
export function obstacleOf(b: RouterBox): Rect {
  if (b.caption === undefined) return b;
  if (b.captionSide === 'right') {
    const h = Math.max(b.height, b.caption.height);
    return { x: b.x, y: b.y + (b.height - h) / 2, width: b.width + b.caption.width, height: h };
  }
  const cx = b.x + b.width / 2;
  const w = Math.max(b.width, b.caption.width);
  return { x: cx - w / 2, y: b.y, width: w, height: b.height + b.caption.height };
}

interface Gap {
  lo: number;
  hi: number;
}

/** x intervals no obstacle reaches, between the leftmost and rightmost box */
export function columnGaps(obstacles: readonly Rect[]): Gap[] {
  const spans = obstacles.map((o) => ({ lo: o.x - MARGIN, hi: o.x + o.width + MARGIN })).sort((a, b) => a.lo - b.lo);
  const gaps: Gap[] = [];
  let reach = -Infinity;
  for (const s of spans) {
    if (reach !== -Infinity && s.lo - reach >= MIN_GAP) gaps.push({ lo: reach, hi: s.lo });
    reach = Math.max(reach, s.hi);
  }
  return gaps;
}

type Side = HSide | VSide;
export type RouterSide = Side;

const isVertical = (side: Side): side is VSide => side === 'top' || side === 'bottom';

type Obstacle = Rect & { id: string };

/** What every route is planned against: the boxes as obstacles, the column gaps
 * between them, and the rows known to be clear. Built once per activity frame. */
interface RouterContext {
  obstacles: readonly Obstacle[];
  gaps: readonly Gap[];
  corridors: readonly number[];
}

function routerContext(input: RouterInput): RouterContext {
  const obstacles = input.boxes.map((b) => ({ id: b.id, ...obstacleOf(b) }));
  return { obstacles, gaps: columnGaps(obstacles), corridors: input.corridors };
}

const NONE: ReadonlySet<string> = new Set();

/** does the straight run a→b (horizontal or vertical) stay clear of every obstacle but `skip`? */
function isClear(ctx: RouterContext, a: Point, b: Point, skip: ReadonlySet<string>): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return ctx.obstacles.every(
    (o) =>
      skip.has(o.id) ||
      x1 <= o.x - MARGIN ||
      x0 >= o.x + o.width + MARGIN ||
      y1 <= o.y - MARGIN ||
      y0 >= o.y + o.height + MARGIN,
  );
}

/** the nearest gap on a box's left or right, wherever its caption reaches */
function gapBeside(ctx: RouterContext, box: RouterBox, side: HSide): Gap | undefined {
  const o = obstacleOf(box);
  return side === 'left'
    ? [...ctx.gaps].reverse().find((g) => g.hi <= o.x + 0.5)
    : ctx.gaps.find((g) => g.lo >= o.x + o.width - 0.5);
}

const middle = (gap: Gap): number => (gap.lo + gap.hi) / 2;

const byDistance = (ys: number[], from: number): number[] =>
  [...new Set(ys)].sort((p, q) => Math.abs(p - from) - Math.abs(q - from));

/** drop repeated and collinear points */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last !== undefined && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      const straight =
        (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
        (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** the middle of the longest horizontal run (where a label reads best) */
function labelSpotOf(pts: readonly Point[]): Point {
  let best: Point = { x: (pts[0]!.x + pts[pts.length - 1]!.x) / 2, y: (pts[0]!.y + pts[pts.length - 1]!.y) / 2 };
  let len = -1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (Math.abs(a.y - b.y) >= 0.5) continue;
    const l = Math.abs(b.x - a.x);
    if (l > len) {
      len = l;
      best = { x: (a.x + b.x) / 2, y: a.y };
    }
  }
  return best;
}

/** where an end sits on its box: the middle of that side, a bottom end under
 * the caption (a line from the glyph's own edge would strike its name through) */
function endPoint(box: RouterBox, side: Side): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (side === 'left') return { x: box.x, y: cy };
  const hang = box.caption !== undefined && box.captionSide === 'right';
  if (side === 'right') return { x: box.x + box.width + (hang ? box.caption!.width : 0), y: cy };
  if (side === 'top') return { x: cx, y: box.y };
  return { x: cx, y: box.y + box.height + (hang ? 0 : (box.caption?.height ?? 0)) };
}

/** One link being routed: its edge, its two boxes, and the side each end sits on. */
interface Link<S extends Side = Side> {
  edge: RouterEdge;
  a: RouterBox;
  b: RouterBox;
  outSide: S;
  inSide: S;
}

/** A link with a fixed top or bottom end, with where its ends sit and which way they face. */
interface FixedEnds extends Link {
  start: Point;
  end: Point;
  onlyA: ReadonlySet<string>;
  onlyB: ReadonlySet<string>;
  /** a vertical end must leave (or arrive) in its own direction */
  leaves: (y: number) => boolean;
  arrives: (y: number) => boolean;
  /** a horizontal end must face the run it meets */
  facesOut: (x: number) => boolean;
  facesIn: (x: number) => boolean;
}

function fixedEnds(link: Link): FixedEnds {
  const start = endPoint(link.a, link.outSide);
  const end = endPoint(link.b, link.inSide);
  return {
    ...link,
    start,
    end,
    onlyA: new Set([link.a.id]),
    onlyB: new Set([link.b.id]),
    leaves: (y) => (link.outSide === 'bottom' ? y > start.y : y < start.y),
    arrives: (y) => (link.inSide === 'top' ? y < end.y : y > end.y),
    facesOut: (x) => (link.outSide === 'right' ? x > start.x : x < start.x),
    facesIn: (x) => (link.inSide === 'left' ? x < end.x : x > end.x),
  };
}

/**
 * A link fixed to a top or bottom side (the author's choice — the router does
 * not second-guess it): one bend where the two runs meet if both are clear,
 * else out to a corridor in the fixed side's direction and over to the gap beside the
 * other end. No spreading — these are rare, and an undefined result floats.
 */
function routeFixedEnds(ctx: RouterContext, link: Link): Point[] | undefined {
  const ends = fixedEnds(link);
  const { outSide, inSide } = link;
  if (isVertical(outSide) && !isVertical(inSide)) return downThenAcross(ctx, ends, inSide);
  if (!isVertical(outSide) && isVertical(inSide)) return acrossThenDown(ctx, ends, outSide);
  return outAcrossIn(ctx, ends);
}

/** down (or up) to the target's row, then across into it */
function downThenAcross(ctx: RouterContext, ends: FixedEnds, inSide: HSide): Point[] | undefined {
  const { start, end } = ends;
  const bend = { x: start.x, y: end.y };
  if (
    ends.leaves(end.y) &&
    ends.facesIn(start.x) &&
    isClear(ctx, start, bend, ends.onlyA) &&
    isClear(ctx, bend, end, ends.onlyB)
  ) {
    return simplify([start, bend, end]);
  }
  const gap = gapBeside(ctx, ends.b, inSide);
  if (gap === undefined) return undefined;
  const gx = middle(gap);
  if (!isClear(ctx, { x: gx, y: end.y }, end, ends.onlyB)) return undefined;
  for (const y of byDistance(ctx.corridors.filter(ends.leaves), start.y)) {
    if (isClear(ctx, start, { x: start.x, y }, ends.onlyA) && isClear(ctx, { x: start.x, y }, { x: gx, y }, NONE)) {
      return simplify([start, { x: start.x, y }, { x: gx, y }, { x: gx, y: end.y }, end]);
    }
  }
  return undefined;
}

/** across to the target's column, then down (or up) into it */
function acrossThenDown(ctx: RouterContext, ends: FixedEnds, outSide: HSide): Point[] | undefined {
  const { start, end } = ends;
  const bend = { x: end.x, y: start.y };
  if (
    ends.arrives(start.y) &&
    ends.facesOut(end.x) &&
    isClear(ctx, start, bend, ends.onlyA) &&
    isClear(ctx, bend, end, ends.onlyB)
  ) {
    return simplify([start, bend, end]);
  }
  const gap = gapBeside(ctx, ends.a, outSide);
  if (gap === undefined) return undefined;
  const gx = middle(gap);
  if (!isClear(ctx, start, { x: gx, y: start.y }, ends.onlyA)) return undefined;
  for (const y of byDistance(ctx.corridors.filter(ends.arrives), end.y)) {
    if (isClear(ctx, { x: gx, y }, { x: end.x, y }, NONE) && isClear(ctx, { x: end.x, y }, end, ends.onlyB)) {
      return simplify([start, { x: gx, y: start.y }, { x: gx, y }, { x: end.x, y }, end]);
    }
  }
  return undefined;
}

/** both vertical: out, across on a row both ends can reach, in */
function outAcrossIn(ctx: RouterContext, ends: FixedEnds): Point[] | undefined {
  const { start, end } = ends;
  const mid = (start.y + end.y) / 2;
  const rows = [mid, ...ctx.corridors].filter((y) => ends.leaves(y) && ends.arrives(y));
  for (const y of byDistance(rows, mid)) {
    if (
      isClear(ctx, start, { x: start.x, y }, ends.onlyA) &&
      isClear(ctx, { x: start.x, y }, { x: end.x, y }, NONE) &&
      isClear(ctx, { x: end.x, y }, end, ends.onlyB)
    ) {
      return simplify([start, { x: start.x, y }, { x: end.x, y }, end]);
    }
  }
  return undefined;
}

interface Plan {
  edge: RouterEdge;
  start: Point;
  end: Point;
  /** gap beside the source, and beside the target (same object when shared) */
  out: Gap;
  into: Gap;
  /** the corridor between the two gaps; undefined when they are the same gap */
  corridor?: number;
}

/** A link's finished route when it needs no shared gap (a fixed top or bottom end,
 * a straight line), else its plan through the gaps; undefined when it floats. */
function routeOrPlan(ctx: RouterContext, link: Link): { route: Point[] } | Plan | undefined {
  const { outSide, inSide } = link;
  if (isVertical(outSide) || isVertical(inSide)) {
    const route = routeFixedEnds(ctx, link);
    return route === undefined ? undefined : { route };
  }
  const start = endPoint(link.a, outSide);
  const end = endPoint(link.b, inSide);
  // side by side on one row with nothing between: a straight line. The ends may
  // sit up to a pixel apart, so the row checked is the source's.
  if (
    outSide === 'right' &&
    inSide === 'left' &&
    Math.abs(start.y - end.y) < 1 &&
    end.x > start.x &&
    isClear(ctx, start, { x: end.x, y: start.y }, new Set([link.a.id, link.b.id]))
  ) {
    return { route: [start, end] };
  }
  return planThroughGaps(ctx, { ...link, outSide, inSide }, start, end);
}

/** out sideways to the gap beside the source, along a corridor to the gap beside the target, and in */
function planThroughGaps(ctx: RouterContext, link: Link<HSide>, start: Point, end: Point): Plan | undefined {
  const out = gapBeside(ctx, link.a, link.outSide);
  const into = gapBeside(ctx, link.b, link.inSide);
  if (out === undefined || into === undefined) return undefined;
  const outAt = { x: middle(out), y: start.y };
  const intoAt = { x: middle(into), y: end.y };
  if (!isClear(ctx, start, outAt, new Set([link.a.id])) || !isClear(ctx, intoAt, end, new Set([link.b.id]))) {
    return undefined;
  }
  if (out === into) return { edge: link.edge, start, end, out, into };
  const corridor = nearestCorridor(ctx, outAt, intoAt);
  return corridor === undefined ? undefined : { edge: link.edge, start, end, out, into, corridor };
}

/** the corridor nearest the straight path that is clear from gap to gap */
function nearestCorridor(ctx: RouterContext, outAt: Point, intoAt: Point): number | undefined {
  let corridor: number | undefined;
  let cost = Infinity;
  for (const y of [outAt.y, intoAt.y, ...ctx.corridors]) {
    if (!isClear(ctx, { x: outAt.x, y }, { x: intoAt.x, y }, NONE)) continue;
    const c = Math.abs(outAt.y - y) + Math.abs(y - intoAt.y);
    if (c < cost) {
      cost = c;
      corridor = y;
    }
  }
  return corridor;
}

interface Slot {
  plan: Plan;
  which: 'out' | 'into';
  /** the middle of the vertical run this slot carries */
  mid: number;
}

/**
 * The x of every planned vertical run. Runs sharing a gap spread apart: each
 * takes its own x, in the order of where its run sits (top first), so
 * neighbours do not cross needlessly.
 */
function spreadRuns(plans: readonly Plan[]): Map<Plan, { out: number; into: number }> {
  const slots = new Map<Gap, Slot[]>();
  const claim = (gap: Gap, slot: Slot) => {
    const list = slots.get(gap) ?? [];
    list.push(slot);
    slots.set(gap, list);
  };
  for (const p of plans) {
    if (p.out === p.into) claim(p.out, { plan: p, which: 'out', mid: (p.start.y + p.end.y) / 2 });
    else {
      claim(p.out, { plan: p, which: 'out', mid: (p.start.y + p.corridor!) / 2 });
      claim(p.into, { plan: p, which: 'into', mid: (p.corridor! + p.end.y) / 2 });
    }
  }
  const xOf = new Map<Plan, { out: number; into: number }>();
  for (const [gap, list] of slots) {
    list.sort((l, r) => l.mid - r.mid);
    const step = Math.min(LANE_STEP, (gap.hi - gap.lo - 2 * MARGIN) / Math.max(1, list.length - 1));
    const centre = middle(gap);
    list.forEach((s, i) => {
      const x = list.length === 1 ? centre : centre + (i - (list.length - 1) / 2) * step;
      // a run in a shared gap is a plan's only slot: both of its x are this one
      const xs = xOf.get(s.plan) ?? { out: x, into: x };
      xs[s.which] = x;
      xOf.set(s.plan, xs);
    });
  }
  return xOf;
}

/** a plan's points, its vertical runs at the x they were spread to */
function pointsOf(p: Plan, xs: { out: number; into: number }): Point[] {
  return p.corridor === undefined
    ? [p.start, { x: xs.out, y: p.start.y }, { x: xs.out, y: p.end.y }, p.end]
    : [
        p.start,
        { x: xs.out, y: p.start.y },
        { x: xs.out, y: p.corridor },
        { x: xs.into, y: p.corridor },
        { x: xs.into, y: p.end.y },
        p.end,
      ];
}

/** does a label of `size` centred on `at` keep off every box? */
function labelFits(ctx: RouterContext, at: Point, size: BoxSize): boolean {
  const x0 = at.x - size.width / 2;
  const y0 = at.y - size.height / 2;
  return ctx.obstacles.every(
    (o) => x0 + size.width <= o.x || x0 >= o.x + o.width || y0 + size.height <= o.y || y0 >= o.y + o.height,
  );
}

/** how far a label slides along a run between two tries */
const LABEL_STEP = 8;

/** A label's spot beside its source: as near the start as it fits, on the run
 * out of the box, else on the one after the first bend. It fits where the run
 * holds it and it covers no box. Undefined when it fits on neither run. */
function spotBesideSource(ctx: RouterContext, pts: readonly Point[], size: BoxSize): Point | undefined {
  for (let i = 1; i < Math.min(3, pts.length); i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const across = Math.abs(a.x - b.x) < 0.5;
    const length = across ? size.height : size.width;
    const run = across ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
    const dir = across ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
    for (let reach = LABEL_GAP + length / 2; reach <= run - LABEL_GAP - length / 2; reach += LABEL_STEP) {
      const at = across ? { x: a.x, y: a.y + dir * reach } : { x: a.x + dir * reach, y: a.y };
      if (labelFits(ctx, at, size)) return at;
    }
  }
  return undefined;
}

function emit(ctx: RouterContext, result: RouterResult, edge: RouterEdge, route: Point[]): void {
  result.routes.set(edge.id, route);
  if (edge.hasLabel !== true) return;
  // a label reads as its source's: a guard beside its decision, an outcome beside its step
  const beside = edge.labelSize !== undefined ? spotBesideSource(ctx, route, edge.labelSize) : undefined;
  result.labelSpots.set(edge.id, beside ?? labelSpotOf(route));
}

const V_SIDES: readonly VSide[] = ['top', 'bottom'];

/** does the link go back along the flow: its target starts before its source ends */
const goesBack = (a: RouterBox, b: RouterBox): boolean => b.x < a.x + a.width;

/** How many runs each corridor already carries, so the next takes a free slot. */
type CorridorUse = Map<number, number>;

/**
 * A link that goes back: out of the source sideways, along a corridor (a lane's
 * pad strip, which no box reaches) to the target's column, and into the target
 * from the side. Of the clear ways, the shortest; a side another link of the
 * same decision already took costs extra. Undefined when no way is clear.
 */
function backRoute(
  ctx: RouterContext,
  link: Omit<Link, 'outSide' | 'inSide'>,
  used: CorridorUse,
  taken: ReadonlySet<Side>,
): { route: Point[]; outSide: VSide } | undefined {
  let best: { route: Point[]; outSide: VSide; cost: number; corridor: number } | undefined;
  for (const outSide of V_SIDES) {
    for (const inSide of V_SIDES) {
      const ends = fixedEnds({ ...link, outSide, inSide });
      const { start, end } = ends;
      for (const corridor of ctx.corridors) {
        const y = corridor + CORRIDOR_SLOTS[(used.get(corridor) ?? 0) % CORRIDOR_SLOTS.length]!;
        if (!ends.leaves(y) || !ends.arrives(y)) continue;
        const cost = Math.abs(start.y - y) + Math.abs(end.y - y) + (taken.has(outSide) ? 1e4 : 0);
        if (best !== undefined && cost >= best.cost) continue;
        if (
          !isClear(ctx, start, { x: start.x, y }, ends.onlyA) ||
          !isClear(ctx, { x: start.x, y }, { x: end.x, y }, NONE) ||
          !isClear(ctx, { x: end.x, y }, end, ends.onlyB)
        ) {
          continue;
        }
        best = { route: simplify([start, { x: start.x, y }, { x: end.x, y }, end]), outSide, cost, corridor };
      }
    }
  }
  if (best === undefined) return undefined;
  used.set(best.corridor, (used.get(best.corridor) ?? 0) + 1);
  return best;
}

/**
 * The corner each forward link of a decision leaves by, where its author fixed
 * none: sideways towards a target that lies to that side, forwards otherwise.
 * The link reaching farthest sideways chooses first; one whose corner is gone
 * leaves forwards, or shares the corner when that is gone too. A decision with a
 * single way out keeps it forwards.
 */
function fanOut(
  a: RouterBox,
  links: readonly { edge: RouterEdge; b: RouterBox }[],
  taken: Set<Side>,
): Map<string, Side> {
  const out = new Map<string, Side>();
  if (links.length + taken.size < 2) return out;
  const mid = (box: RouterBox): number => box.y + box.height / 2;
  const reach = (l: { b: RouterBox }): number => mid(l.b) - mid(a);
  for (const l of [...links].sort((p, q) => Math.abs(reach(q)) - Math.abs(reach(p)))) {
    const d = reach(l);
    const want: Side = Math.abs(d) <= a.height ? 'right' : d < 0 ? 'top' : 'bottom';
    const side = !taken.has(want) ? want : !taken.has('right') ? 'right' : want;
    taken.add(side);
    out.set(l.edge.id, side);
  }
  return out;
}

export function routeLaneEdges(input: RouterInput): RouterResult {
  const ctx = routerContext(input);
  const byId = new Map(input.boxes.map((b) => [b.id, b] as const));
  const result: RouterResult = { routes: new Map(), labelSpots: new Map() };
  const links = input.edges.flatMap((edge) => {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    return a === undefined || b === undefined || a === b ? [] : [{ edge, a, b }];
  });

  // the links that go back first: each takes a side of its source, which a
  // decision's forward links then leave free
  const used: CorridorUse = new Map();
  const takenOf = new Map<string, Set<Side>>();
  const taken = (id: string): Set<Side> => {
    const set = takenOf.get(id) ?? new Set<Side>();
    takenOf.set(id, set);
    return set;
  };
  const forward: typeof links = [];
  for (const link of links) {
    const { edge, a, b } = link;
    const free = edge.fromSide === undefined && edge.toSide === undefined;
    const back = free && goesBack(a, b) ? backRoute(ctx, link, used, taken(a.id)) : undefined;
    if (back === undefined) {
      forward.push(link);
      continue;
    }
    taken(a.id).add(back.outSide);
    emit(ctx, result, edge, back.route);
  }

  const corners = new Map<string, Side>();
  for (const box of input.boxes) {
    if (box.fanOut !== true) continue;
    const own = forward.filter((l) => l.a === box && l.edge.fromSide === undefined && l.edge.toSide === undefined);
    for (const [id, side] of fanOut(box, own, taken(box.id))) corners.set(id, side);
  }

  // a route that needs no shared gap is emitted as it is found; the planned
  // ones wait until every run in their gaps is known
  const plans: Plan[] = [];
  for (const { edge, a, b } of forward) {
    const sides = { outSide: edge.fromSide ?? 'right', inSide: edge.toSide ?? 'left' } as const;
    const corner = corners.get(edge.id);
    // a decision's corner is a preference: where no route leaves by it, the
    // link leaves forwards like any other
    const step =
      (corner !== undefined && corner !== 'right'
        ? routeOrPlan(ctx, { edge, a, b, ...sides, outSide: corner })
        : undefined) ?? routeOrPlan(ctx, { edge, a, b, ...sides });
    if (step === undefined) continue;
    if ('route' in step) emit(ctx, result, edge, step.route);
    else plans.push(step);
  }
  const xOf = spreadRuns(plans);
  for (const p of plans) emit(ctx, result, p.edge, simplify(pointsOf(p, xOf.get(p)!)));
  return result;
}
