import { PLAN_EVENT_TYPE, PLAN_ZONE_TYPE, type Point } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { NodeGeometry } from '../layout/layout';

/** how far before the dependent bar's start the arrow turns into it: clear of
 * the corner, short enough to read as that bar's start */
export const ELBOW_STUB = 8;
/** how far inside the first bar's end the arrow leaves it: clear of the
 * comments badge hanging off that corner (an 18px pill at `bottom/right:
 * -6px`, the note's opener) and of the 10px hit band either side of the line,
 * which would otherwise take the badge's clicks */
export const ELBOW_INSET = 24;

/** one end of an edge: its box as drawn (absolute) and its node type */
export type ElbowEnd = NodeGeometry & { type?: string };

/** what runs finish to start: a row with dates. A C4 box or any other free-form
 * node scheduled inside a zone has none, and its links keep floating. */
const DATED: ReadonlySet<string | undefined> = new Set([PLAN_ZONE_TYPE, PLAN_EVENT_TYPE]);

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
 * without a route to go stale. Undefined between anything but two dated rows.
 */
export function planElbow(source: ElbowEnd, target: ElbowEnd): { points: Point[]; label: Point } | undefined {
  if (!DATED.has(source.type) || !DATED.has(target.type)) return undefined;
  const { ROW_GAP } = PLAN_LAYOUT;
  const tx = target.x;
  const ty = rowY(target);
  const down = ty >= rowY(source);
  const edgeY = down ? source.y + source.height : source.y;
  const gapY = down ? edgeY + ROW_GAP / 2 : edgeY - ROW_GAP / 2;
  const out = source.x + source.width - Math.min(ELBOW_INSET, source.width / 2);
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
