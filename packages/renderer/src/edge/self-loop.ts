import type { LayoutDirection, Point } from '@diagc/core/internal';
import type { EdgeCurve } from './edge-geometry';

/** how far the first loop rises from the box side (px) */
const RISE = 28;
/** how much further each further loop on the same box rises (px) */
const STACK_STEP = 18;
/** how far either side of the side's middle the loop leaves and re-enters (a fraction of the side) */
const HALF_SPAN = 0.2;
/** that distance at least, where the side has it: a state's right side is a
 * short one, and a fifth of it is a slit (px) */
const MIN_HALF_SPAN = 10;
/** what the span must leave of the side at either corner (px) */
const CORNER = 4;
/** half the room a loop takes along its side, at least: one on a slit bulges out to it (px) */
const MIN_HALF_EXTENT = 16;
/** how far the control points move along the side for each px the loop swells past its ends */
const BULGE_PER_SWELL = 4.5;
/** room between the loop's crown and its label (px) */
export const LOOP_LABEL_GAP = 10;

/** how far out from the box side the crown of a node's `index`-th self-loop stands (px) */
export const loopRise = (index: number): number => RISE + index * STACK_STEP;

export interface SelfLoop {
  path: string;
  labelX: number;
  labelY: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** how far a loop reaches along its side, either way from the side's middle (px) */
export const loopHalfExtent = (side: number): number => Math.max(halfSpan(side), MIN_HALF_EXTENT);

const halfSpan = (side: number): number => Math.max(side * HALF_SPAN, Math.min(side / 2 - CORNER, MIN_HALF_SPAN), 0);

/** the loop as one cubic: its ends on the box side, its crown `rise` out */
function loopPoints(box: Box, direction: LayoutDirection, index: number, labelWidth: number) {
  const rise = loopRise(index);
  // 4/3 of the rise puts the cubic's crown exactly `rise` out
  const reach = (rise * 4) / 3;
  const across = direction === 'DOWN' || direction === 'UP';
  const side = across ? box.height : box.width;
  const half = halfSpan(side);
  // how far beyond the ends the control points stand along the side, so a loop
  // on a short side is as round as one on a long side: the curve itself swells
  // by about two ninths of it
  const bulge = (loopHalfExtent(side) - half) * BULGE_PER_SWELL;
  // across the flow: the top side for a horizontal flow, the right side for a vertical one
  const at = (along: number, out: number): Point =>
    across
      ? { x: box.x + box.width + out, y: box.y + side / 2 + along }
      : { x: box.x + side / 2 + along, y: box.y - out };
  // the label is centred on its spot: above the crown that is its middle, beside
  // the crown it has to start past it
  const labelOut = rise + LOOP_LABEL_GAP + (across ? labelWidth / 2 : 0);
  return {
    from: at(-half, 0),
    c1: at(-half - bulge, reach),
    c2: at(half + bulge, reach),
    to: at(half, 0),
    label: at(0, labelOut),
  };
}

/** a loop leaving and re-entering the box on the side across the flow (top for RIGHT/LEFT, right for DOWN/UP);
 * `index` stacks several self-loops on one box outward, and `labelWidth` is how wide its label is drawn */
export function selfLoopPath(box: Box, direction: LayoutDirection, index = 0, labelWidth = 0): SelfLoop {
  const { from, c1, c2, to, label } = loopPoints(box, direction, index, labelWidth);
  return {
    path: `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`,
    labelX: label.x,
    labelY: label.y,
  };
}

/** the same loop as a curve, for what is placed along an edge (marks, labels) */
export function selfLoopCurve(box: Box, direction: LayoutDirection, index = 0): EdgeCurve {
  const { from, c1, c2, to } = loopPoints(box, direction, index, 0);
  const along = (axis: 'x' | 'y') => [from[axis], c1[axis], c2[axis], to[axis]] as const;
  const mix = (t: number, [a, b, c, d]: readonly number[]) =>
    (1 - t) ** 3 * a! + 3 * (1 - t) ** 2 * t * b! + 3 * (1 - t) * t ** 2 * c! + t ** 3 * d!;
  const slope = (t: number, [a, b, c, d]: readonly number[]) =>
    3 * (1 - t) ** 2 * (b! - a!) + 6 * (1 - t) * t * (c! - b!) + 3 * t ** 2 * (d! - c!);
  return {
    point: (t) => ({ x: mix(t, along('x')), y: mix(t, along('y')) }),
    tangent: (t) => {
      const dx = slope(t, along('x'));
      const dy = slope(t, along('y'));
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    },
  };
}

/** each self-loop's place among its node's self-loops, in edge order (0 = innermost) */
export function selfLoopIndexes(edges: readonly { id: string; from: string; to: string }[]): Map<string, number> {
  const seen = new Map<string, number>();
  const index = new Map<string, number>();
  for (const e of edges) {
    if (e.from !== e.to) continue;
    const n = seen.get(e.from) ?? 0;
    index.set(e.id, n);
    seen.set(e.from, n + 1);
  }
  return index;
}
