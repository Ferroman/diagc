import type { DiagramModel, DiagramNode } from '../../types';
import { defined } from '../../util';
import { PLAN_MEMBER_OF, PLAN_TEAM_TYPE, rolesOf, spanOf, type PlanGraph, type PlanSpan } from './plan';

/** The Unassigned group's key, in lanes and in hidden sets. Not a node id: a
 * double-underscore key cannot collide with an authored one. */
export const PLAN_UNASSIGNED = '__unassigned__' as const;

export interface PlanLane {
  key: string;
  name: string;
  color?: string;
  kind: 'team' | 'person' | 'unassigned';
}

export interface PlanTeams {
  /** lanes with visible work, in lane order */
  lanes: readonly PlanLane[];
  /** zone id -> visible lane keys (subtree union), in lane order; absent = hidden */
  laneKeysOf: ReadonlyMap<string, readonly string[]>;
  /** zones hiding removes: nothing that would place them is visible */
  hiddenZones: ReadonlySet<string>;
  /** a zone's OWN visible effective groups (no subtree union), in lane order —
   * what the tint asks, since a zone is "that lane's" by its own groups */
  effectiveOf: ReadonlyMap<string, readonly string[]>;
  /** some zone is unassigned in the FULL model, even while Unassigned is
   * hidden — so a roster can still offer the card to bring it back */
  hasUnassigned: boolean;
}

/** A group a zone belongs to and the actor it came through, so hiding a person
 * can remove exactly the groups that person brought. */
interface Group {
  key: string;
  via: string;
}

/** The teams a person belongs to: the team-typed targets of their `member-of`
 * relations, in relation order, once each. */
export function teamsOf(model: DiagramModel, personId: string): string[] {
  const teams = new Set(model.nodes.filter((n) => n.type === PLAN_TEAM_TYPE).map((n) => n.id));
  const out: string[] = [];
  for (const r of model.relations) {
    if (r.from === personId && r.kind === PLAN_MEMBER_OF && teams.has(r.to) && !out.includes(r.to)) out.push(r.to);
  }
  return out;
}

/** A zone's own groups, from its executors only: a team gives itself; a person
 * gives each of their teams, or themself when they are in none. */
function ownGroups(model: DiagramModel, byId: ReadonlyMap<string, DiagramNode>, zoneId: string): Group[] {
  const out: Group[] = [];
  for (const id of rolesOf(model, zoneId).executes) {
    const node = byId.get(id);
    if (node === undefined) continue;
    if (node.type === PLAN_TEAM_TYPE) {
      out.push({ key: id, via: id });
      continue;
    }
    const teams = teamsOf(model, id);
    for (const key of teams.length > 0 ? teams : [id]) out.push({ key, via: id });
  }
  return out;
}

/** Does any zone below `zoneId` have own groups? */
function ownBelow(graph: PlanGraph, own: ReadonlyMap<string, Group[]>, zoneId: string): boolean {
  return (graph.children.get(zoneId)?.zones ?? []).some(
    (c) => (own.get(c)?.length ?? 0) > 0 || ownBelow(graph, own, c),
  );
}

/** Effective groups on the FULL model: own, else the nearest ancestor's own,
 * else Unassigned — but only when nothing below the zone is placed either.
 * A zone with placed work inside it is a pure container: its lanes come from
 * that work, so it has no group of its own (else every project would also
 * sit in Unassigned). Hiding is applied afterwards, so it never re-places. */
function effectiveGroups(graph: PlanGraph, own: ReadonlyMap<string, Group[]>, zoneId: string): Group[] {
  const seen = new Set<string>();
  for (let z: string | undefined = zoneId; z !== undefined && !seen.has(z); z = graph.parent.get(z)) {
    seen.add(z);
    const g = own.get(z);
    if (g !== undefined && g.length > 0) return g;
  }
  return ownBelow(graph, own, zoneId) ? [] : [{ key: PLAN_UNASSIGNED, via: PLAN_UNASSIGNED }];
}

/** Lane order: team nodes in model order, then every other (person) node in
 * model order, then Unassigned. */
function laneOrder(model: DiagramModel): Map<string, number> {
  const ids = [
    ...model.nodes.filter((n) => n.type === PLAN_TEAM_TYPE),
    ...model.nodes.filter((n) => n.type !== PLAN_TEAM_TYPE),
  ].map((n) => n.id);
  return new Map([...ids, PLAN_UNASSIGNED].map((k, i) => [k, i] as const));
}

function laneOf(byId: ReadonlyMap<string, DiagramNode>, key: string): PlanLane {
  if (key === PLAN_UNASSIGNED) return { key, name: 'Unassigned', kind: 'unassigned' };
  const node = byId.get(key)!;
  return {
    key,
    name: node.name || key,
    kind: node.type === PLAN_TEAM_TYPE ? 'team' : 'person',
    ...defined({ color: node.color }),
  };
}

/** Everything the layout needs to place zones in team lanes. Pure; memoise per
 * (model, plane, hidden set) at the call site. */
export function planTeams(model: DiagramModel, graph: PlanGraph, hidden: ReadonlySet<string>): PlanTeams {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const order = laneOrder(model);
  const rank = (k: string): number => order.get(k) ?? Number.MAX_SAFE_INTEGER;
  const own = new Map<string, Group[]>();
  for (const z of graph.zones) own.set(z, ownGroups(model, byId, z));

  let hasUnassigned = false;
  const effectiveOf = new Map<string, string[]>();
  for (const z of graph.zones) {
    const full = effectiveGroups(graph, own, z);
    if (full.some((g) => g.key === PLAN_UNASSIGNED)) hasUnassigned = true;
    const keys = [...new Set(full.filter((g) => !hidden.has(g.key) && !hidden.has(g.via)).map((g) => g.key))];
    effectiveOf.set(
      z,
      keys.sort((a, b) => rank(a) - rank(b)),
    );
  }

  const laneKeysOf = new Map<string, readonly string[]>();
  const hiddenZones = new Set<string>();
  const union = (z: string): Set<string> => {
    const keys = new Set(effectiveOf.get(z) ?? []);
    for (const c of graph.children.get(z)?.zones ?? []) for (const k of union(c)) keys.add(k);
    const sorted = [...keys].sort((a, b) => rank(a) - rank(b));
    if (sorted.length === 0) hiddenZones.add(z);
    else laneKeysOf.set(z, sorted);
    return keys;
  };
  for (const z of graph.zones) if (!graph.parent.has(z)) union(z);

  const used = new Set([...laneKeysOf.values()].flat());
  const lanes = [...used].sort((a, b) => rank(a) - rank(b)).map((k) => laneOf(byId, k));
  return { lanes, laneKeysOf, hiddenZones, effectiveOf, hasUnassigned };
}

/** The days a zone's copy in `lane` is tinted: the whole bar when the zone's
 * own visible groups include the lane, else the merged spans of the zones
 * below it that do. Overlapping and adjacent spans merge into one stripe. */
export interface PlanTintInput {
  model: DiagramModel;
  graph: PlanGraph;
  teams: PlanTeams;
}

export function planTint({ model, graph, teams }: PlanTintInput, zoneId: string, lane: string): PlanSpan[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const inLane = (z: string): boolean => teams.effectiveOf.get(z)?.includes(lane) === true;
  const spanFor = (z: string): PlanSpan | undefined => {
    const node = byId.get(z);
    return node === undefined ? undefined : spanOf(node);
  };
  if (inLane(zoneId)) {
    const own = spanFor(zoneId);
    return own === undefined ? [] : [own];
  }
  const spans: PlanSpan[] = [];
  const walk = (z: string): void => {
    for (const c of graph.children.get(z)?.zones ?? []) {
      const s = inLane(c) ? spanFor(c) : undefined;
      if (s !== undefined) spans.push(s);
      walk(c);
    }
  };
  walk(zoneId);
  spans.sort((a, b) => a.start - b.start);
  const merged: PlanSpan[] = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (last !== undefined && s.start <= last.end + 1) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}
