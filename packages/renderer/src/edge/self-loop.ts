import type { LayoutDirection, Point } from '@diagc/core/internal';
import type { EdgeCurve } from './edge-geometry';

/** how far the first loop rises from the box side (px) */
const RISE = 28;
/** how much further each further loop on the same box rises (px) */
const STACK_STEP = 18;
/** where along the side the loop leaves and re-enters (fractions of the side) */
const LEAVE = 0.3;
const ENTER = 0.7;
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

/** the loop as one cubic: its ends on the box side, its crown `rise` out */
function loopPoints(box: Box, direction: LayoutDirection, index: number) {
  const rise = loopRise(index);
  // 4/3 of the rise puts the cubic's crown exactly `rise` out
  const reach = (rise * 4) / 3;
  const across = direction === 'DOWN' || direction === 'UP';
  // across the flow: the top side for a horizontal flow, the right side for a vertical one
  const at = (along: number, out: number): Point =>
    across
      ? { x: box.x + box.width + out, y: box.y + box.height * along }
      : { x: box.x + box.width * along, y: box.y - out };
  return {
    from: at(LEAVE, 0),
    c1: at(LEAVE, reach),
    c2: at(ENTER, reach),
    to: at(ENTER, 0),
    label: at((LEAVE + ENTER) / 2, rise + LOOP_LABEL_GAP),
  };
}

/** a loop leaving and re-entering the box on the side across the flow (top for RIGHT/LEFT, right for DOWN/UP);
 * `index` stacks several self-loops on one box outward */
export function selfLoopPath(box: Box, direction: LayoutDirection, index = 0): SelfLoop {
  const { from, c1, c2, to, label } = loopPoints(box, direction, index);
  return {
    path: `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`,
    labelX: label.x,
    labelY: label.y,
  };
}

/** the same loop as a curve, for what is placed along an edge (marks, labels) */
export function selfLoopCurve(box: Box, direction: LayoutDirection, index = 0): EdgeCurve {
  const { from, c1, c2, to } = loopPoints(box, direction, index);
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
