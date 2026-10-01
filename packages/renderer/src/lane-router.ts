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
 * Pure geometry in absolute flow coordinates; no elk, no DOM.
 */

export interface Point {
  x: number;
  y: number;
}

export interface RouterBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** a caption hung under the box (activity glyph name): an obstacle too */
  caption?: { width: number; height: number };
}

export type HSide = 'left' | 'right';
export type VSide = 'top' | 'bottom';

export interface RouterEdge {
  id: string;
  from: string;
  to: string;
  /** a pinned end, honoured: the route leaves and arrives on that side */
  fromSide?: HSide | VSide;
  toSide?: HSide | VSide;
  hasLabel?: boolean;
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

/** does the horizontal run y, x0..x1 stay clear of every obstacle but `skip`? */
function clearH(y: number, x0: number, x1: number, obstacles: readonly (Rect & { id: string })[], skip: ReadonlySet<string>): boolean {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  return obstacles.every(
    (o) => skip.has(o.id) || hi <= o.x - MARGIN || lo >= o.x + o.width + MARGIN || y <= o.y - MARGIN || y >= o.y + o.height + MARGIN,
  );
}

/** drop repeated and collinear points */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last !== undefined && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      const straight = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** the middle of the longest horizontal run (where a label chip reads best) */
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

/** does the vertical run x, y0..y1 stay clear of every obstacle but `skip`? */
function clearV(x: number, y0: number, y1: number, obstacles: readonly (Rect & { id: string })[], skip: ReadonlySet<string>): boolean {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  return obstacles.every(
    (o) => skip.has(o.id) || x <= o.x - MARGIN || x >= o.x + o.width + MARGIN || hi <= o.y - MARGIN || lo >= o.y + o.height + MARGIN,
  );
}

/** where an end sits on its box: the middle of that side, a bottom end under
 * the caption (a line from the glyph's own edge would strike its name through) */
function endPoint(box: RouterBox, side: HSide | VSide): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (side === 'left') return { x: box.x, y: cy };
  if (side === 'right') return { x: box.x + box.width, y: cy };
  if (side === 'top') return { x: cx, y: box.y };
  return { x: cx, y: box.y + box.height + (box.caption?.height ?? 0) };
}

/**
 * A link pinned to a top or bottom side (the author's choice — the router does
 * not second-guess it): one bend where the two runs meet if both are clear,
 * else out to a corridor in the pinned direction and over to the gap beside the
 * other end. No spreading — these are rare, and an undefined result floats.
 */
function routeVerticalEnds(
  a: RouterBox,
  b: RouterBox,
  outSide: HSide | VSide,
  inSide: HSide | VSide,
  obstacles: readonly (Rect & { id: string })[],
  gaps: readonly Gap[],
  corridors: readonly number[],
): Point[] | undefined {
  const start = endPoint(a, outSide);
  const end = endPoint(b, inSide);
  const onlyA = new Set([a.id]);
  const onlyB = new Set([b.id]);
  const none = new Set<string>();
  const outV = outSide === 'top' || outSide === 'bottom';
  const inV = inSide === 'top' || inSide === 'bottom';
  // a vertical end must leave (or arrive) in its own direction
  const leaves = (y: number) => (outSide === 'bottom' ? y > start.y : y < start.y);
  const arrives = (y: number) => (inSide === 'top' ? y < end.y : y > end.y);
  // a horizontal end must face the run it meets
  const facesOut = (x: number) => (outSide === 'right' ? x > start.x : x < start.x);
  const facesIn = (x: number) => (inSide === 'left' ? x < end.x : x > end.x);
  const byDistance = (ys: number[], from: number) => [...new Set(ys)].sort((p, q) => Math.abs(p - from) - Math.abs(q - from));

  if (outV && !inV) {
    // down (or up) to the target's row, then across into it
    if (leaves(end.y) && facesIn(start.x) && clearV(start.x, start.y, end.y, obstacles, onlyA) && clearH(end.y, start.x, end.x, obstacles, onlyB)) {
      return simplify([start, { x: start.x, y: end.y }, end]);
    }
    const gap = inSide === 'left' ? [...gaps].reverse().find((g) => g.hi <= obstacleOf(b).x + 0.5) : gaps.find((g) => g.lo >= obstacleOf(b).x + obstacleOf(b).width - 0.5);
    if (gap === undefined) return undefined;
    const gx = (gap.lo + gap.hi) / 2;
    if (!clearH(end.y, gx, end.x, obstacles, onlyB)) return undefined;
    for (const y of byDistance(corridors.filter(leaves), start.y)) {
      if (clearV(start.x, start.y, y, obstacles, onlyA) && clearH(y, start.x, gx, obstacles, none)) {
        return simplify([start, { x: start.x, y }, { x: gx, y }, { x: gx, y: end.y }, end]);
      }
    }
    return undefined;
  }
  if (!outV && inV) {
    // across to the target's column, then down (or up) into it
    if (arrives(start.y) && facesOut(end.x) && clearH(start.y, start.x, end.x, obstacles, onlyA) && clearV(end.x, start.y, end.y, obstacles, onlyB)) {
      return simplify([start, { x: end.x, y: start.y }, end]);
    }
    const gap = outSide === 'right' ? gaps.find((g) => g.lo >= obstacleOf(a).x + obstacleOf(a).width - 0.5) : [...gaps].reverse().find((g) => g.hi <= obstacleOf(a).x + 0.5);
    if (gap === undefined) return undefined;
    const gx = (gap.lo + gap.hi) / 2;
    if (!clearH(start.y, start.x, gx, obstacles, onlyA)) return undefined;
    for (const y of byDistance(corridors.filter(arrives), end.y)) {
      if (clearH(y, gx, end.x, obstacles, none) && clearV(end.x, y, end.y, obstacles, onlyB)) {
        return simplify([start, { x: gx, y: start.y }, { x: gx, y }, { x: end.x, y }, end]);
      }
    }
    return undefined;
  }
  // both vertical: out, across on a row both ends can reach, in
  const mid = (start.y + end.y) / 2;
  for (const y of byDistance([mid, ...corridors].filter((y) => leaves(y) && arrives(y)), mid)) {
    if (clearV(start.x, start.y, y, obstacles, onlyA) && clearH(y, start.x, end.x, obstacles, none) && clearV(end.x, y, end.y, obstacles, onlyB)) {
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

export function routeLaneEdges(input: RouterInput): RouterResult {
  const routes = new Map<string, Point[]>();
  const labelSpots = new Map<string, Point>();
  const byId = new Map(input.boxes.map((b) => [b.id, b] as const));
  const obstacles = input.boxes.map((b) => ({ id: b.id, ...obstacleOf(b) }));
  const gaps = columnGaps(obstacles);

  const plans: Plan[] = [];
  for (const edge of input.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (a === undefined || b === undefined || a === b) continue;
    const outSide: HSide | undefined = edge.fromSide === undefined ? 'right' : edge.fromSide === 'left' || edge.fromSide === 'right' ? edge.fromSide : undefined;
    const inSide: HSide | undefined = edge.toSide === undefined ? 'left' : edge.toSide === 'left' || edge.toSide === 'right' ? edge.toSide : undefined;
    if (outSide === undefined || inSide === undefined) {
      const route = routeVerticalEnds(a, b, outSide ?? (edge.fromSide as VSide), inSide ?? (edge.toSide as VSide), obstacles, gaps, input.corridors);
      if (route !== undefined) {
        routes.set(edge.id, route);
        if (edge.hasLabel === true) labelSpots.set(edge.id, labelSpotOf(route));
      }
      continue;
    }
    const oa = obstacleOf(a);
    const ob = obstacleOf(b);
    const ay = a.y + a.height / 2;
    const by = b.y + b.height / 2;
    const start = { x: outSide === 'right' ? a.x + a.width : a.x, y: ay };
    const end = { x: inSide === 'left' ? b.x : b.x + b.width, y: by };
    const skipEnds = new Set([a.id, b.id]);

    // side by side on one row with nothing between: a straight line
    if (outSide === 'right' && inSide === 'left' && Math.abs(ay - by) < 1 && end.x > start.x && clearH(ay, start.x, end.x, obstacles, skipEnds)) {
      routes.set(edge.id, [start, end]);
      if (edge.hasLabel === true) labelSpots.set(edge.id, labelSpotOf([start, end]));
      continue;
    }

    const out = outSide === 'right' ? gaps.find((g) => g.lo >= oa.x + oa.width - 0.5) : [...gaps].reverse().find((g) => g.hi <= oa.x + 0.5);
    const into = inSide === 'left' ? [...gaps].reverse().find((g) => g.hi <= ob.x + 0.5) : gaps.find((g) => g.lo >= ob.x + ob.width - 0.5);
    if (out === undefined || into === undefined) continue;
    const outX = (out.lo + out.hi) / 2;
    const intoX = (into.lo + into.hi) / 2;
    if (!clearH(ay, start.x, outX, obstacles, new Set([a.id])) || !clearH(by, intoX, end.x, obstacles, new Set([b.id]))) continue;

    if (out === into) {
      plans.push({ edge, start, end, out, into });
      continue;
    }
    // the corridor nearest the straight path that is clear from gap to gap
    const candidates = [ay, by, ...input.corridors];
    let corridor: number | undefined;
    let cost = Infinity;
    for (const y of candidates) {
      if (!clearH(y, outX, intoX, obstacles, new Set())) continue;
      const c = Math.abs(ay - y) + Math.abs(y - by);
      if (c < cost) {
        cost = c;
        corridor = y;
      }
    }
    if (corridor === undefined) continue;
    plans.push({ edge, start, end, out, into, corridor });
  }

  // Spread the vertical runs sharing a gap: each takes its own x, in the order
  // of where its run sits (top first), so neighbours do not cross needlessly.
  const slots = new Map<Gap, { plan: Plan; which: 'out' | 'into'; mid: number }[]>();
  const claim = (gap: Gap, plan: Plan, which: 'out' | 'into', y0: number, y1: number) => {
    const list = slots.get(gap) ?? [];
    list.push({ plan, which, mid: (y0 + y1) / 2 });
    slots.set(gap, list);
  };
  for (const p of plans) {
    if (p.out === p.into) claim(p.out, p, 'out', p.start.y, p.end.y);
    else {
      claim(p.out, p, 'out', p.start.y, p.corridor!);
      claim(p.into, p, 'into', p.corridor!, p.end.y);
    }
  }
  const xOf = new Map<Plan, { out: number; into: number }>();
  for (const [gap, list] of slots) {
    list.sort((l, r) => l.mid - r.mid);
    const step = Math.min(LANE_STEP, (gap.hi - gap.lo - 2 * MARGIN) / Math.max(1, list.length - 1));
    const centre = (gap.lo + gap.hi) / 2;
    list.forEach((s, i) => {
      const x = list.length === 1 ? centre : centre + (i - (list.length - 1) / 2) * step;
      const xs = xOf.get(s.plan) ?? { out: x, into: x };
      xs[s.which] = x;
      if (s.plan.out === s.plan.into) xs.into = x;
      xOf.set(s.plan, xs);
    });
  }

  for (const p of plans) {
    const xs = xOf.get(p)!;
    const pts =
      p.corridor === undefined
        ? [p.start, { x: xs.out, y: p.start.y }, { x: xs.out, y: p.end.y }, p.end]
        : [p.start, { x: xs.out, y: p.start.y }, { x: xs.out, y: p.corridor }, { x: xs.into, y: p.corridor }, { x: xs.into, y: p.end.y }, p.end];
    const route = simplify(pts);
    routes.set(p.edge.id, route);
    if (p.edge.hasLabel === true) labelSpots.set(p.edge.id, labelSpotOf(route));
  }
  return { routes, labelSpots };
}
