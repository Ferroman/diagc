import type { Point } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { NodeGeometry } from '../layout/layout';

/** how far inside the first bar's end the arrow leaves it, and how far before
 * the dependent bar's start it turns into it: clear of the corner, short
 * enough to read as that bar's end and that bar's start */
export const ELBOW_STUB = 8;

/** the middle of a bar's first row: a bar's own middle, or an open zone's title
 * band (a tall box whose middle is somewhere among its rows) */
const rowY = (r: NodeGeometry): number => r.y + Math.min(r.height, PLAN_LAYOUT.BAR_H) / 2;

/**
 * A plan dependency as a Gantt chart draws one: finish to start. Out of the
 * bar that must finish first through its bottom edge (its top, toward a row
 * above), just inside its end — not out of the end itself, where the bar's
 * name is written beside it — into the gap between that bar and the next row,
 * along the gap, and into the dependent bar's start from the left, where the
 * arrow head points at it. The horizontal run sits in a gap between rows, not
 * across a title, so that is where the label goes; the vertical drop crosses
 * whatever rows lie between, which is why plan edges are drawn above the bars.
 * When the dependent bar starts before the first one ends, the same path runs
 * back left along the gap. Absolute flow coordinates in and out, from the
 * boxes as drawn, so the arrow follows a drag, a fold or an opened zone
 * without a route to go stale.
 */
export function planElbow(source: NodeGeometry, target: NodeGeometry): { points: Point[]; label: Point } {
  const { ROW_GAP } = PLAN_LAYOUT;
  const tx = target.x;
  const ty = rowY(target);
  const down = ty >= rowY(source);
  const edgeY = down ? source.y + source.height : source.y;
  const gapY = down ? edgeY + ROW_GAP / 2 : edgeY - ROW_GAP / 2;
  const out = source.x + source.width - Math.min(ELBOW_STUB, source.width / 2);
  const into = tx - ELBOW_STUB;
  return {
    points: [
      { x: out, y: edgeY },
      { x: out, y: gapY },
      { x: into, y: gapY },
      { x: into, y: ty },
      { x: tx, y: ty },
    ],
    label: { x: (out + into) / 2, y: gapY },
  };
}
