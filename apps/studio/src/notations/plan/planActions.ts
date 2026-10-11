import {
  PLAN_EVENT_TYPE,
  PLAN_PERSON_TYPE,
  PLAN_TEAM_TYPE,
  PLAN_ZONE_TYPE,
  atOf,
  buildHierarchy,
  dayOf,
  defined,
  isPlanActor,
  isPlanEvent,
  isPlanRole,
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
  type Point,
} from '@diagc/core/internal';
import { PLAN_LAYOUT, planX } from '@diagc/renderer';

const { DAY, TITLE_H } = PLAN_LAYOUT;
/** a fresh zone spans two weeks */
export const ZONE_DAYS = 14;

export interface MoveDelta {
  dx: number;
  dy: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const planeOpt = (plane: string | undefined) => defined({ plane });
/** The plane a quick-added node is tagged with: the active plane, unless it borrows
 * another's containment. The view matches a node's `plane` against the plane whose
 * containment it reads, so a node tagged with the borrowing plane's own id would show
 * on no canvas; it is added shared instead, as createNodeAt adds one. Its containment
 * edge keeps the active plane, which core resolves to the donor (canonicalPlane). */
const nodePlaneOpt = (model: DiagramModel, plane: string | undefined) =>
  planeOpt(model.planes.find((p) => p.id === plane)?.containmentOf === undefined ? plane : undefined);

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
const shiftEvent = (id: string, at: number, days: number): EditorCommand => ({
  type: 'set-plan-dates',
  id,
  dates: { at: isoOf(at + days) },
});

/** The plan plane an action works on, and the host's date (YYYY-MM-DD): where
 * a date with no other anchor lands. */
export interface PlanContext {
  model: DiagramModel;
  plane: string | undefined;
  today: string;
}

/** What a gesture on the plan plane works on; none lands on today. */
export type PlanPlane = Pick<PlanContext, 'model' | 'plane'>;

/** The plane's arrangement, read once per gesture. */
interface MoveScene {
  g: PlanGraph;
  byId: Map<string, DiagramNode>;
  /** the day x = 0 stands for */
  origin: number;
  plane: string | undefined;
}

/** One node of the gesture: where it was let go, how far it went, and its parent zone's span. */
interface Move {
  id: string;
  node: DiagramNode;
  pos: Point;
  delta: MoveDelta;
  outer: PlanSpan | undefined;
}

/** A zone with no usable span yet: the drop itself supplies two weeks of dates
 * at `pos.x`, clamped into the parent's span when nested; a root zone still
 * gets the position it would normally get, so its y sticks. */
function datelessZoneMove({ g, origin, plane }: MoveScene, { id, pos, outer }: Move): EditorCommand[] {
  const base = outer?.start ?? origin;
  let start = base + Math.round(pos.x / DAY);
  let end = start + ZONE_DAYS - 1;
  if (outer !== undefined) {
    start = clamp(start, outer.start, outer.end);
    end = clamp(end, outer.start, outer.end);
  }
  const out: EditorCommand[] = [{ type: 'set-plan-dates', id, dates: { start: isoOf(start), end: isoOf(end) } }];
  if (!g.parent.has(id)) {
    out.push({
      type: 'set-position',
      nodeId: id,
      x: planX(start, origin),
      y: Math.max(0, pos.y),
      ...planeOpt(plane),
    });
  }
  return out;
}

/** Every zone and event in `id`'s subtree shifted by `days`, each marked as moved. */
function shiftSubtree({ g, byId }: MoveScene, id: string, days: number, shifted: Set<string>): EditorCommand[] {
  const out: EditorCommand[] = [];
  for (const sub of planSubtree(g, id)) {
    const n = byId.get(sub)!;
    const s = spanOf(n);
    const at = atOf(n);
    if (s !== undefined) out.push(shiftZone(sub, s, days));
    else if (at !== undefined) out.push(shiftEvent(sub, at, days));
    shifted.add(sub);
  }
  return out;
}

/** A zone moved by whole days with its subtree, clamped inside its parent; a
 * root zone also gets its derived x written back and its y clamped below the header. */
function zoneMove(scene: MoveScene, move: Move, shifted: Set<string>): EditorCommand[] {
  const span = spanOf(move.node);
  if (span === undefined) return datelessZoneMove(scene, move);
  const { g, origin, plane } = scene;
  const { id, pos, delta, outer } = move;
  const out: EditorCommand[] = [];
  let days = Math.round(delta.dx / DAY);
  if (outer !== undefined) days = clamp(days, outer.start - span.start, outer.end - span.end);
  if (days !== 0) out.push(...shiftSubtree(scene, id, days, shifted));
  // "is this top-level" comes from the GRAPH, not from `outer === undefined`:
  // a nested zone whose parent's dates are unusable has no parent SPAN
  // either, and writing it a position only litters the layout file with a
  // coordinate the arrangement overrides anyway.
  if (!g.parent.has(id)) {
    out.push({
      type: 'set-position',
      nodeId: id,
      x: planX(span.start + days, origin),
      y: Math.max(0, pos.y),
      ...planeOpt(plane),
    });
  }
  return out;
}

/** An event moved by whole days, clamped inside its zone. */
function eventMove({ id, node, delta, outer }: Move): EditorCommand[] {
  const at = atOf(node);
  if (at === undefined) return [];
  let days = Math.round(delta.dx / DAY);
  if (outer !== undefined) days = clamp(days, outer.start - at, outer.end - at);
  return days !== 0 ? [shiftEvent(id, at, days)] : [];
}

/**
 * Any other node keeps the spot it was dropped on. Two cases share this. A
 * stray — a node the plane shows that no zone holds — is unclamped: planLayout
 * parks it under the chart and deliberately leaves it loose, so its drop is the
 * only statement of where it goes; without this the box snapped back. A zone's
 * "other" child (free-form placement — see planLayout) IS clamped, the same
 * floor the layout clamps its saved position by on read — `g.parent.has(id)` is
 * what tells the two apart, the same test the zone move uses.
 */
function freeMove({ g, plane }: MoveScene, { id, pos }: Move): EditorCommand {
  const nested = g.parent.has(id);
  return {
    type: 'set-position',
    nodeId: id,
    x: nested ? Math.max(0, pos.x) : pos.x,
    y: nested ? Math.max(TITLE_H, pos.y) : pos.y,
    ...planeOpt(plane),
  };
}

/**
 * A drag on the plan plane, as dates. dx is the displacement from the ARRANGED
 * spot, so a zone moved by seven days' worth of pixels moves seven days
 * whatever its saved y was; a nested zone is clamped inside its parent, a
 * top-level one gets its derived x written back (the file then reads sanely)
 * and its y clamped below the header. A zone with no usable span yet (just
 * retyped, or mid-edit) is not skipped either: the drop itself supplies dates
 * — two weeks (`ZONE_DAYS`, the same default `addZone` gives a fresh one from
 * the panel) anchored at `pos.x`, clamped into the parent's span when nested —
 * and a root zone still gets the `set-position` it would normally get, so its
 * y sticks. People never move: the roster is a list, and a person is refused
 * outright here (planLayout also marks it `fixed`, so no gesture reaches it
 * anyway). Any other node — a stray, or a zone's "other" child — keeps its
 * drop point, clamped to the layout's floor when nested (see freeMove).
 * Returns undefined when the gesture changes nothing, so a no-op never reaches
 * undo.
 */
export function planMoves(
  model: DiagramModel,
  plane: string | undefined,
  positions: Record<string, Point>,
  deltas: Record<string, MoveDelta>,
): EditorCommand | undefined {
  const g = planGraph(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const scene: MoveScene = { g, byId, origin: g.origin ?? 0, plane };
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
    const move: Move = { id, node, pos, delta, outer: parentSpan(g, byId, id) };
    if (isPlanZone(node)) out.push(...zoneMove(scene, move, shifted));
    else if (isPlanEvent(node)) out.push(...eventMove(move));
    // An actor is excluded HERE, not left to the layout's `fixed` set: the
    // roster is a list, and "an actor never moves" is this function's own
    // contract, not a fact it borrows from whoever arranged the canvas.
    else if (!isPlanActor(node)) out.push(freeMove(scene, move));
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
export function planResize({ model, plane }: PlanPlane, id: string, x: number, w: number): EditorCommand | undefined {
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

export function addZone(
  model: DiagramModel,
  plane: string | undefined,
  opts: { selected?: string; today: string },
): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, 'zone');
  const parent = selectedZone(model, opts.selected);
  const outer = parent === undefined ? undefined : spanOf(parent);
  const start = outer?.start ?? dayOf(opts.today)!;
  const end = Math.min(start + ZONE_DAYS - 1, outer?.end ?? Infinity);
  return {
    id,
    command: {
      type: 'add-node',
      node: {
        id,
        name: 'Zone',
        type: PLAN_ZONE_TYPE,
        ...nodePlaneOpt(model, plane),
        metadata: { start: isoOf(start), end: isoOf(end) },
      },
      ...(parent !== undefined ? { parent: { id: parent.id, ...planeOpt(plane) } } : {}),
    },
  };
}

export function addEvent(
  model: DiagramModel,
  plane: string | undefined,
  opts: { selected?: string; today: string },
): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, 'event');
  const parent = selectedZone(model, opts.selected);
  const outer = parent === undefined ? undefined : spanOf(parent);
  const today = dayOf(opts.today)!;
  const at = outer === undefined ? today : clamp(today, outer.start, outer.end);
  return {
    id,
    command: {
      type: 'add-node',
      node: { id, name: 'Event', type: PLAN_EVENT_TYPE, ...nodePlaneOpt(model, plane), metadata: { at: isoOf(at) } },
      ...(parent !== undefined ? { parent: { id: parent.id, ...planeOpt(plane) } } : {}),
    },
  };
}

/** An actor to hand roles to — a person or a team, the panel's two "Add"
 * buttons sharing one command shape. */
export function addActor(
  model: DiagramModel,
  plane: string | undefined,
  type: typeof PLAN_PERSON_TYPE | typeof PLAN_TEAM_TYPE,
  name: string,
): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, name);
  return { id, command: { type: 'add-node', node: { id, name, type, ...nodePlaneOpt(model, plane) } } };
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

/**
 * The role chip menu's choice, as one command (see EditingApi.onSetRole): the
 * actor's role relations on `zoneId` — there is normally one, but the model
 * lets more accumulate — all become `role`, kept in place: the first is
 * PATCHED to it (`update-relation`, `kind`) so its id and any other fields
 * survive, and every extra is deleted. `role: null` deletes them all instead.
 * Two or more commands land in one `batch` (one undo step); a single command
 * comes back bare, the same contract `assign`/`setRole` keep. Undefined when
 * the actor holds no role on the zone at all, or holds exactly one relation
 * already at `role` — nothing a command could change.
 */
export function setActorRole(
  model: DiagramModel,
  zoneId: string,
  actorId: string,
  role: PlanRole | null,
): EditorCommand | undefined {
  const held = model.relations.filter((r) => r.from === actorId && r.to === zoneId && isPlanRole(r.kind));
  if (held.length === 0) return undefined;
  if (role !== null && held.length === 1 && held[0]!.kind === role) return undefined;
  const [first, ...rest] = held;
  const commands: EditorCommand[] = [
    role === null
      ? { type: 'delete-relation', id: first!.id }
      : { type: 'update-relation', id: first!.id, patch: { kind: role } },
    ...rest.map((r): EditorCommand => ({ type: 'delete-relation', id: r.id })),
  ];
  return commands.length === 1 ? commands[0]! : { type: 'batch', commands };
}

/** `id`'s current containment parents on `plane` — the raw edges, whatever
 * each parent's own type is (a zone or not), read the same way planGraph
 * reads the plane's hierarchy (buildHierarchy resolves plane-borrowing the
 * same way). A DAG child can have more than one — plan-layout hosts it under
 * only the FIRST, by buildHierarchy's own declaration-edge order (the same
 * tie-break planGraph's own `parent` map uses for its zone-only view of the
 * same edges), but every one of them is a real containment edge that must be
 * dropped on re-home, or a stale earlier parent would keep hosting the node
 * alongside its new zone. */
function currentParents(model: DiagramModel, plane: string | undefined, id: string): string[] {
  return buildHierarchy(model, plane).parentsOf.get(id) ?? [];
}

/**
 * A drop on a zone (see EditingApi.onDropInto). An actor gains an `executes`
 * role on the zone — nothing else changes, the roster is a list — unless it
 * already holds ANY role there, in which case the drop is a no-op. Any other
 * node is re-homed under the zone on this plane and placed where it was let
 * go, clamped to the same floor planLayout clamps a free-form child by
 * (x ≥ 0, y ≥ TITLE_H) — every containment edge it had on this plane is
 * removed first, not just the one plan-layout was hosting it under, so a DAG
 * child never keeps a stale second parent after the move. A zone or an event
 * is never assigned: their drag is the date move, and DiagramView never
 * reports them here — refused again HERE so this function's contract does
 * not depend on who called it. Returns undefined when nothing would change.
 * `plane` is the studio's own active plane — possibly undefined, when the
 * viewer is on the default one — passed straight through to the
 * remove-containment/add-containment commands below; core resolves it
 * (canonicalPlane, and addContainment/removeContainment compare with
 * isOnPlane), so this function does not need to know
 * whether the plan happens to be the first-declared (default) plane or not.
 */
export function assign({ model, plane }: PlanPlane, id: string, zoneId: string, rel: Point): EditorCommand | undefined {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const node = byId.get(id);
  const zone = byId.get(zoneId);
  if (node === undefined || zone === undefined || !isPlanZone(zone) || isPlanZone(node) || isPlanEvent(node))
    return undefined;
  if (isPlanActor(node)) {
    if (model.relations.some((r) => r.from === id && r.to === zoneId && isPlanRole(r.kind))) return undefined;
    return { type: 'add-relation', from: id, to: zoneId, opts: { kind: 'executes' } };
  }
  const parents = currentParents(model, plane, id);
  if (parents.includes(zoneId)) return undefined;
  const commands: EditorCommand[] = [];
  for (const parent of parents) commands.push({ type: 'remove-containment', parent, child: id, ...planeOpt(plane) });
  commands.push({ type: 'add-containment', parent: zoneId, child: id, ...planeOpt(plane) });
  commands.push({
    type: 'set-position',
    nodeId: id,
    x: Math.max(0, rel.x),
    y: Math.max(TITLE_H, rel.y),
    ...planeOpt(plane),
  });
  return { type: 'batch', commands };
}

/** Dates for a zone or event the library places: under the pointer when the
 * drop point is known and the plan has an origin, at the parent's start when
 * dropped on a zone, else today. */
export function seedDates(
  { model, plane, today }: PlanContext,
  type: string | undefined,
  at: { x?: number; parentId?: string },
): Record<string, string> | undefined {
  if (type !== PLAN_ZONE_TYPE && type !== PLAN_EVENT_TYPE) return undefined;
  const g = planGraph(model, plane);
  const parent = selectedZone(model, at.parentId);
  const outer = parent === undefined ? undefined : spanOf(parent);
  const day =
    outer !== undefined
      ? outer.start
      : at.x !== undefined && g.origin !== undefined
        ? g.origin + Math.floor(at.x / DAY)
        : dayOf(today)!;
  if (type === PLAN_EVENT_TYPE) return { at: isoOf(day) };
  return { start: isoOf(day), end: isoOf(Math.min(day + ZONE_DAYS - 1, outer?.end ?? Infinity)) };
}

/**
 * A node that BECOMES a plan-zone/plan-event (Properties → Type, or a library
 * card applied to the selection) has no drop point to anchor on — only
 * whatever containment it already has. Reuses seedDates with that existing
 * containment's zone (planGraph's `parent`, keyed off the node's CURRENT
 * containment on `plane`, unaffected by the retype) as the anchor, so a node
 * already nested under a zone seeds inside that zone's span exactly as a
 * card dropped on it would; an unnested one seeds at `today`.
 *
 * Validation checks plan dates on every plan-zone/plan-event node whatever
 * the plane's own notation is (`validatePlan` in core), so this seeds
 * whenever `type` retypes into one of those — never gated on the active
 * plane being a `plan` notation.
 *
 * Returns undefined when `type` isn't a plan type, the node does not exist,
 * or it already carries valid dates FOR THAT TYPE (kept, never overwritten —
 * checked by applying `type` to a clone and asking spanOf/atOf, since the
 * node's own `type` field has not changed yet at the point this runs).
 */
export function seedOnRetype(ctx: PlanContext, id: string, type: string | undefined): EditorCommand | undefined {
  const { model, plane } = ctx;
  if (type !== PLAN_ZONE_TYPE && type !== PLAN_EVENT_TYPE) return undefined;
  const node = model.nodes.find((n) => n.id === id);
  if (node === undefined) return undefined;
  const already =
    type === PLAN_ZONE_TYPE ? spanOf({ ...node, type }) !== undefined : atOf({ ...node, type }) !== undefined;
  if (already) return undefined;
  const parentId = planGraph(model, plane).parent.get(id);
  const dates = seedDates(ctx, type, { parentId });
  return dates === undefined ? undefined : { type: 'set-plan-dates', id, dates };
}
