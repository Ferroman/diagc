import { Position } from '@xyflow/react';

/** pure geometry inputs shared with `getBezierPath`/`getStraightPath`/`getSmoothStepPath` */
export interface EdgePathParams {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
}

export type EdgeShape = 'straight' | 'curved' | 'step' | 'bow';

/** which side of the travel direction a bow bulges toward; 'left' = the default
 * left-of-travel normal, 'right' = the mirror (same arrow direction, other side) */
export type BowSide = 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

// xyflow's default when a bezier edge doesn't specify `curvature` (see
// `getBezierPath` in @xyflow/system) — mirrored here so an unset curvature
// evaluates points identically to the path xyflow actually renders.
export const DEFAULT_CURVATURE = 0.25;

// Mirrors @xyflow/system's bezier-edge.js `calculateControlOffset` exactly:
// when the other endpoint already lies in this handle's natural direction,
// the control point sits halfway there (curvature has no effect); only when
// it lies the "wrong" way does the offset grow with curvature.
function calculateControlOffset(distance: number, curvature: number): number {
  if (distance >= 0) {
    return 0.5 * distance;
  }
  return curvature * 25 * Math.sqrt(-distance);
}

// Mirrors @xyflow/system's `getControlWithCurvature` exactly.
function getControlWithCurvature(pos: Position, x1: number, y1: number, x2: number, y2: number, c: number): Point {
  switch (pos) {
    case Position.Left:
      return { x: x1 - calculateControlOffset(x1 - x2, c), y: y1 };
    case Position.Right:
      return { x: x1 + calculateControlOffset(x2 - x1, c), y: y1 };
    case Position.Top:
      return { x: x1, y: y1 - calculateControlOffset(y1 - y2, c) };
    case Position.Bottom:
    default:
      return { x: x1, y: y1 + calculateControlOffset(y2 - y1, c) };
  }
}

/** the four control points xyflow's `getBezierPath` would build for this curvature */
function bezierControlPoints(params: EdgePathParams, curvature: number): [Point, Point, Point, Point] {
  const p0: Point = { x: params.sourceX, y: params.sourceY };
  const p3: Point = { x: params.targetX, y: params.targetY };
  const p1 = getControlWithCurvature(params.sourcePosition, p0.x, p0.y, p3.x, p3.y, curvature);
  const p2 = getControlWithCurvature(params.targetPosition, p3.x, p3.y, p0.x, p0.y, curvature);
  return [p0, p1, p2, p3];
}

// Tuning for the symmetric bow (see `bowControlPoints`): how much of the
// chord length becomes perpendicular offset per unit of curvature, and the
// floor/ceiling that keeps very short/long chords from bowing imperceptibly
// or absurdly far.
const BOW_CURVATURE_SCALE = 0.6;
const BOW_MIN_OFFSET = 24;
const BOW_MAX_OFFSET = 160;

/**
 * The four control points for a symmetric perpendicular bow between two
 * points, independent of handle-facing (unlike `bezierControlPoints`, which
 * mirrors xyflow's `getBezierPath` and only bends when a handle points away
 * from the other node). Both control points are offset to the *same* side of
 * the chord (the left-of-travel normal), so the curve is a single smooth arc
 * peaking near the middle — and because the normal flips with travel
 * direction, an edge and its reverse bow to opposite sides and visually
 * separate instead of overlapping.
 */
function bowControlPoints(params: EdgePathParams, curvature: number, side: BowSide = 'left'): [Point, Point, Point, Point] {
  const p0: Point = { x: params.sourceX, y: params.sourceY };
  const p3: Point = { x: params.targetX, y: params.targetY };
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    // Degenerate (coincident source/target): no chord to bow off of.
    return [p0, p0, p0, p0];
  }
  const ux = dx / len;
  const uy = dy / len;
  // left-of-travel normal — consistent handedness so reversing source/target
  // (which flips u) also flips n, bowing the reverse edge to the other side.
  // `side` mirrors it on demand (same arrow direction, opposite bulge).
  const s = side === 'right' ? -1 : 1;
  const nx = -uy * s;
  const ny = ux * s;
  const h = Math.min(BOW_MAX_OFFSET, Math.max(BOW_MIN_OFFSET, curvature * len * BOW_CURVATURE_SCALE));
  const c1: Point = { x: p0.x + ux * (len / 3) + nx * h, y: p0.y + uy * (len / 3) + ny * h };
  const c2: Point = { x: p0.x + ux * ((2 * len) / 3) + nx * h, y: p0.y + uy * ((2 * len) / 3) + ny * h };
  return [p0, c1, c2, p3];
}

/** SVG path string for the symmetric bow (see `bowControlPoints`), formatted like `getBezierPath`'s output. */
export function bowPath(params: EdgePathParams, curvature: number, side: BowSide = 'left'): string {
  const [p0, p1, p2, p3] = bowControlPoints(params, curvature, side);
  return `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** B'(t): derivative of the cubic Bézier defined by p0..p3 */
function cubicDerivative(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

function chordTangent(params: EdgePathParams): Point {
  const dx = params.targetX - params.sourceX;
  const dy = params.targetY - params.sourceY;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

/**
 * Point at parameter `t` along an edge, matching how `DiagramEdge` would
 * actually render it for the same `shape`/`curvature`. For `'curved'` this
 * evaluates the exact cubic Bézier `getBezierPath` builds (see
 * `bezierControlPoints`); for `'bow'` it evaluates the symmetric bow (see
 * `bowControlPoints`/`bowPath`); no DOM, no `getPointAtLength`.
 */
export function edgePoint(
  shape: EdgeShape,
  params: EdgePathParams,
  curvature: number | undefined,
  t: number,
  side: BowSide = 'left',
): Point {
  if (shape === 'curved') {
    const [p0, p1, p2, p3] = bezierControlPoints(params, curvature ?? DEFAULT_CURVATURE);
    return cubicPoint(p0, p1, p2, p3, t);
  }
  if (shape === 'bow') {
    const [p0, p1, p2, p3] = bowControlPoints(params, curvature ?? DEFAULT_CURVATURE, side);
    return cubicPoint(p0, p1, p2, p3, t);
  }
  // 'straight' and 'step' (documented approximation: the step path's corners
  // aren't modeled — callers only need the chord midpoint at t=0.5).
  return {
    x: params.sourceX + (params.targetX - params.sourceX) * t,
    y: params.sourceY + (params.targetY - params.sourceY) * t,
  };
}

/**
 * Unit tangent at parameter `t`, matching `edgePoint`'s shape handling.
 * For `'curved'` this is `B'(t)` normalized; for `'straight'`/`'step'` it's
 * the constant chord direction.
 */
export function edgeTangent(
  shape: EdgeShape,
  params: EdgePathParams,
  curvature: number | undefined,
  t: number,
  side: BowSide = 'left',
): Point {
  if (shape === 'curved') {
    const [p0, p1, p2, p3] = bezierControlPoints(params, curvature ?? DEFAULT_CURVATURE);
    const d = cubicDerivative(p0, p1, p2, p3, t);
    const len = Math.hypot(d.x, d.y);
    return len === 0 ? chordTangent(params) : { x: d.x / len, y: d.y / len };
  }
  if (shape === 'bow') {
    const [p0, p1, p2, p3] = bowControlPoints(params, curvature ?? DEFAULT_CURVATURE, side);
    const d = cubicDerivative(p0, p1, p2, p3, t);
    const len = Math.hypot(d.x, d.y);
    return len === 0 ? chordTangent(params) : { x: d.x / len, y: d.y / len };
  }
  return chordTangent(params);
}

/**
 * Nearest parameter `t` on the path to `point` (sampled over t∈[0,1]), plus the
 * signed perpendicular distance at that t — positive = above the line (screen-up
 * normal), negative = below. Mirrors edgePoint/edgeTangent's shape handling.
 */
export function nearestT(
  shape: EdgeShape,
  params: EdgePathParams,
  curvature: number | undefined,
  point: Point,
  side: BowSide = 'left',
): { t: number; perp: number } {
  const N = 40;
  let bestT = 0.5;
  let bestD = Infinity;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = edgePoint(shape, params, curvature, t, side);
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  const p = edgePoint(shape, params, curvature, bestT, side);
  const tan = edgeTangent(shape, params, curvature, bestT, side);
  let nx = -tan.y;
  let ny = tan.x;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  } // up-pointing normal
  const perp = (point.x - p.x) * nx + (point.y - p.y) * ny;
  return { t: bestT, perp };
}

// ---------------------------------------------------------------------------
// A drawn edge as something to place things ALONG. `DiagramEdge` draws either a
// floating shape (above) or a route through laid-out waypoints (below); labels,
// CLD marks and the label drag only need "the point and direction at t", so both
// are wrapped behind one small interface.

export interface EdgeCurve {
  point: (t: number) => Point;
  /** unit tangent at t */
  tangent: (t: number) => Point;
}

/** the floating shapes, as an EdgeCurve (see edgePoint / edgeTangent) */
export function shapeCurve(
  shape: EdgeShape,
  params: EdgePathParams,
  curvature: number | undefined,
  side: BowSide = 'left',
): EdgeCurve {
  return {
    point: (t) => edgePoint(shape, params, curvature, t, side),
    tangent: (t) => edgeTangent(shape, params, curvature, t, side),
  };
}

/**
 * A route (polyline through waypoints), parametrised by ARC LENGTH: t=0.5 is
 * halfway along the line as drawn, not the middle waypoint — on a route with one
 * long leg and two stubs those are far apart. The corner rounding `roundedRoute`
 * applies is ignored: it moves the line by a few px at most, only at the bends.
 */
export function routeCurve(points: readonly Point[]): EdgeCurve {
  const first = points[0] ?? { x: 0, y: 0 };
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lengths.push(len);
    total += len;
  }
  /** the leg holding arc-length position t·total, and how far along it (0..1) */
  const locate = (t: number): { i: number; u: number } => {
    let left = Math.min(1, Math.max(0, t)) * total;
    for (let i = 0; i < lengths.length; i++) {
      const len = lengths[i]!;
      // a zero-length leg holds nothing; the last leg takes whatever is left
      if (len > 0 && (left <= len || i === lengths.length - 1)) return { i, u: Math.min(1, left / len) };
      left -= len;
    }
    return { i: Math.max(0, lengths.length - 1), u: 0 };
  };
  return {
    point: (t) => {
      if (total === 0) return first;
      const { i, u } = locate(t);
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    },
    tangent: (t) => {
      if (total === 0) return { x: 0, y: 0 };
      const { i } = locate(t);
      const a = points[i]!;
      const b = points[i + 1]!;
      const len = lengths[i]!;
      return len === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    },
  };
}

/** `nearestT` for any EdgeCurve: nearest sampled t to `point`, plus the signed
 * perpendicular distance there (positive = screen-up side of the line). */
export function nearestOnCurve(curve: EdgeCurve, point: Point, samples = 40): { t: number; perp: number } {
  let bestT = 0.5;
  let bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.point(t);
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  const p = curve.point(bestT);
  const tan = curve.tangent(bestT);
  let nx = -tan.y;
  let ny = tan.x;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  } // up-pointing normal
  return { t: bestT, perp: (point.x - p.x) * nx + (point.y - p.y) * ny };
}

/**
 * The point of a waypoint route closest to `point` — exact, per leg, unlike the
 * sampled `nearestOnCurve`. Used to seat a label ON its line: elk centres an
 * inline label on the route it returned, but the route is then tidied and its
 * ends snapped to the drawn boxes, which can slide a leg a few px out from under
 * the label.
 */
export function nearestOnRoute(points: readonly Point[], point: Point): Point {
  let best: Point = points[0] ?? point;
  let bestD = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    const p = { x: a.x + u * dx, y: a.y + u * dy };
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** SVG path through waypoints with rounded corners. The radius is capped at half
 * of either leg, so two close bends (a short jog) melt into one S-curve and the
 * line never leaves the corridor the waypoints describe. */
export function roundedRoute(points: readonly Point[], radius: number): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M${points[0]!.x},${points[0]!.y} L${points[1]!.x},${points[1]!.y}`;
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const p1x = cur.x - ((cur.x - prev.x) / inLen) * r;
    const p1y = cur.y - ((cur.y - prev.y) / inLen) * r;
    const p2x = cur.x + ((next.x - cur.x) / outLen) * r;
    const p2y = cur.y + ((next.y - cur.y) / outLen) * r;
    d += ` L${p1x},${p1y} Q${cur.x},${cur.y} ${p2x},${p2y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L${last.x},${last.y}`;
  return d;
}

/**
 * Straighten the hairline jogs out of an orthogonal route.
 *
 * Where an edge crosses a container wall elk pins it to a port on that wall,
 * and the port's coordinate is rounded separately from the leg arriving at it:
 * the route comes back with a sidestep of a few px in the middle of an otherwise
 * straight run, which draws as a visible kink. A leg shorter than `tolerance`
 * between two legs perpendicular to it is removed by sliding everything BEFORE
 * it onto the line after it — a shift of a couple of px along a node border or
 * across a gap, never into a box.
 */
export function tidyRoute(points: readonly Point[], tolerance = 10): Point[] {
  const out = points.map((p) => ({ ...p }));
  for (let i = 1; i + 2 < out.length; ) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const d = out[i + 2]!;
    const jogX = b.y === c.y && Math.abs(c.x - b.x) > 0 && Math.abs(c.x - b.x) <= tolerance && a.x === b.x && c.x === d.x;
    const jogY = b.x === c.x && Math.abs(c.y - b.y) > 0 && Math.abs(c.y - b.y) <= tolerance && a.y === b.y && c.y === d.y;
    if (!jogX && !jogY) {
      i++;
      continue;
    }
    // everything up to the jog moves onto the far leg's line, as long as it lay on the near one
    const near = jogX ? b.x : b.y;
    for (let k = i; k >= 0; k--) {
      const p = out[k]!;
      if ((jogX ? p.x : p.y) !== near) break;
      if (jogX) p.x = c.x;
      else p.y = c.y;
    }
    out.splice(i, 2);
  }
  return out;
}

/** Which side of its box each end of a route attaches to, read off the
 * direction of the end's own leg (undefined for a leg that is not axis-aligned). */
export function routeEndSides(points: readonly Point[]): {
  from: 'top' | 'right' | 'bottom' | 'left' | undefined;
  to: 'top' | 'right' | 'bottom' | 'left' | undefined;
} {
  const leaving = (a: Point | undefined, b: Point | undefined) =>
    a === undefined || b === undefined
      ? undefined
      : a.x === b.x && a.y !== b.y
        ? b.y > a.y
          ? ('bottom' as const)
          : ('top' as const)
        : a.y === b.y && a.x !== b.x
          ? b.x > a.x
            ? ('right' as const)
            : ('left' as const)
          : undefined;
  return { from: leaving(points[0], points[1]), to: leaving(points[points.length - 1], points[points.length - 2]) };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Land a route's two ends on the boxes as DRAWN.
 *
 * elk routed against the box it was told about; the drawn one can differ by a
 * few px (an estimated size — see box-size.ts — or a font that renders wider),
 * and then an arrowhead is buried under the node or stops short of it. Each end
 * is slid along its own (axis-aligned) leg onto the border it was heading for.
 * An end whose leg is not axis-aligned, or does not point at the box at all, is
 * left where elk put it.
 */
export function snapRouteEnds(points: readonly Point[], source: Rect | undefined, target: Rect | undefined): Point[] {
  const out = points.map((p) => ({ ...p }));
  if (out.length < 2) return out;
  // Along one axis: the border facing the rest of the route, or — when the
  // route continues INSIDE the box (an edge from a container to its own child)
  // — whichever border the end already sits nearer to.
  const slide = (at: number, toward: number, lo: number, hi: number): number =>
    toward < lo ? lo : toward > hi ? hi : at - lo <= hi - at ? lo : hi;
  const land = (end: Point, toward: Point, box: Rect | undefined): void => {
    if (box === undefined || box.width <= 0 || box.height <= 0) return;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    if (end.x === toward.x && end.x >= box.x && end.x <= right) end.y = slide(end.y, toward.y, box.y, bottom);
    else if (end.y === toward.y && end.y >= box.y && end.y <= bottom) end.x = slide(end.x, toward.x, box.x, right);
  };
  land(out[0]!, out[1]!, source);
  land(out[out.length - 1]!, out[out.length - 2]!, target);
  return out;
}
