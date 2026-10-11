import {
  LEAF_SIZE,
  atOf,
  dayOf,
  isPlanActor,
  isPlanEvent,
  isPlanZone,
  PLAN_NOTATION,
  planGraph,
  spanOf,
  type BoxSize,
  type DiagramModel,
  type DiagramNode,
  type PlanGraph,
  type Point,
  type ViewNode,
} from '@diagc/core/internal';
import type { LayoutResult, NodeGeometry, NotationLayoutInput } from './layout';

/** The schedule's fixed geometry. `DAY` is the scale (px per calendar day);
 * the rest are the strip, row and column sizes every expectation derives from.
 * `ROSTER_GAP` is both the roster's horizontal card spacing and the vertical
 * gap between its last row and the header; `ROW_GAP` (shared with a zone's own
 * child rows) spaces the roster's rows from each other. */
export const PLAN_LAYOUT = {
  DAY: 20,
  BAR_H: 40,
  TITLE_H: 40,
  PAD: 12,
  ROW_GAP: 8,
  EVENT: 16,
  /** month band 22 + week band 22, above y = 0 */
  HEADER_H: 44,
  ROSTER_GAP: 24,
} as const;

/** cards per roster row when the plan has no dated range to measure a width
 * against (nothing to wrap by, so wrap by count instead) */
const ROSTER_WRAP_COUNT = 6;

// Per (model, plane), as gitGraphCached: the layout, the time-axis header and
// the chips all read the graph, and each model identity is one derivation.
const graphCache = new WeakMap<DiagramModel, Map<string | undefined, PlanGraph>>();
export function planGraphCached(model: DiagramModel, plane: string | undefined): PlanGraph {
  let byPlane = graphCache.get(model);
  if (byPlane === undefined) {
    byPlane = new Map();
    graphCache.set(model, byPlane);
  }
  let g = byPlane.get(plane);
  if (g === undefined) {
    g = planGraph(model, plane);
    byPlane.set(plane, g);
  }
  return g;
}

/** x of a day's left edge, relative to the origin day (1 January of the
 * earliest year): coordinates stay put while editing and jump only when the
 * plan grows into an earlier year. */
export const planX = (day: number, origin: number): number => (day - origin) * PLAN_LAYOUT.DAY;

/** One plan arrangement under way: what it reads, and the maps every step fills. */
interface PlanRun {
  graph: PlanGraph;
  /** the origin day: 1 January of the earliest year */
  origin: number;
  /** what the VIEW shows (layers can hide what the plane's containment holds) */
  shown: ReadonlySet<string>;
  positions: Record<string, Point> | undefined;
  sizeHints: ReadonlyMap<string, BoxSize> | undefined;
  byId: ReadonlyMap<string, DiagramNode>;
  geometry: Map<string, NodeGeometry>;
  fixed: Set<string>;
  lockedX: Set<string>;
}

function planRun({ view, model, plane, sizeHints, positions }: NotationLayoutInput): PlanRun {
  const graph = planGraphCached(model, plane);
  const shown = new Set<string>();
  const walk = (n: ViewNode): void => {
    shown.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return {
    graph,
    origin: graph.origin ?? 0,
    shown,
    positions,
    sizeHints,
    byId: new Map(model.nodes.map((n) => [n.id, n] as const)),
    geometry: new Map(),
    fixed: new Set(),
    lockedX: new Set(),
  };
}

const hint = (run: PlanRun, id: string): BoxSize => run.sizeHints?.get(id) ?? LEAF_SIZE;
const nodeOf = (run: PlanRun, id: string): DiagramNode => run.byId.get(id)!;

/** Where a zone's bar begins. `spanOf` gives up on a reversed or malformed
 * span — a validation finding (`plan-span`, `plan-date`) the save reports —
 * but the raw `start` is usually still a real date, and falling back to the
 * ORIGIN would teleport the bar to 1 January on the keystroke that made End
 * precede Start, dragging every nested zone and event with it. The layout's
 * job here is to leave the bar where the user can see and fix it. */
const anchorOf = (run: PlanRun, n: DiagramNode): number => spanOf(n)?.start ?? dayOf(n.metadata?.start) ?? run.origin;
const startOf = (run: PlanRun, id: string): number => anchorOf(run, nodeOf(run, id));
const byStart = (run: PlanRun, ids: readonly string[]): string[] =>
  ids.filter((id) => run.shown.has(id)).sort((a, b) => startOf(run, a) - startOf(run, b));

/** lays out a zone's interior (children parent-relative) and returns its size */
function layZone(run: PlanRun, id: string): BoxSize {
  const { DAY, BAR_H, TITLE_H, PAD, ROW_GAP, EVENT } = PLAN_LAYOUT;
  const { geometry, fixed } = run;
  const span = spanOf(nodeOf(run, id));
  const start = anchorOf(run, nodeOf(run, id));
  const width = span === undefined ? DAY : (span.end - span.start + 1) * DAY;
  const kids = run.graph.children.get(id) ?? { zones: [], events: [], others: [] };
  const zones = byStart(run, kids.zones);
  const others = kids.others.filter((c) => run.shown.has(c));
  const events = kids.events.filter((c) => run.shown.has(c));
  if (zones.length + others.length + events.length === 0) return { width, height: BAR_H };
  let y = TITLE_H;
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
  let posBottom: number | undefined;
  const flowed: string[] = [];
  for (const c of others) {
    const pos = run.positions?.[c];
    if (pos === undefined) {
      flowed.push(c);
      continue;
    }
    const size = hint(run, c);
    const cx = Math.min(Math.max(pos.x, 0), Math.max(0, width - size.width));
    const cy = Math.max(pos.y, TITLE_H);
    geometry.set(c, { x: cx, y: cy, ...size });
    fixed.add(c);
    posBottom = Math.max(posBottom ?? 0, cy + size.height);
  }
  // the remaining "others" flow left to right inside the padding, wrapping
  // like text, around any positioned ones
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
  const flowHeight = zones.length + flowed.length === 0 ? TITLE_H : y - ROW_GAP + PAD;
  const height = posBottom === undefined ? flowHeight : Math.max(flowHeight, posBottom + PAD);
  return { width, height };
}

/** The top-level zones, one row each in start order; returns the y below them. */
function placeRootZones(run: PlanRun, roots: readonly string[]): number {
  const rootZones = byStart(
    run,
    roots.filter((id) => isPlanZone(nodeOf(run, id))),
  );
  let y = 0;
  for (const id of rootZones) {
    const size = layZone(run, id);
    run.geometry.set(id, { x: planX(startOf(run, id), run.origin), y, ...size });
    run.lockedX.add(id);
    y += size.height + PLAN_LAYOUT.ROW_GAP;
  }
  return y;
}

/** A top-level event sits in the time-axis header, on its day. */
function placeRootEvents(run: PlanRun, roots: readonly string[]): void {
  const { DAY, EVENT, HEADER_H } = PLAN_LAYOUT;
  for (const id of roots) {
    if (!isPlanEvent(nodeOf(run, id))) continue;
    const at = atOf(nodeOf(run, id)) ?? run.origin;
    run.geometry.set(id, {
      x: planX(at, run.origin) + DAY / 2 - EVENT / 2,
      y: -HEADER_H / 2 - EVENT / 2,
      width: EVENT,
      height: EVENT,
    });
    run.fixed.add(id);
  }
}

/**
 * The roster: actors (people or teams) with roles first, then every other
 * actor root; a strip above the header, not a picture, so neither axis is
 * the overlay's. Cards run left to right from the origin and wrap into a
 * further row when the next one would cross the plan's width (an actor's
 * own date range has no bearing here, so the width the CHART draws is the
 * only ruler there is; with nothing dated yet, wrap by count instead). Rows
 * then stack UPWARD from the header, so adding a row pushes the strip
 * further from the chart rather than pushing the chart down.
 */
function placeRoster(run: PlanRun, roots: readonly string[]): void {
  const { ROW_GAP, HEADER_H, ROSTER_GAP } = PLAN_LAYOUT;
  const rootSet = new Set(roots);
  const roster = [...run.graph.actors, ...roots.filter((id) => isPlanActor(nodeOf(run, id)))].filter(
    (id, i, all) => rootSet.has(id) && all.indexOf(id) === i,
  );
  const rosterWidth = run.graph.range !== undefined ? planX(run.graph.range.end + 1, run.origin) : undefined;
  const rosterRows: { id: string; size: BoxSize }[][] = [];
  let rosterRow: { id: string; size: BoxSize }[] = [];
  let rowRight = 0;
  for (const id of roster) {
    const size = hint(run, id);
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
    let rx = 0;
    for (const c of r) {
      run.geometry.set(c.id, { x: rx, y: rowY, ...c.size });
      run.fixed.add(c.id);
      rx += c.size.width + ROSTER_GAP;
    }
    rowTop = rowY;
  }
}

/** Strays (a shared node with no zone) park under the zones at `y`, as
 * git-graph's spare row. */
function placeStrays(run: PlanRun, roots: readonly string[], y: number): void {
  let sx = 0;
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
  const y = placeRootZones(run, roots);
  placeRootEvents(run, roots);
  placeRoster(run, roots);
  placeStrays(run, roots, y);
  return {
    geometry: run.geometry,
    routes: new Map(),
    labelSpots: new Map(),
    algorithm: PLAN_NOTATION,
    fixed: run.fixed,
    lockedX: run.lockedX,
  };
}
