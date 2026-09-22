import {
  PLAN_EVENT_TYPE,
  PLAN_ZONE_TYPE,
  atOf,
  dayOf,
  isPlanEvent,
  isPlanZone,
  isoOf,
  planGraph,
  planSubtree,
  spanOf,
  uniqueNodeId,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type PlanGraph,
  type PlanRole,
  type PlanSpan,
} from '@diagc/core';
import { PLAN_LAYOUT, planX } from '@diagc/renderer';

const { DAY } = PLAN_LAYOUT;
/** a fresh zone spans two weeks */
export const ZONE_DAYS = 14;

export interface MoveDelta {
  dx: number;
  dy: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const planeOpt = (plane: string | undefined) => (plane !== undefined ? { plane } : {});

/** a zone's parent span, when it is nested */
function parentSpan(g: PlanGraph, byId: Map<string, DiagramNode>, id: string): PlanSpan | undefined {
  const p = g.parent.get(id);
  return p === undefined ? undefined : spanOf(byId.get(p)!);
}

/** the tightest span the zone's own children need: earliest start/at .. latest end/at */
function childrenSpan(g: PlanGraph, byId: Map<string, DiagramNode>, id: string): PlanSpan | undefined {
  const kids = g.children.get(id);
  if (kids === undefined) return undefined;
  let out: PlanSpan | undefined;
  const widen = (s: PlanSpan): void => {
    out = out === undefined ? s : { start: Math.min(out.start, s.start), end: Math.max(out.end, s.end) };
  };
  for (const z of kids.zones) {
    const s = spanOf(byId.get(z)!);
    if (s !== undefined) widen(s);
  }
  for (const e of kids.events) {
    const at = atOf(byId.get(e)!);
    if (at !== undefined) widen({ start: at, end: at });
  }
  return out;
}

const shiftZone = (id: string, s: PlanSpan, days: number): EditorCommand => ({
  type: 'set-plan-dates',
  id,
  dates: { start: isoOf(s.start + days), end: isoOf(s.end + days) },
});
const shiftEvent = (id: string, at: number, days: number): EditorCommand => ({ type: 'set-plan-dates', id, dates: { at: isoOf(at + days) } });

/**
 * A drag on the plan plane, as dates. dx is the displacement from the ARRANGED
 * spot, so a zone moved by seven days' worth of pixels moves seven days
 * whatever its saved y was; a nested zone is clamped inside its parent, a
 * top-level one gets its derived x written back (the file then reads sanely)
 * and its y clamped below the header. People and borrowed nodes never move:
 * the roster is a list and a row is a row. Returns undefined when the gesture
 * changes nothing, so a no-op never reaches undo.
 */
export function planMoves(
  model: DiagramModel,
  plane: string | undefined,
  positions: Record<string, { x: number; y: number }>,
  deltas: Record<string, MoveDelta>,
): EditorCommand | undefined {
  const g = planGraph(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const origin = g.origin ?? 0;
  const out: EditorCommand[] = [];
  const shifted = new Set<string>();
  // parents before children (a child inside a moved parent's subtree is done);
  // a descending sort keeps gesture order among equals, where reverse() would not
  const ids = Object.keys(positions).sort((a, b) => planSubtree(g, b).length - planSubtree(g, a).length);
  for (const id of ids) {
    const node = byId.get(id);
    const pos = positions[id];
    const delta = deltas[id];
    if (node === undefined || pos === undefined || delta === undefined || shifted.has(id)) continue;
    const outer = parentSpan(g, byId, id);
    if (isPlanZone(node)) {
      const span = spanOf(node);
      if (span === undefined) continue;
      let days = Math.round(delta.dx / DAY);
      if (outer !== undefined) days = clamp(days, outer.start - span.start, outer.end - span.end);
      if (days !== 0) {
        for (const sub of planSubtree(g, id)) {
          const n = byId.get(sub)!;
          const s = spanOf(n);
          const at = atOf(n);
          if (s !== undefined) out.push(shiftZone(sub, s, days));
          else if (at !== undefined) out.push(shiftEvent(sub, at, days));
          shifted.add(sub);
        }
      }
      if (outer === undefined) {
        out.push({ type: 'set-position', nodeId: id, x: planX(span.start + days, origin), y: Math.max(0, pos.y), ...planeOpt(plane) });
      }
    } else if (isPlanEvent(node)) {
      const at = atOf(node);
      if (at === undefined) continue;
      let days = Math.round(delta.dx / DAY);
      if (outer !== undefined) days = clamp(days, outer.start - at, outer.end - at);
      if (days !== 0) out.push(shiftEvent(id, at, days));
    }
  }
  return out.length === 0 ? undefined : { type: 'batch', commands: out };
}

/**
 * A resize on the plan plane, as dates. The left handle moves `start` (the
 * node's origin moved: x is parent-relative for a nested zone, absolute for a
 * root); otherwise the right handle moved and `end` follows the width. Both
 * are clamped to the parent's span and the children's, so a gesture can never
 * produce a `plan-*` error. No size is ever saved for a zone.
 */
export function planResize(model: DiagramModel, plane: string | undefined, id: string, x: number, w: number): EditorCommand | undefined {
  const g = planGraph(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const node = byId.get(id);
  if (node === undefined || !isPlanZone(node)) return undefined;
  const span = spanOf(node);
  if (span === undefined) return undefined;
  const outer = parentSpan(g, byId, id);
  const inner = childrenSpan(g, byId, id);
  const base = outer?.start ?? g.origin ?? 0;
  const newStart = base + Math.round(x / DAY);
  if (newStart !== span.start) {
    const start = clamp(newStart, outer?.start ?? -Infinity, Math.min(inner?.start ?? span.end, span.end));
    return start === span.start ? undefined : { type: 'set-plan-dates', id, dates: { start: isoOf(start) } };
  }
  const newEnd = span.start + Math.round(w / DAY) - 1;
  const end = clamp(newEnd, Math.max(inner?.end ?? span.start, span.start), outer?.end ?? Infinity);
  return end === span.end ? undefined : { type: 'set-plan-dates', id, dates: { end: isoOf(end) } };
}

function selectedZone(model: DiagramModel, selected: string | undefined): DiagramNode | undefined {
  const n = selected === undefined ? undefined : model.nodes.find((x) => x.id === selected);
  return n !== undefined && isPlanZone(n) ? n : undefined;
}

export function addZone(model: DiagramModel, plane: string | undefined, opts: { selected?: string; today: string }): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, 'zone');
  const parent = selectedZone(model, opts.selected);
  const outer = parent === undefined ? undefined : spanOf(parent);
  const start = outer?.start ?? dayOf(opts.today)!;
  const end = Math.min(start + ZONE_DAYS - 1, outer?.end ?? Infinity);
  return {
    id,
    command: {
      type: 'add-node',
      node: { id, name: 'Zone', type: PLAN_ZONE_TYPE, ...planeOpt(plane), metadata: { start: isoOf(start), end: isoOf(end) } },
      ...(parent !== undefined ? { parent: { id: parent.id, ...planeOpt(plane) } } : {}),
    },
  };
}

export function addEvent(model: DiagramModel, plane: string | undefined, opts: { selected?: string; today: string }): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, 'event');
  const parent = selectedZone(model, opts.selected);
  const outer = parent === undefined ? undefined : spanOf(parent);
  const today = dayOf(opts.today)!;
  const at = outer === undefined ? today : clamp(today, outer.start, outer.end);
  return {
    id,
    command: {
      type: 'add-node',
      node: { id, name: 'Event', type: PLAN_EVENT_TYPE, ...planeOpt(plane), metadata: { at: isoOf(at) } },
      ...(parent !== undefined ? { parent: { id: parent.id, ...planeOpt(plane) } } : {}),
    },
  };
}

export function addPerson(model: DiagramModel, plane: string | undefined, name: string): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, name);
  return { id, command: { type: 'add-node', node: { id, name, type: 'person', ...planeOpt(plane) } } };
}

/** The panel offers one person per role per zone (the model allows more, from
 * TypeScript): setting a role replaces whatever held it. */
export function setRole(model: DiagramModel, zoneId: string, role: PlanRole, personId: string | null): EditorCommand {
  const commands: EditorCommand[] = model.relations
    .filter((r) => r.to === zoneId && r.kind === role)
    .map((r) => ({ type: 'delete-relation' as const, id: r.id }));
  if (personId !== null) commands.push({ type: 'add-relation', from: personId, to: zoneId, opts: { kind: role } });
  return { type: 'batch', commands };
}

/** Dates for a zone or event the library places: under the pointer when the
 * drop point is known and the plan has an origin, at the parent's start when
 * dropped on a zone, else today. */
export function seedDates(
  model: DiagramModel,
  plane: string | undefined,
  type: string | undefined,
  at: { x?: number; parentId?: string },
  today: string,
): Record<string, string> | undefined {
  if (type !== PLAN_ZONE_TYPE && type !== PLAN_EVENT_TYPE) return undefined;
  const g = planGraph(model, plane);
  const parent = selectedZone(model, at.parentId);
  const outer = parent === undefined ? undefined : spanOf(parent);
  const day =
    outer !== undefined ? outer.start : at.x !== undefined && g.origin !== undefined ? g.origin + Math.floor(at.x / DAY) : dayOf(today)!;
  if (type === PLAN_EVENT_TYPE) return { at: isoOf(day) };
  return { start: isoOf(day), end: isoOf(Math.min(day + ZONE_DAYS - 1, outer?.end ?? Infinity)) };
}
