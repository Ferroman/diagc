import { BADGE_R, type Point } from './note-place';

export type NoteSide = 'left' | 'right' | 'top' | 'bottom';

/** a tail, in the bubble's own space (0,0 = its top-left): two base points on
 * the bubble's side and the tip that points at the badge */
export interface NoteTail {
  side: NoteSide;
  base: readonly [Point, Point];
  tip: Point;
}

/** half the tail's width where it leaves the bubble */
const BASE_HALF = 7;
/** the base stays this far from the bubble's corners (border-radius 10px) */
const CORNER = 12;
/** the base sits this far inside the border, so the tail's fill paints over
 * the border line and the two merge */
const INSET = 2;
/** the tip stops this far from the badge's centre: at its rim, plus a hair,
 * so the count stays readable and the pill stays clickable */
const TIP_GAP = BADGE_R + 2;
/** shorter than this and the tail is a smudge — better none */
const MIN_LEN = 4;

/**
 * The tail from a bubble of `size` to `badge`. It leaves from the side with
 * the most room toward the badge — vertical sides win a tie, a hanging tail
 * being the comic default — at the point across from the badge, kept off the
 * rounded corners, and stops at the pill's rim. Null when the badge is under
 * the bubble (dragged over it) or too close for a tail to read.
 */
export function tailGeometry(badge: Point, size: { width: number; height: number }): NoteTail | null {
  const { width: w, height: h } = size;
  const gaps: { side: NoteSide; gap: number }[] = [
    { side: 'top', gap: -badge.y },
    { side: 'bottom', gap: badge.y - h },
    { side: 'left', gap: -badge.x },
    { side: 'right', gap: badge.x - w },
  ];
  // first wins a tie, so the vertical sides go first
  let best = gaps[0]!;
  for (const g of gaps) if (g.gap > best.gap) best = g;
  if (best.gap <= 0) return null;
  const along = (len: number, at: number) => Math.min(Math.max(at, CORNER + BASE_HALF), len - CORNER - BASE_HALF);
  let base: [Point, Point];
  let centre: Point;
  switch (best.side) {
    case 'top': {
      const x = along(w, badge.x);
      base = [{ x: x - BASE_HALF, y: INSET }, { x: x + BASE_HALF, y: INSET }];
      centre = { x, y: INSET };
      break;
    }
    case 'bottom': {
      const x = along(w, badge.x);
      base = [{ x: x - BASE_HALF, y: h - INSET }, { x: x + BASE_HALF, y: h - INSET }];
      centre = { x, y: h - INSET };
      break;
    }
    case 'left': {
      const y = along(h, badge.y);
      base = [{ x: INSET, y: y - BASE_HALF }, { x: INSET, y: y + BASE_HALF }];
      centre = { x: INSET, y };
      break;
    }
    default: {
      const y = along(h, badge.y);
      base = [{ x: w - INSET, y: y - BASE_HALF }, { x: w - INSET, y: y + BASE_HALF }];
      centre = { x: w - INSET, y };
    }
  }
  const dx = badge.x - centre.x;
  const dy = badge.y - centre.y;
  const len = Math.hypot(dx, dy);
  if (len - TIP_GAP < MIN_LEN) return null;
  const tip = { x: badge.x - (dx / len) * TIP_GAP, y: badge.y - (dy / len) * TIP_GAP };
  return { side: best.side, base, tip };
}
