import {
  LEAF_SIZE,
  PLAN_TEAM_TYPE,
  teamsOf,
  isPlanEvent,
  isPlanZone,
  type CompiledView,
  type DiagramModel,
  type PlanChildren,
  type PlanViewLane,
  type ViewNode,
} from '@diagc/core/internal';
import { PLAN_LAYOUT, byStart, chartLeft, layZone, placeRootZones, planX, startOf, type PlanRun } from './plan-layout';

// A plan grouped into team lanes (core's planView): each top-level zone is a
// copy per lane it appears in, and the chart is a stack of lanes. The copies
// keep their zone's dates, so x is untouched; only the vertical order is the
// lanes'. Everything here is view state — nothing a lane places is saved.

/** Each lane copy's rows, events and free-form children, from the view tree:
 * a copy in lane L holds only the rows that appear in L, which the plan graph
 * (one entry per real zone) cannot say. Empty for an ungrouped view. */
export function viewKids(view: CompiledView): ReadonlyMap<string, PlanChildren> {
  const out = new Map<string, PlanChildren>();
  const copies = view.copies;
  if (copies === undefined) return out;
  const walk = (n: ViewNode): void => {
    if (copies.has(n.id) && isPlanZone(n.node)) {
      const split: PlanChildren = { zones: [], events: [], others: [] };
      for (const c of n.children) {
        const into = isPlanZone(c.node) ? split.zones : isPlanEvent(c.node) ? split.events : split.others;
        into.push(c.id);
      }
      out.set(n.id, split);
    }
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return out;
}

/**
 * Where each real top-level zone would stand in the ungrouped chart: its saved
 * y, else the y it stacks to. A lane orders its copies by it, so a bar dragged
 * below another ungrouped stays below it in every lane they share. Worked out
 * on the real zones, with what the copies show mapped back to them — a row any
 * lane keeps is a row the ungrouped chart shows.
 */
function ungroupedTops(run: PlanRun, lanes: readonly PlanViewLane[]): ReadonlyMap<string, number> {
  const real = [...new Set(lanes.flatMap((l) => l.zones.map(run.realOf)))];
  const scratch: PlanRun = {
    ...run,
    realOf: (id) => id,
    kidsOf: (id) => run.graph.children.get(id) ?? { zones: [], events: [], others: [] },
    shown: new Set([...run.shown].map(run.realOf)),
    collapsed: new Set([...run.collapsed].map(run.realOf)),
    geometry: new Map(),
    fixed: new Set(),
    lockedX: new Set(),
    viewShift: new Map(),
  };
  placeRootZones(scratch, real);
  return new Map(real.map((id) => [id, run.positions?.[id]?.y ?? scratch.geometry.get(id)?.y ?? 0]));
}

/**
 * The lanes, top to bottom from y = 0 (the header band above keeps the
 * top-level events and periods): per lane a header row across the chart's
 * dated width from its first day, then that lane's copies, one row each, in
 * the ungrouped order. Every header and copy is `fixed` — no saved y applies
 * to a copy, since one zone has one saved y and several copies. Returns the y
 * below the last lane, where the strays park.
 */
export function placeLanes(run: PlanRun, lanes: readonly PlanViewLane[]): number {
  const { ROW_GAP, LANE_H } = PLAN_LAYOUT;
  const tops = ungroupedTops(run, lanes);
  const top = (id: string): number => tops.get(run.realOf(id)) ?? 0;
  const left = chartLeft(run);
  const width = run.range !== undefined ? (run.range.end + 1 - run.range.start) * run.day : LEAF_SIZE.width;
  let y = 0;
  for (const lane of lanes) {
    run.geometry.set(lane.id, { x: left, y, width, height: LANE_H });
    run.fixed.add(lane.id);
    y += LANE_H + ROW_GAP;
    // byStart first, as the ungrouped stack sorts, so equal tops keep its order
    for (const id of byStart(run, lane.zones).sort((a, b) => top(a) - top(b))) {
      const size = layZone(run, id);
      run.geometry.set(id, { x: planX(startOf(run, id), run.origin, run.day), y, ...size });
      run.fixed.add(id);
      y += size.height + ROW_GAP;
    }
  }
  return y;
}

/**
 * The roster's order. Ungrouped it is the order it arrives in (people and
 * teams with roles first, as ever). Grouped it follows the lanes: each team in
 * model order followed by its members, then the people in no team. A person
 * in several teams has one card, under the first of them in model order, and
 * the roster's own order holds among a team's members.
 */
export function rosterOrder(model: DiagramModel, grouped: boolean): (ids: string[]) => string[] {
  if (!grouped) return (ids) => ids;
  return (ids) => {
    const index = new Map(model.nodes.map((n, i) => [n.id, i] as const));
    const teamOf = (id: string): string | undefined =>
      teamsOf(model, id).sort((a, b) => index.get(a)! - index.get(b)!)[0];
    const isTeam = (id: string): boolean => model.nodes[index.get(id) ?? -1]?.type === PLAN_TEAM_TYPE;
    const teams = ids.filter(isTeam).sort((a, b) => index.get(a)! - index.get(b)!);
    const people = ids.filter((id) => !isTeam(id));
    return [
      ...teams.flatMap((t) => [t, ...people.filter((p) => teamOf(p) === t)]),
      ...people.filter((p) => teamOf(p) === undefined || !teams.includes(teamOf(p)!)),
    ];
  };
}
