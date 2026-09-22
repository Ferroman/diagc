import { isIsoDate } from './dates';
import type { DiagramModel, DiagramNode } from './types';
import { buildHierarchy } from './view/hierarchy';

/** The notation id a plane (or the model) declares to be drawn as a schedule:
 * a calendar left to right, zones as bars, events as diamonds, people as a
 * roster. Pure — the renderer and the studio derive everything from here. */
export const PLAN_NOTATION = 'plan' as const;
/** A zone is a CONTAINER with a span: nesting is containment, and whatever
 * sits inside a zone is scheduled in it. */
export const PLAN_ZONE_TYPE = 'plan-zone' as const;
export const PLAN_EVENT_TYPE = 'plan-event' as const;
export const PLAN_TYPES: ReadonlySet<string> = new Set([PLAN_ZONE_TYPE, PLAN_EVENT_TYPE]);
export const isPlanZone = (n: DiagramNode): boolean => n.type === PLAN_ZONE_TYPE;
export const isPlanEvent = (n: DiagramNode): boolean => n.type === PLAN_EVENT_TYPE;

/** People attach to a zone through a RELATION of one of these kinds, person →
 * zone, never through containment — so one person is on many zones. */
export const PLAN_ROLES = ['owns', 'executes', 'checks'] as const;
export type PlanRole = (typeof PLAN_ROLES)[number];
export const isPlanRole = (k: string): k is PlanRole => (PLAN_ROLES as readonly string[]).includes(k);

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 (UTC) for a real `YYYY-MM-DD`; undefined otherwise.
 * Whole days, parsed as UTC, so the reader's timezone never shifts a bar. */
export function dayOf(iso: unknown): number | undefined {
  if (!isIsoDate(iso)) return undefined;
  return Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY;
}

/** The inverse of dayOf. */
export function isoOf(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Inclusive day numbers. */
export interface PlanSpan {
  start: number;
  end: number;
}

/** A zone's span, or undefined when the node is not a zone or its dates are
 * missing, malformed or reversed — each of those is a validation finding
 * (`plan-missing`, `plan-date`, `plan-span`); here it just means "nothing to
 * draw". */
export function spanOf(n: DiagramNode): PlanSpan | undefined {
  if (!isPlanZone(n)) return undefined;
  const start = dayOf(n.metadata?.start);
  const end = dayOf(n.metadata?.end);
  return start === undefined || end === undefined || end < start ? undefined : { start, end };
}

/** An event's day, or undefined when the node is not an event or `at` is
 * missing or malformed. */
export function atOf(n: DiagramNode): number | undefined {
  return isPlanEvent(n) ? dayOf(n.metadata?.at) : undefined;
}

export interface PlanRoles {
  owns: string[];
  executes: string[];
  checks: string[];
}

/** People per role for one zone, from the role relations that point INTO it,
 * in declaration order. */
export function rolesOf(model: DiagramModel, zoneId: string): PlanRoles {
  const roles: PlanRoles = { owns: [], executes: [], checks: [] };
  for (const r of model.relations) {
    if (r.to === zoneId && isPlanRole(r.kind)) roles[r.kind].push(r.from);
  }
  return roles;
}

export interface PlanChildren {
  zones: string[];
  events: string[];
  others: string[];
}

export interface PlanGraph {
  /** zone ids in declaration order (visible on the plane) */
  zones: string[];
  events: string[];
  /** every node with a role relation into a visible zone, declaration order, deduplicated */
  people: string[];
  /** zone/event/borrowed node → its zone parent on the plan plane */
  parent: ReadonlyMap<string, string>;
  /** zone → direct children on the plan plane, split by what they are */
  children: ReadonlyMap<string, PlanChildren>;
  /** earliest start/at and latest end/at over the whole graph; undefined when nothing is dated */
  range?: PlanSpan;
  /** 1 January of range.start's year — the x origin of the drawing */
  origin?: number;
}

/**
 * The plan plane's structure, derived through buildHierarchy so `containmentOf`
 * and `hides` behave exactly as the view does. A zone's children are its
 * DIRECT children on the plane; `parent` picks each child's first parent by
 * containment-EDGE declaration order — `h.parentsOf` already preserves that
 * order (the same rule `boundaryOf` uses) — filtered to the parents that are
 * zones, since a DAG child can have non-zone parents on the plane too.
 */
export function planGraph(model: DiagramModel, plane?: string): PlanGraph {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const h = buildHierarchy(model, plane);
  // buildHierarchy seeds parentsOf (to []) for every visible node, so this is
  // exactly "is this node visible on the plane", including shared nodes with
  // no containment there (they surface as roots, not as absent).
  const visible = (id: string): boolean => h.parentsOf.has(id);
  const zones: string[] = [];
  const events: string[] = [];
  for (const n of model.nodes) {
    if (!visible(n.id)) continue;
    if (isPlanZone(n)) zones.push(n.id);
    else if (isPlanEvent(n)) events.push(n.id);
  }
  const zoneSet = new Set(zones);
  const children = new Map<string, PlanChildren>();
  for (const z of zones) {
    const split: PlanChildren = { zones: [], events: [], others: [] };
    for (const c of h.childrenOf.get(z) ?? []) {
      const node = byId.get(c);
      if (node === undefined) continue;
      if (isPlanZone(node)) split.zones.push(c);
      else if (isPlanEvent(node)) split.events.push(c);
      else split.others.push(c);
    }
    children.set(z, split);
  }
  const parent = new Map<string, string>();
  for (const [id, parents] of h.parentsOf) {
    const zoneParent = parents.find((p) => zoneSet.has(p));
    if (zoneParent !== undefined) parent.set(id, zoneParent);
  }
  const people: string[] = [];
  for (const r of model.relations) {
    if (isPlanRole(r.kind) && zoneSet.has(r.to) && !people.includes(r.from) && byId.has(r.from)) people.push(r.from);
  }
  let range: PlanSpan | undefined;
  const widen = (start: number, end: number): void => {
    range = range === undefined ? { start, end } : { start: Math.min(range.start, start), end: Math.max(range.end, end) };
  };
  for (const z of zones) {
    const s = spanOf(byId.get(z)!);
    if (s !== undefined) widen(s.start, s.end);
  }
  for (const e of events) {
    const at = atOf(byId.get(e)!);
    if (at !== undefined) widen(at, at);
  }
  const origin = range === undefined ? undefined : dayOf(`${isoOf(range.start).slice(0, 4)}-01-01`);
  return { zones, events, people, parent, children, ...(range !== undefined ? { range } : {}), ...(origin !== undefined ? { origin } : {}) };
}

/** `id` plus every descendant zone and event, pre-order — what moves with a
 * zone. Borrowed nodes are not listed: their place is their row. */
export function planSubtree(g: PlanGraph, id: string): string[] {
  const out: string[] = [id];
  const walk = (z: string): void => {
    const c = g.children.get(z);
    if (c === undefined) return;
    for (const child of c.zones) {
      out.push(child);
      walk(child);
    }
    out.push(...c.events);
  };
  walk(id);
  return out;
}
