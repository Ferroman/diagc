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
