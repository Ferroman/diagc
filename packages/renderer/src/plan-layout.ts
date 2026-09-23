import {
  LEAF_SIZE,
  PLAN_PERSON_TYPE,
  atOf,
  dayOf,
  isPlanEvent,
  isPlanZone,
  planGraph,
  spanOf,
  type CompiledView,
  type DiagramModel,
  type DiagramNode,
  type PlanGraph,
  type ViewNode,
} from '@diagc/core';
import type { LayoutResult, NodeGeometry } from './layout';

/** The schedule's fixed geometry. `DAY` is the scale (px per calendar day);
 * the rest are the strip, row and column sizes every expectation derives from. */
export const PLAN_LAYOUT = {
  DAY: 20,
  BAR_H: 40,
  TITLE_H: 40,
  PAD: 12,
  ROW_GAP: 8,
  EVENT: 16,
  /** month band 22 + week band 22, above y = 0 */
  HEADER_H: 44,
  ROSTER_W: 180,
  ROSTER_GAP: 24,
} as const;

type Size = { width: number; height: number };

// Per (model, plane), as gitGraphCached: the layout, the header overlay and
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

/**
 * The plan arrangement, in place of elk. x is a date, always; y is automatic
 * inside a zone (rows) and free for a top-level zone (the overlay's y wins —
 * see LayoutResult.lockedX). Everything but a top-level zone or a stray is
 * `fixed`, so a stale overlay position can never pull a row out of its zone.
 */
export function planLayout(
  view: CompiledView,
  model: DiagramModel,
  plane: string | undefined,
  sizeHints?: ReadonlyMap<string, Size>,
): LayoutResult {
  const { DAY, BAR_H, TITLE_H, PAD, ROW_GAP, EVENT, HEADER_H, ROSTER_W, ROSTER_GAP } = PLAN_LAYOUT;
  const g = planGraphCached(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const origin = g.origin ?? 0;
  const geometry = new Map<string, NodeGeometry>();
  const fixed = new Set<string>();
  const lockedX = new Set<string>();

  // what the VIEW shows (layers can hide what the plane's containment holds)
  const shown = new Set<string>();
  const walk = (n: ViewNode): void => {
    shown.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  const hint = (id: string): Size => sizeHints?.get(id) ?? LEAF_SIZE;
  const node = (id: string): DiagramNode => byId.get(id)!;
  /** Where a zone's bar begins. `spanOf` gives up on a reversed or malformed
   * span — a validation finding (`plan-span`, `plan-date`) the save reports —
   * but the raw `start` is usually still a real date, and falling back to the
   * ORIGIN would teleport the bar to 1 January on the keystroke that made End
   * precede Start, dragging every nested zone and event with it. The layout's
   * job here is to leave the bar where the user can see and fix it. */
  const anchorOf = (n: DiagramNode): number => spanOf(n)?.start ?? dayOf(n.metadata?.start) ?? origin;
  const startOf = (id: string): number => anchorOf(node(id));
  const byStart = (ids: readonly string[]): string[] => ids.filter((id) => shown.has(id)).sort((a, b) => startOf(a) - startOf(b));

  /** lays out a zone's interior (children parent-relative) and returns its size */
  const layZone = (id: string): Size => {
    const span = spanOf(node(id));
    const start = anchorOf(node(id));
    const width = span === undefined ? DAY : (span.end - span.start + 1) * DAY;
    const kids = g.children.get(id) ?? { zones: [], events: [], others: [] };
    const zones = byStart(kids.zones);
    const others = kids.others.filter((c) => shown.has(c));
    const events = kids.events.filter((c) => shown.has(c));
    if (zones.length + others.length + events.length === 0) return { width, height: BAR_H };
    let y = TITLE_H;
    for (const c of zones) {
      const size = layZone(c);
      geometry.set(c, { x: (startOf(c) - start) * DAY, y, ...size });
      fixed.add(c);
      y += size.height + ROW_GAP;
    }
    // borrowed nodes flow left to right inside the padding, wrapping like text
    let x = PAD;
    let rowH = 0;
    for (const c of others) {
      const size = hint(c);
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
    if (others.length > 0) y += rowH + ROW_GAP;
    for (const c of events) {
      const at = atOf(node(c)) ?? start;
      geometry.set(c, { x: (at - start) * DAY + DAY / 2 - EVENT / 2, y: (TITLE_H - EVENT) / 2, width: EVENT, height: EVENT });
      fixed.add(c);
    }
    // `y` carries a trailing ROW_GAP after the last row; the bottom PAD replaces it
    const height = zones.length + others.length === 0 ? TITLE_H : y - ROW_GAP + PAD;
    return { width, height };
  };

  const roots = view.roots.map((r) => r.id);
  const rootZones = byStart(roots.filter((id) => isPlanZone(node(id))));
  let y = 0;
  for (const id of rootZones) {
    const size = layZone(id);
    geometry.set(id, { x: planX(startOf(id), origin), y, ...size });
    lockedX.add(id);
    y += size.height + ROW_GAP;
  }
  for (const id of roots) {
    if (!isPlanEvent(node(id))) continue;
    const at = atOf(node(id)) ?? origin;
    geometry.set(id, { x: planX(at, origin) + DAY / 2 - EVENT / 2, y: -HEADER_H / 2 - EVENT / 2, width: EVENT, height: EVENT });
    fixed.add(id);
  }
  // the roster: people with roles first, then every other person root; a
  // list, not a picture, so neither axis is the overlay's
  const rootSet = new Set(roots);
  const roster = [...g.people, ...roots.filter((id) => node(id).type === PLAN_PERSON_TYPE)].filter((id, i, all) => rootSet.has(id) && all.indexOf(id) === i);
  let ry = 0;
  for (const id of roster) {
    const size = hint(id);
    geometry.set(id, { x: -(ROSTER_W + ROSTER_GAP), y: ry, ...size });
    fixed.add(id);
    ry += size.height + ROW_GAP;
  }
  // strays (a shared node with no zone) park under the zones, as git-graph's spare row
  let sx = 0;
  for (const id of roots) {
    if (geometry.has(id)) continue;
    const size = hint(id);
    geometry.set(id, { x: sx, y, ...size });
    sx += size.width + ROW_GAP;
  }
  return { geometry, routes: new Map(), labelSpots: new Map(), algorithm: 'plan', fixed, lockedX };
}
