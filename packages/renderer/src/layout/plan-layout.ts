import {
  LEAF_SIZE,
  atOf,
  dayOf,
  isPlanActor,
  isPlanEvent,
  isPlanZone,
  PLAN_LANE_TYPE,
  PLAN_UNASSIGNED,
  PLAN_UNASSIGNED_TYPE,
  PLAN_NOTATION,
  PLAN_ROLES,
  isPlanPeriod,
  periodSpanOf,
  planGraphCached,
  planSubtree,
  planSubtreeRange,
  rolesOf,
  spanOf,
  type BoxSize,
  type DiagramModel,
  type DiagramNode,
  type PlanChildren,
  type PlanGraph,
  type PlanSpan,
  type PlanRole,
  type Point,
  type ViewNode,
} from '@diagc/core/internal';
import type { NodeChip } from '../notations';
import { textWidth, wrapText } from './box-size';
import type { LayoutResult, NodeGeometry, NotationLayoutInput } from './layout';
import { placeLanes, rosterCardSize, rosterOrder, viewKids } from './plan-lanes';

/** The schedule's fixed geometry. `DAY` is the default scale (px per calendar
 * day) and the unit saved positions are kept in; the view can stretch time to
 * any width from `DAY_MIN` to `DAY_MAX`, stepping through `DAY_STEPS`;
 * the rest are the strip, row and column sizes every expectation derives from.
 * `ROSTER_GAP` is both the roster's horizontal card spacing and the vertical
 * gap between its last row and the header; `ROW_GAP` (shared with a zone's own
 * child rows) spaces the roster's rows from each other. `LANE_H` is a grouped
 * chart's lane header row (plan-lanes.ts). */
const MONTH_H = 22;
const WEEK_H = 22;
const DAY_H = 30;

export const PLAN_LAYOUT = {
  DAY: 20,
  DAY_MIN: 20,
  DAY_MAX: 80,
  DAY_STEPS: [20, 30, 40, 60, 80],
  BAR_H: 40,
  TITLE_H: 40,
  PAD: 12,
  ROW_GAP: 8,
  EVENT: 16,
  /** the header's three bands, top to bottom above y = 0: months, ISO weeks,
   * and days — the day band is the tallest, a weekday letter over the day of
   * the month, stacked so both fit a 20px day */
  MONTH_H,
  WEEK_H,
  DAY_H,
  HEADER_H: MONTH_H + WEEK_H + DAY_H,
  ROSTER_GAP: 24,
  LANE_H: 24,
} as const;

/** What a zone's text is estimated with, read off styles.css: a zone with rows
 * titles itself in `.dg-group-header` (600 11px, padded 8px 10px; the plan's
 * rule wraps it onto 14px lines, chips onto a line of their own 4px below);
 * a childless bar is a `.dg-node` (12px, its `.dg-label` 600, padded 10px a
 * side); a role chip is a `.dg-badge` (10px, 6px a side and a 1px border, 4px
 * apart, the row 8px off the name). `BOLD` widens the regular-weight advances
 * box-size.ts measures to the 600 weight both names are set in; `BORDER` is
 * the bar's 3px left edge and 1.5px right one. */
export const ZONE_TEXT = {
  TITLE_PX: 11,
  LABEL_PX: 12,
  CHIP_PX: 10,
  BOLD: 1.08,
  PAD_X: 10,
  PAD_Y: 8,
  BORDER: 4.5,
  LINE: 14,
  CHIP_H: 16,
  CHIP_SIDES: 14,
  CHIP_GAP: 4,
  CHIPS_OFF: 8,
  /** the room between a bar and a name drawn beside it (styles.css) */
  OUTSIDE_GAP: 6,
} as const;

/** cards per roster row when the plan has no dated range to measure a width
 * against (nothing to wrap by, so wrap by count instead) */
const ROSTER_WRAP_COUNT = 6;

// One derivation per (model, plane), shared with core's team view (planView),
// which runs on every fold and edit: core owns the cache so both read one graph.
export { planGraphCached };

/** x of a day's left edge, relative to the origin day (1 January of the
 * earliest year): coordinates stay put while editing and jump only when the
 * plan grows into an earlier year. `dayWidth` is the view's px per day: no
 * default, so no caller can draw at 20 while the view stretches. */
export const planX = (day: number, origin: number, dayWidth: number): number => (day - origin) * dayWidth;

/** A saved x (kept in `PLAN_LAYOUT.DAY` units, so a box keeps its day at any
 * width) as drawn at `dayWidth`. */
const scaledX = (x: number, dayWidth: number): number => (x * dayWidth) / PLAN_LAYOUT.DAY;

/** x of the chart's first day: where the roster and the strays line up. The
 * origin is 1 January, so a plan opening in November would otherwise leave
 * them most of a year's canvas to the left of the bars. 0 with nothing dated. */
export const chartLeft = (run: PlanRun): number =>
  run.range !== undefined ? planX(run.range.start, run.origin, run.day) : 0;

/** One plan arrangement under way: what it reads, and the maps every step fills. */
export interface PlanRun {
  graph: PlanGraph;
  /** the origin day: 1 January of the earliest year */
  origin: number;
  /** px per day, as the view draws it */
  day: number;
  /** the dates drawn: the whole plan's, or those of the zone opened on its own */
  range: PlanSpan | undefined;
  /** a drilled view's stubs: stub id → the real node outside the opened zone */
  stubs: ReadonlyMap<string, string>;
  /** the opened zone, when the view is one zone's interior */
  root: string | undefined;
  /** an opened zone's children → its interior origin (LayoutResult.savedFrame) */
  savedFrame: Map<string, Point>;
  /** what the VIEW shows (layers can hide what the plane's containment holds) */
  shown: ReadonlySet<string>;
  /** what the view shows folded: drawn as a bar, its rows hidden */
  collapsed: ReadonlySet<string>;
  positions: Record<string, Point> | undefined;
  sizeHints: ReadonlyMap<string, BoxSize> | undefined;
  byId: ReadonlyMap<string, DiagramNode>;
  /** the model id a canvas id stands for: a lane copy's zone, else itself */
  realOf: (id: string) => string;
  /** a zone's rows, events and free-form children by canvas id: a lane copy's
   * are its view children (only its own lane's rows), any other zone's the
   * plan graph's — which `shown` then filters, as a fold or a layer hides them */
  kidsOf: (id: string) => PlanChildren;
  /** the role chips per zone, which share a zone's title line */
  chips: ReadonlyMap<string, NodeChip[]>;
  /** the roster's "also in" notes, which widen their cards */
  alsoIn: ReadonlyMap<string, readonly string[]> | undefined;
  geometry: Map<string, NodeGeometry>;
  fixed: Set<string>;
  lockedX: Set<string>;
  /** top-level zone → dy, view only (LayoutResult.viewShift) */
  viewShift: Map<string, number>;
}

const NO_KIDS: PlanChildren = { zones: [], events: [], others: [] };

function planRun(input: NotationLayoutInput): PlanRun {
  const { view, model, plane, sizeHints, positions, root, dayWidth } = input;
  const graph = planGraphCached(model, plane);
  const stubs = view.externals ?? new Map<string, string>();
  const copies = view.copies ?? new Map<string, string>();
  const shown = new Set<string>();
  const collapsed = new Set<string>();
  const walk = (n: ViewNode): void => {
    shown.add(n.id);
    if (n.state === 'collapsed') collapsed.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  const copyKids = viewKids(view);
  return {
    graph,
    origin: graph.origin ?? 0,
    day: dayWidth ?? PLAN_LAYOUT.DAY,
    range: root === undefined ? graph.range : (planSubtreeRange(graph, model, root) ?? graph.range),
    stubs,
    root,
    savedFrame: new Map(),
    shown,
    collapsed,
    positions,
    sizeHints,
    // a stub is in the drilled view, not the model, and so is a lane header:
    // each is looked up like any node
    byId: new Map([
      ...model.nodes.map((n) => [n.id, n] as const),
      ...view.roots
        .filter((r) => stubs.has(r.id) || r.node.type === PLAN_LANE_TYPE || r.node.type === PLAN_UNASSIGNED_TYPE)
        .map((r) => [r.id, r.node] as const),
    ]),
    realOf: (id) => copies.get(id) ?? id,
    kidsOf: (id) => copyKids.get(id) ?? graph.children.get(id) ?? NO_KIDS,
    chips: planChips(model, plane, input.hidden),
    alsoIn: input.alsoIn,
    geometry: new Map(),
    fixed: new Set(),
    lockedX: new Set(),
    viewShift: new Map(),
  };
}

// a copy is measured like its zone until the canvas has measured it itself
const hint = (run: PlanRun, id: string): BoxSize =>
  run.sizeHints?.get(id) ?? run.sizeHints?.get(run.realOf(id)) ?? LEAF_SIZE;

/** short/long labels per role — the chip's `O`/`E`/`C` initial and the role
 * chip menu's item text (see RoleChipMenu). */
export const ROLE_LABEL: Record<PlanRole, { initial: string; title: string }> = {
  owns: { initial: 'O', title: 'Owner' },
  executes: { initial: 'E', title: 'Executor' },
  checks: { initial: 'C', title: 'Checker' },
};

/** Role chips per zone, in owns / executes / checks order: `O·Alice` (first
 * word of the name), titled `Owner: Alice Ng`, in the actor's colour. Reads
 * the relation's `from` node whatever its type — a person or a team, alike.
 * The badge row draws them (the notation's `chips`); the layout measures
 * them, since they share a line with the zone's name. A `hidden` actor has
 * none: hidden means out of the picture, and the name row is measured
 * without it. */
export function planChips(
  model: DiagramModel,
  plane: string | undefined,
  hidden?: ReadonlySet<string>,
): ReadonlyMap<string, NodeChip[]> {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, NodeChip[]>();
  for (const id of planGraphCached(model, plane).zones) {
    const roles = rolesOf(model, id);
    const chips: NodeChip[] = [];
    for (const role of PLAN_ROLES) {
      for (const actorId of roles[role]) {
        const actor = byId.get(actorId);
        if (actor === undefined || hidden?.has(actorId) === true) continue;
        const first = actor.name.trim().split(/\s+/)[0] ?? actor.id;
        chips.push({
          role,
          refId: actorId,
          text: `${ROLE_LABEL[role].initial}·${first}`,
          title: `${ROLE_LABEL[role].title}: ${actor.name}`,
          color: actor.color,
        });
      }
    }
    if (chips.length > 0) out.set(id, chips);
  }
  return out;
}

/** the chip row's width, with its offset from the name; 0 without chips */
function chipsWidth(chips: readonly NodeChip[] | undefined): number {
  if (chips === undefined || chips.length === 0) return 0;
  const { CHIP_PX, CHIP_SIDES, CHIP_GAP, CHIPS_OFF } = ZONE_TEXT;
  const each = chips.reduce((w, c) => w + textWidth(c.text, CHIP_PX) + CHIP_SIDES, 0);
  return CHIPS_OFF + each + CHIP_GAP * (chips.length - 1);
}

/** a name and its chips on one line, as a bar's row draws them */
export const nameRowWidth = (name: string, chips: readonly NodeChip[] | undefined): number =>
  textWidth(name, ZONE_TEXT.LABEL_PX) * ZONE_TEXT.BOLD + chipsWidth(chips);

/**
 * How far down a zone with rows starts its first one: the title band. A name
 * that fits beside its chips takes the usual TITLE_H; one that does not wraps
 * (the header wraps, styles.css), with the chips on a line of their own below
 * it — and a first row at the fixed TITLE_H would then be drawn over the
 * title. A short zone with a long name is exactly the case: its width is its
 * dates, not its text.
 */
function titleBand(name: string, chips: readonly NodeChip[] | undefined, width: number): number {
  const { TITLE_PX, BOLD, PAD_X, PAD_Y, BORDER, LINE, CHIP_H, CHIP_GAP } = ZONE_TEXT;
  const room = width - 2 * PAD_X - BORDER;
  const chipW = chipsWidth(chips);
  if (textWidth(name, TITLE_PX) * BOLD + chipW <= room) return PLAN_LAYOUT.TITLE_H;
  const lines = wrapText(name, room, TITLE_PX * BOLD).length;
  const text = lines * LINE + (chipW > 0 ? CHIP_GAP + CHIP_H : 0);
  // TITLE_H is the padded one-line header plus the gap above the first row
  const gap = PLAN_LAYOUT.TITLE_H - (2 * PAD_Y + CHIP_H);
  return Math.max(PLAN_LAYOUT.TITLE_H, 2 * PAD_Y + text + gap);
}

const nodeOf = (run: PlanRun, id: string): DiagramNode => run.byId.get(run.realOf(id))!;

/** Where a zone's bar begins. `spanOf` gives up on a reversed or malformed
 * span — a validation finding (`plan-span`, `plan-date`) the save reports —
 * but the raw `start` is usually still a real date, and falling back to the
 * ORIGIN would teleport the bar to 1 January on the keystroke that made End
 * precede Start, dragging every nested zone and event with it. The layout's
 * job here is to leave the bar where the user can see and fix it. */
const anchorOf = (run: PlanRun, n: DiagramNode): number => spanOf(n)?.start ?? dayOf(n.metadata?.start) ?? run.origin;
export const startOf = (run: PlanRun, id: string): number => anchorOf(run, nodeOf(run, id));
export const byStart = (run: PlanRun, ids: readonly string[]): string[] =>
  ids.filter((id) => run.shown.has(id)).sort((a, b) => startOf(run, a) - startOf(run, b));

/** lays out a zone's interior (children parent-relative) and returns its size */
export function layZone(run: PlanRun, id: string): BoxSize {
  const { BAR_H, TITLE_H, PAD, ROW_GAP, EVENT } = PLAN_LAYOUT;
  const { geometry, fixed, day: DAY } = run;
  const span = spanOf(nodeOf(run, id));
  const start = anchorOf(run, nodeOf(run, id));
  const width = span === undefined ? DAY : (span.end - span.start + 1) * DAY;
  const kids = run.kidsOf(id);
  const zones = byStart(run, kids.zones);
  const others = kids.others.filter((c) => run.shown.has(c));
  const events = kids.events.filter((c) => run.shown.has(c));
  if (zones.length + others.length + events.length === 0) return { width, height: BAR_H };
  const band = titleBand(nodeOf(run, id).name, run.chips.get(run.realOf(id)), width);
  let y = band;
  for (const c of zones) {
    const size = layZone(run, c);
    geometry.set(c, { x: (startOf(run, c) - start) * DAY, y, ...size });
    fixed.add(c);
    y += size.height + ROW_GAP;
  }
  // An "other" with a saved position (a plain box, a note, a borrowed C4
  // container the author dragged inside the bar) draws there
  // instead of flowing — clamped so it can never sit outside the bar it
  // belongs to (a since-shrunk zone, a stale drag) — and takes no flow slot.
  // Nothing else in `others` reads `positions`: a zone or event is never
  // free-form, and neither is a person (positions never even reaches those).
  // A lane copy's child sits where the real one was saved.
  let posBottom: number | undefined;
  const flowed: string[] = [];
  for (const c of others) {
    const pos = run.positions?.[run.realOf(c)];
    if (pos === undefined) {
      flowed.push(c);
      continue;
    }
    const size = hint(run, c);
    const cx = Math.min(Math.max(scaledX(pos.x, DAY), 0), Math.max(0, width - size.width));
    const cy = Math.max(pos.y, band);
    geometry.set(c, { x: cx, y: cy, ...size });
    fixed.add(c);
    posBottom = Math.max(posBottom ?? 0, cy + size.height);
  }
  // the remaining "others" flow left to right inside the padding, wrapping
  // like text, as though the positioned ones were not there
  let x = PAD;
  let rowH = 0;
  for (const c of flowed) {
    const size = hint(run, c);
    if (x > PAD && x + size.width > width - PAD) {
      x = PAD;
      y += rowH + ROW_GAP;
      rowH = 0;
    }
    geometry.set(c, { x, y, ...size });
    fixed.add(c);
    x += size.width + ROW_GAP;
    rowH = Math.max(rowH, size.height);
  }
  if (flowed.length > 0) y += rowH + ROW_GAP;
  for (const c of events) {
    const at = atOf(nodeOf(run, c)) ?? start;
    geometry.set(c, {
      x: (at - start) * DAY + DAY / 2 - EVENT / 2,
      y: (TITLE_H - EVENT) / 2,
      width: EVENT,
      height: EVENT,
    });
    fixed.add(c);
  }
  // `y` carries a trailing ROW_GAP after the last row; the bottom PAD
  // replaces it. A positioned "other" can stand lower than the flow (or be
  // the zone's only content) — the bar covers whichever bottom is greater.
  const flowHeight = zones.length + flowed.length === 0 ? band : y - ROW_GAP + PAD;
  const height = posBottom === undefined ? flowHeight : Math.max(flowHeight, posBottom + PAD);
  return { width, height };
}

/** Everything the plan graph puts under `id` — rows, events, borrowed nodes — at any depth. */
function graphSubtree(run: PlanRun, id: string): string[] {
  const kids = run.graph.children.get(id);
  if (kids === undefined) return [];
  return [...kids.events, ...kids.others, ...kids.zones.flatMap((z) => [z, ...graphSubtree(run, z)])];
}

/** How much shorter the folds inside top-level zone `id` (or of `id` itself)
 * made it: its height with every folded subtree shown again, less `height`.
 * Only what a fold hid comes back — a row a layer hides stays hidden — so a
 * layer toggle still moves nothing it did not move before. */
function foldedAway(run: PlanRun, id: string, height: number): number {
  const folds = planSubtree(run.graph, id).filter((z) => run.collapsed.has(z));
  if (folds.length === 0) return 0;
  const shown = new Set(run.shown);
  for (const z of folds) for (const c of graphSubtree(run, z)) shown.add(c);
  return layZone({ ...run, shown, geometry: new Map(), fixed: new Set() }, id).height - height;
}

/** The top-level zones, one row each in start order; returns the y below them.
 * The arranged y is where each zone sits with every fold OPEN — stacked by open
 * heights, or its saved y — so whatever a move records while something is
 * folded is a position that still holds once it opens. The gap a fold leaves is
 * closed in the view only (`viewShift`, which a committed move takes back off):
 * each zone moves up by what the folds wholly above it gave back. A zone beside
 * a folded one — sharing its lane, a little lower — is not below it, and stays
 * put rather than rising into the header. */
export function placeRootZones(run: PlanRun, roots: readonly string[]): number {
  const rootZones = byStart(
    run,
    roots.filter((id) => isPlanZone(nodeOf(run, id))),
  );
  let y = 0;
  let away = 0;
  const rows: { id: string; y: number; openBottom: number; away: number }[] = [];
  for (const id of rootZones) {
    const size = layZone(run, id);
    const gave = foldedAway(run, id, size.height);
    run.geometry.set(id, { x: planX(startOf(run, id), run.origin, run.day), y, ...size });
    run.lockedX.add(id);
    const top = run.positions?.[id]?.y ?? y;
    rows.push({ id, y: top, openBottom: top + size.height + gave, away: gave });
    y += size.height + gave + PLAN_LAYOUT.ROW_GAP;
    away += gave;
  }
  for (const row of rows) {
    const dy = rows.reduce((sum, above) => (above.openBottom <= row.y ? sum + above.away : sum), 0);
    if (dy > 0) run.viewShift.set(row.id, -dy);
  }
  // the strays park under the zones as drawn, every gap closed
  return y - away;
}

/** A period is a bracket in the header over its days, on the line the root
 * events sit on: it is a stretch of the calendar, not a row of work. */
function placePeriods(run: PlanRun, roots: readonly string[]): void {
  const { EVENT, WEEK_H, DAY_H } = PLAN_LAYOUT;
  const DAY = run.day;
  for (const id of roots) {
    if (!isPlanPeriod(nodeOf(run, id))) continue;
    const span = periodSpanOf(nodeOf(run, id));
    const start = span?.start ?? run.origin;
    run.geometry.set(id, {
      x: planX(start, run.origin, DAY),
      y: -(DAY_H + WEEK_H) - EVENT / 2,
      width: span === undefined ? DAY : (span.end - span.start + 1) * DAY,
      height: EVENT,
    });
    run.fixed.add(id);
  }
}

/** A top-level event sits in the time-axis header, on its day. */
function placeRootEvents(run: PlanRun, roots: readonly string[]): void {
  const { EVENT, WEEK_H, DAY_H } = PLAN_LAYOUT;
  const DAY = run.day;
  for (const id of roots) {
    if (!isPlanEvent(nodeOf(run, id))) continue;
    const at = atOf(nodeOf(run, id)) ?? run.origin;
    run.geometry.set(id, {
      x: planX(at, run.origin, DAY) + DAY / 2 - EVENT / 2,
      // on the line between the month and week bands: in the day band it
      // would sit on the day numbers, and in the week band's middle the
      // diamond and its name cover the W## label of every week they cross
      y: -(DAY_H + WEEK_H) - EVENT / 2,
      width: EVENT,
      height: EVENT,
    });
    run.fixed.add(id);
  }
}

/**
 * The roster: actors (people or teams) with roles first, then every other
 * actor root; a strip above the header, not a picture, so neither axis is
 * the overlay's. Cards run left to right from the chart's first day (not
 * the origin, which can be months earlier) and wrap into a
 * further row when the next one would cross the plan's width (an actor's
 * own date range has no bearing here, so the width the CHART draws is the
 * only ruler there is; with nothing dated yet, wrap by count instead). Rows
 * then stack UPWARD from the header, so adding a row pushes the strip
 * further from the chart rather than pushing the chart down.
 */
function placeRoster(run: PlanRun, roots: readonly string[], order: (ids: string[]) => string[]): void {
  const { ROW_GAP, HEADER_H, ROSTER_GAP } = PLAN_LAYOUT;
  const rootSet = new Set(roots);
  const actors = [...run.graph.actors, ...roots.filter((id) => isPlanActor(nodeOf(run, id)))].filter(
    (id, i, all) => rootSet.has(id) && all.indexOf(id) === i,
  );
  // the Unassigned card is no actor: it always closes the roster
  const roster = [...order(actors), ...(rootSet.has(PLAN_UNASSIGNED) ? [PLAN_UNASSIGNED] : [])];
  const rosterWidth = run.range !== undefined ? (run.range.end + 1 - run.range.start) * run.day : undefined;
  const left = chartLeft(run);
  const rosterRows: { id: string; size: BoxSize }[][] = [];
  let rosterRow: { id: string; size: BoxSize }[] = [];
  let rowRight = 0;
  for (const id of roster) {
    const size = rosterCardSize(run.byId.get(id), hint(run, id), run.alsoIn?.get(id));
    const overflows =
      rosterWidth !== undefined ? rowRight + size.width > rosterWidth : rosterRow.length >= ROSTER_WRAP_COUNT;
    if (rosterRow.length > 0 && overflows) {
      rosterRows.push(rosterRow);
      rosterRow = [];
      rowRight = 0;
    }
    rosterRow.push({ id, size });
    rowRight += size.width + ROSTER_GAP;
  }
  if (rosterRow.length > 0) rosterRows.push(rosterRow);
  // laid out from the last row up, so each earlier row's y falls out of the
  // row already placed below it
  let rowTop: number | undefined;
  for (let i = rosterRows.length - 1; i >= 0; i--) {
    const r = rosterRows[i]!;
    const rowH = Math.max(...r.map((c) => c.size.height));
    const rowY = rowTop === undefined ? -HEADER_H - ROSTER_GAP - rowH : rowTop - ROW_GAP - rowH;
    let rx = left;
    for (const c of r) {
      run.geometry.set(c.id, { x: rx, y: rowY, ...c.size });
      run.fixed.add(c.id);
      rx += c.size.width + ROSTER_GAP;
    }
    rowTop = rowY;
  }
}

/**
 * A zone opened on its own: its interior laid out exactly as inside the zone
 * (`layZone` — rows, free-form children at their saved spots, clamps and all),
 * then moved to where the zone starts, its title band left out. Every child of
 * the zone is drawn by that one offset, its `savedFrame`, so whatever an edit
 * there records — a moved box, a resized row — is the same position it would
 * record in the whole plan. The zone's own events go to the header, where a
 * top-level event goes. Returns the y below the interior.
 */
function placeOpenedZone(run: PlanRun, root: string, roots: readonly string[]): number {
  const node = nodeOf(run, root);
  const span = spanOf(node);
  const width = span === undefined ? run.day : (span.end - span.start + 1) * run.day;
  const size = layZone(run, root);
  const frame = {
    x: planX(startOf(run, root), run.origin, run.day),
    y: -titleBand(node.name, run.chips.get(root), width),
  };
  for (const id of roots) {
    const g = run.geometry.get(id);
    if (g === undefined || run.graph.parent.get(id) !== root) continue;
    run.geometry.set(id, { ...g, x: g.x + frame.x, y: g.y + frame.y });
    run.savedFrame.set(id, frame);
  }
  placeRootEvents(run, roots);
  return size.height + frame.y + PLAN_LAYOUT.ROW_GAP;
}

/**
 * A zone opened on its own keeps the dependencies that cross its edge: their
 * outside end is a stub (scopeToRoot), drawn as a marker at the left edge of
 * the dates when the node it stands for ends before them, at the right
 * otherwise, stacked down from the top on each side. A stub has no dates of its
 * own — laid out as a zone it would land on 1 January. Actor stubs are the
 * roster's (placeRoster), so they are placed by then.
 */
function placeStubs(run: PlanRun, roots: readonly string[]): void {
  const { ROW_GAP, ROSTER_GAP } = PLAN_LAYOUT;
  const { range } = run;
  if (range === undefined) return; // nothing dated: they park as strays
  let left = 0;
  let right = 0;
  for (const id of roots) {
    const real = run.stubs.get(id);
    if (real === undefined || run.geometry.has(id)) continue;
    const node = run.byId.get(real);
    const ends = node === undefined ? undefined : (spanOf(node)?.end ?? atOf(node));
    const size = hint(run, id);
    const before = ends !== undefined && ends < range.start;
    const x = before
      ? planX(range.start, run.origin, run.day) - ROSTER_GAP - size.width
      : planX(range.end + 1, run.origin, run.day) + ROSTER_GAP;
    run.geometry.set(id, { x, y: before ? left : right, ...size });
    run.fixed.add(id);
    if (before) left += size.height + ROW_GAP;
    else right += size.height + ROW_GAP;
  }
}

/** Strays (a shared node with no zone) park under the zones at `y`, from the
 * chart's first day, as git-graph's spare row. One dropped somewhere is moved
 * there by the overlay pass, which scales its saved x to the day width
 * (useViewLayout's drawnAt), so it keeps its day. */
function placeStrays(run: PlanRun, roots: readonly string[], y: number): void {
  let sx = chartLeft(run);
  for (const id of roots) {
    if (run.geometry.has(id)) continue;
    const size = hint(run, id);
    run.geometry.set(id, { x: sx, y, ...size });
    sx += size.width + PLAN_LAYOUT.ROW_GAP;
  }
}

/**
 * The plan arrangement, in place of elk. x is a date, always; y is automatic
 * inside a zone (rows) and free for a top-level zone (the overlay's y wins —
 * see LayoutResult.lockedX). Everything but a top-level zone or a stray is
 * `fixed`: a nested zone, an event and a flowed "other" so a stale overlay
 * position can never pull a row out of its zone, and a POSITIONED "other" too
 * — there the layout itself reads and clamps the saved spot (see `layZone`),
 * so `fixed` instead keeps the generic overlay pass from re-applying the raw,
 * unclamped value on top.
 */
export function planLayout(input: NotationLayoutInput): LayoutResult {
  const run = planRun(input);
  const roots = input.view.roots.map((r) => r.id);
  // a stub keeps its stand-in's type, but not its dates: never a row or a header event
  const own = roots.filter((id) => !run.stubs.has(id));
  const opened = run.root !== undefined && run.byId.has(run.root) && isPlanZone(nodeOf(run, run.root));
  const lanes = input.view.lanes;
  const y = opened
    ? placeOpenedZone(run, run.root!, own)
    : lanes !== undefined
      ? placeLanes(run, lanes)
      : placeRootZones(run, own);
  if (!opened) placeRootEvents(run, own);
  placePeriods(run, own);
  placeRoster(run, roots, rosterOrder(input.model, input.view.lanes !== undefined));
  placeStubs(run, roots);
  placeStrays(run, roots, y);
  return {
    geometry: run.geometry,
    routes: new Map(),
    labelSpots: new Map(),
    algorithm: PLAN_NOTATION,
    fixed: run.fixed,
    lockedX: run.lockedX,
    ...(run.viewShift.size > 0 ? { viewShift: run.viewShift } : {}),
    ...(run.savedFrame.size > 0 ? { savedFrame: run.savedFrame } : {}),
  };
}
