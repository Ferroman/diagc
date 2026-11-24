import { PLAN_EVENT_TYPE, PLAN_ZONE_TYPE, type Point } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { NodeGeometry } from '../layout/layout';

/** how far before the dependent bar's start the arrow turns into it: clear of
 * the corner, short enough to read as that bar's start */
export const ELBOW_STUB = 8;
/** how far past the first bar's end the arrow turns toward the gap (a name
 * beside the bar is hung past it: planLabelSides) */
export const ELBOW_OUT = PLAN_LAYOUT.ARROW_OUT;

/** one end of an edge: its box as drawn (absolute) and its node type */
export type ElbowEnd = NodeGeometry & { type?: string };

/** what runs finish to start: a row with dates. A C4 box or any other free-form
 * node scheduled inside a zone has none, and its links keep floating. */
const DATED: ReadonlySet<string | undefined> = new Set([PLAN_ZONE_TYPE, PLAN_EVENT_TYPE]);

/** the middle of a bar's first row: a bar's own middle, or an open zone's title
 * band (a tall box whose middle is somewhere among its rows) */
const rowY = (r: NodeGeometry): number => r.y + Math.min(r.height, PLAN_LAYOUT.BAR_H) / 2;

/**
 * A plan dependency as a Gantt chart draws one: finish to start. Out of the end
 * of the bar that must finish first, at its title row, a short way right, then
 * down into the gap between that bar and the next row (up, toward a row above),
 * along the gap, and into the dependent bar's start from the left, where the
 * arrow head points at it. The horizontal run sits in a gap between rows, not
 * across a title, so that is where the label goes; the vertical drops cross
 * whatever rows lie between, which is why plan edges are drawn above the bars.
 * When the dependent bar starts before the arrow's turn, the run goes back left
 * in the gap beside the dependent bar instead (above it, or below one above):
 * along the first bar's own gap it would pass under that bar's corner badge,
 * and the dependent bar's gap is where the run ends anyway. Absolute flow coordinates in and out, from the
 * boxes as drawn, so the arrow follows a drag, a fold or an opened zone
 * without a route to go stale. Undefined between anything but two dated rows.
 */
export function planElbow(source: ElbowEnd, target: ElbowEnd): { points: Point[]; label: Point } | undefined {
  if (!DATED.has(source.type) || !DATED.has(target.type)) return undefined;
  const { ROW_GAP } = PLAN_LAYOUT;
  const sx = source.x + source.width;
  const sy = rowY(source);
  const tx = target.x;
  const ty = rowY(target);
  const down = ty >= sy;
  const out = sx + ELBOW_OUT;
  const into = tx - ELBOW_STUB;
  const back = into < out;
  const half = ROW_GAP / 2;
  const below = (r: NodeGeometry): number => r.y + r.height + half;
  const above = (r: NodeGeometry): number => r.y - half;
  const gapY = down ? (back ? above(target) : below(source)) : back ? below(target) : above(source);
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
