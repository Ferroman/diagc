import {
  PLAN_TEAM_TYPE,
  PLAN_UNASSIGNED,
  PLAN_UNASSIGNED_TYPE,
  isPlanActor,
  type BoxSize,
  type DiagramModel,
  type PlanRosterFrame,
} from '@diagc/core/internal';
import { estimateBoxSize, textWidth } from './box-size';
import { PLAN_LAYOUT, chartLeft, hint, type PlanRun } from './plan-layout';

// The roster above a plan's chart: a strip of actor cards, each team that has
// members drawn as a frame around their badges (CompiledView.roster). It is a
// picture of who is in the plan, not a place on the canvas, so neither axis is
// the overlay's and every card is `fixed`.

/** cards per roster row when the plan has no dated range to measure a width
 * against (nothing to wrap by, so wrap by count instead) */
const ROSTER_WRAP_COUNT = 6;

/** One thing the roster lays in a row: a team's frame with its badges, or a
 * card standing alone (a person in no team, a team nobody is in, Unassigned). */
export type RosterUnit = { frame: PlanRosterFrame } | { card: string };

/**
 * The roster's units, in order: the frames, in the teams' model order (the
 * view's own, CompiledView.roster); then every actor in no frame, in the
 * roster's usual order; then the Unassigned card, always last. That usual
 * order is the order the actors arrive in ungrouped (role holders first, as
 * ever); grouped it follows the lanes, so a team nobody is in comes in model
 * order ahead of the people in no team.
 */
export function rosterOrder(
  model: DiagramModel,
  grouped: boolean,
  roster: readonly PlanRosterFrame[] = [],
): (ids: readonly string[]) => RosterUnit[] {
  const framed = new Set(roster.flatMap((f) => [f.team, ...f.members]));
  const index = new Map(model.nodes.map((n, i) => [n.id, i] as const));
  const isTeam = (id: string): boolean => model.nodes[index.get(id) ?? -1]?.type === PLAN_TEAM_TYPE;
  return (ids) => {
    const shown = new Set(ids);
    const loose = ids.filter((id) => !framed.has(id) && id !== PLAN_UNASSIGNED);
    const teams = grouped ? loose.filter(isTeam).sort((a, b) => index.get(a)! - index.get(b)!) : [];
    const rest = loose.filter((id) => !teams.includes(id));
    return [
      ...roster.filter((f) => shown.has(f.team)).map((frame) => ({ frame })),
      ...[...teams, ...rest].map((card) => ({ card })),
      ...(shown.has(PLAN_UNASSIGNED) ? [{ card: PLAN_UNASSIGNED }] : []),
    ];
  };
}

/** A unit laid out on its own, at (0, 0): its size, and each box in it (a
 * frame's own first) by offset. */
interface LaidUnit {
  frame: boolean;
  size: BoxSize;
  boxes: { id: string; x: number; y: number; size: BoxSize }[];
  /** how many cards it counts as when a row wraps by count */
  count: number;
}

/** the eye chip's width (styles.css .dg-eye: a 12px glyph, 2px padding a
 * side), on a frame's header row and on every card's title row alike */
export const EYE_W = 16;

// The frame's header row (styles.css .dg-roster-frame-header): the team's 16px
// icon, its 600 12px name and the eye, 6px apart, padded FRAME_PAD a side — so
// a frame never draws narrower than its own name.
const HEADER_ICON = 16;
const HEADER_GAP = 6;
const HEADER_PX = 12;
const HEADER_BOLD = 1.08;

const headerWidth = (name: string): number =>
  Math.ceil(
    2 * PLAN_LAYOUT.FRAME_PAD + HEADER_ICON + textWidth(name, HEADER_PX) * HEADER_BOLD + EYE_W + 2 * HEADER_GAP,
  );

/**
 * A card's footprint. In a roster with frames, a card is as tall as it is
 * drawn — its title row and type line, estimated as box-size.ts does — since
 * a frame hugs its badges and a card beside it lines up with them; it keeps
 * at least its hinted width, the room it has always had. A roster with no
 * frame takes the hint alone, so a plan without teams lays out as it did. A
 * card with a size hint of its own is taken at that. Every card draws its eye
 * in the title row (the Unassigned card too), save in a still export.
 */
function cardSize(run: PlanRun, id: string, framed: boolean): BoxSize {
  const size = hint(run, id);
  const real = run.realOf(id);
  const node = run.byId.get(real);
  if (!framed || node === undefined || run.sizeHints?.has(id) === true || run.sizeHints?.has(real) === true)
    return size;
  // the Unassigned card draws no icon and no type line (it is no actor)
  const actor = node.type !== PLAN_UNASSIGNED_TYPE;
  const drawn = estimateBoxSize({
    name: node.name || node.id,
    hasIcon: actor,
    shape: 'pill',
    subtitle: actor ? (node.type ?? '') : '',
    rowChrome: run.chromeless ? 0 : EYE_W,
  });
  return { width: Math.max(size.width, drawn.width), height: drawn.height };
}

/**
 * A frame: its badges flow left to right inside the padding, ROSTER_GAP
 * apart, under the header row, wrapping at `wrap` (the roster's width less the
 * padding) or by count with nothing dated — so a team wider than the chart is
 * never split across roster rows, it grows downward instead.
 */
function layFrame(run: PlanRun, frame: PlanRosterFrame, wrap: number | undefined): LaidUnit {
  const { FRAME_PAD, FRAME_HEADER, ROSTER_GAP, ROW_GAP } = PLAN_LAYOUT;
  const cards: LaidUnit['boxes'] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let inRow = 0;
  let widest = 0;
  for (const id of frame.members) {
    const size = cardSize(run, id, true);
    const overflows = wrap !== undefined ? x + size.width > wrap : inRow >= ROSTER_WRAP_COUNT;
    if (inRow > 0 && overflows) {
      y += rowH + ROW_GAP;
      x = 0;
      rowH = 0;
      inRow = 0;
    }
    cards.push({ id, x: FRAME_PAD + x, y: FRAME_HEADER + y, size });
    widest = Math.max(widest, x + size.width);
    x += size.width + ROSTER_GAP;
    rowH = Math.max(rowH, size.height);
    inRow++;
  }
  const name = run.byId.get(frame.team)?.name || frame.team;
  const size = {
    width: Math.max(FRAME_PAD + widest + FRAME_PAD, headerWidth(name)),
    height: FRAME_HEADER + y + rowH + FRAME_PAD,
  };
  return {
    frame: true,
    size,
    boxes: [{ id: frame.team, x: 0, y: 0, size }, ...cards],
    count: Math.min(frame.members.length, ROSTER_WRAP_COUNT),
  };
}

function layUnit(run: PlanRun, unit: RosterUnit, rosterWidth: number | undefined, framed: boolean): LaidUnit {
  if ('frame' in unit) {
    const wrap = rosterWidth === undefined ? undefined : rosterWidth - 2 * PLAN_LAYOUT.FRAME_PAD;
    return layFrame(run, unit.frame, wrap);
  }
  const size = cardSize(run, unit.card, framed);
  return { frame: false, size, boxes: [{ id: unit.card, x: 0, y: 0, size }], count: 1 };
}

/** The units in roster rows: a unit moves to a new row when it would cross
 * the roster's width, or past ROSTER_WRAP_COUNT cards with nothing dated. */
function rosterRows(laid: readonly LaidUnit[], rosterWidth: number | undefined): LaidUnit[][] {
  const rows: LaidUnit[][] = [];
  let row: LaidUnit[] = [];
  let right = 0;
  let count = 0;
  for (const unit of laid) {
    const overflows =
      rosterWidth !== undefined ? right + unit.size.width > rosterWidth : count + unit.count > ROSTER_WRAP_COUNT;
    if (row.length > 0 && overflows) {
      rows.push(row);
      row = [];
      right = 0;
      count = 0;
    }
    row.push(unit);
    right += unit.size.width + PLAN_LAYOUT.ROSTER_GAP;
    count += unit.count;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * The roster: actors (people or teams) with roles first, then every other
 * actor root; a strip above the header, not a picture, so neither axis is
 * the overlay's. Units (rosterOrder) run left to right from the chart's first
 * day (not the origin, which can be months earlier) and wrap into a further
 * row when the next one would cross the plan's width (an actor's own date
 * range has no bearing here, so the width the CHART draws is the only ruler
 * there is; with nothing dated yet, wrap by count instead). Rows then stack
 * UPWARD from the header, so adding a row pushes the strip further from the
 * chart rather than pushing the chart down; a row is as tall as its tallest
 * unit. A card standing alone in a row with a frame lines up with the frame's
 * first badges, under its header row.
 */
export function placeRoster(
  run: PlanRun,
  roots: readonly string[],
  order: (ids: readonly string[]) => RosterUnit[],
): void {
  const { ROW_GAP, HEADER_H, ROSTER_GAP, FRAME_HEADER } = PLAN_LAYOUT;
  const rootSet = new Set(roots);
  const actors = [...run.graph.actors, ...roots.filter((id) => isPlanActor(run.byId.get(run.realOf(id))!))].filter(
    (id, i, all) => rootSet.has(id) && all.indexOf(id) === i,
  );
  const ids = rootSet.has(PLAN_UNASSIGNED) ? [...actors, PLAN_UNASSIGNED] : actors;
  const rosterWidth = run.range !== undefined ? (run.range.end + 1 - run.range.start) * run.day : undefined;
  const units = order(ids);
  const framed = units.some((u) => 'frame' in u);
  const rows = rosterRows(
    units.map((u) => layUnit(run, u, rosterWidth, framed)),
    rosterWidth,
  );
  const left = chartLeft(run);
  // laid out from the last row up, so each earlier row's y falls out of the
  // row already placed below it
  let rowTop: number | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    const lift = (u: LaidUnit): number => (!u.frame && row.some((f) => f.frame) ? FRAME_HEADER : 0);
    const rowH = Math.max(...row.map((u) => lift(u) + u.size.height));
    const rowY = rowTop === undefined ? -HEADER_H - ROSTER_GAP - rowH : rowTop - ROW_GAP - rowH;
    let rx = left;
    for (const unit of row) {
      for (const c of unit.boxes) {
        run.geometry.set(c.id, { x: rx + c.x, y: rowY + lift(unit) + c.y, ...c.size });
        run.fixed.add(c.id);
      }
      rx += unit.size.width + ROSTER_GAP;
    }
    rowTop = rowY;
  }
}
