import type { Point } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { NodeGeometry } from '../layout/layout';

/** how far the arrow runs out of the first bar's end, and back in before the
 * dependent bar's start, before it turns: clear of the bar's corner, short
 * enough to read as leaving that bar */
export const ELBOW_STUB = 8;

/** the middle of a bar's first row: a bar's own middle, or an open zone's title
 * band (a tall box whose middle is somewhere among its rows) */
const rowY = (r: NodeGeometry): number => r.y + Math.min(r.height, PLAN_LAYOUT.BAR_H) / 2;

/**
 * A plan dependency as a Gantt chart draws one: finish to start. Out of the end
 * of the bar that must finish first, down (or up) into the gap between that
 * bar and the next row, along the gap, and down into the dependent bar's start
 * from the left, where the arrow head points at it. The horizontal run sits in
 * a gap between rows, not across a bar's title, so that is where the label
 * goes; the vertical drops cross whatever rows lie between, which is why plan
 * edges are drawn above the bars. When the dependent bar starts before the
 * first one ends, the same path runs back left along the gap. Absolute flow
 * coordinates in and out, from the boxes as drawn, so the arrow follows a
 * drag, a fold or an opened zone without a route to go stale.
 */
export function planElbow(source: NodeGeometry, target: NodeGeometry): { points: Point[]; label: Point } {
  const { ROW_GAP } = PLAN_LAYOUT;
  const sx = source.x + source.width;
  const sy = rowY(source);
  const tx = target.x;
  const ty = rowY(target);
  const gapY = ty >= sy ? source.y + source.height + ROW_GAP / 2 : source.y - ROW_GAP / 2;
  const out = sx + ELBOW_STUB;
  const into = tx - ELBOW_STUB;
  return {
    points: [
      { x: sx, y: sy },
      { x: out, y: sy },
      { x: out, y: gapY },
      { x: into, y: gapY },
      { x: into, y: ty },
      { x: tx, y: ty },
    ],
    label: { x: (out + into) / 2, y: gapY },
  };
}
