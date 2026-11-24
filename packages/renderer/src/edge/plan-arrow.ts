import { PLAN_EVENT_TYPE, PLAN_ZONE_TYPE, type Point } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { NodeGeometry } from '../layout/layout';
import type { LabelSide } from '../notations';

/** how far inside a bar's top or bottom edge an arrow meets the bar's end when
 * the bar's name hangs on that end: clear of the name's 12px line, centred in
 * the 40px bar */
export const NAME_CLEAR = 6;

/** one end of an edge: its box as drawn (absolute), its node type, and the side
 * its name hangs on when the bar is too short for it (planLabelSides) */
export type ArrowEnd = NodeGeometry & { type?: string; nameSide?: LabelSide };

/** what runs finish to start: a row with dates. A C4 box or any other free-form
 * node scheduled inside a zone has none, and its links keep floating. */
const DATED: ReadonlySet<string | undefined> = new Set([PLAN_ZONE_TYPE, PLAN_EVENT_TYPE]);

/** the middle of a bar's first row: a bar's own middle, or an open zone's title
 * band (a tall box whose middle is somewhere among its rows) */
const rowY = (r: NodeGeometry): number => r.y + Math.min(r.height, PLAN_LAYOUT.BAR_H) / 2;

/** Where the arrow meets a bar's end: its middle, unless the bar's name hangs
 * on that very end — then just inside its edge toward the other row, so the
 * curve runs past the name rather than through it. An open zone is a group
 * whose name titles its band, whatever its side says. */
function meetY(r: ArrowEnd, nameOnThisEnd: boolean, towardBelow: boolean): number {
  if (!nameOnThisEnd || r.height > PLAN_LAYOUT.BAR_H) return rowY(r);
  return towardBelow ? r.y + r.height - NAME_CLEAR : r.y + NAME_CLEAR;
}

/**
 * Where a plan dependency's arrow runs, finish to start: from the end of the
 * bar that must finish first to the start of the one that waits on it, each at
 * its title row. The canvas curves between the two (useEdgePath), leaving
 * rightward and arriving rightward, so the head points into the bar's start; a
 * short bar's name hangs on the side the curve does not use (planLabelSides).
 * Absolute flow coordinates, from the boxes as drawn, so the arrow follows a
 * drag, a fold or an opened zone without a route to go stale. Undefined
 * between anything but two dated rows.
 */
export function planArrow(source: ArrowEnd, target: ArrowEnd): { from: Point; to: Point } | undefined {
  if (!DATED.has(source.type) || !DATED.has(target.type)) return undefined;
  const down = rowY(target) >= rowY(source);
  return {
    from: { x: source.x + source.width, y: meetY(source, source.nameSide === 'right', down) },
    to: { x: target.x, y: meetY(target, target.nameSide === 'left', !down) },
  };
}
