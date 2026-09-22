import { isIsoDate } from './dates';
import type { DiagramModel, DiagramNode } from './types';

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
