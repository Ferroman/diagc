import { relationLabels } from './labels';
import {
  STRIDE,
  THREAT_STATUSES,
  type DiagramModel,
  type DiagramNode,
  type LayoutOverlay,
  type StrideCategory,
  type Threat,
  type ThreatStatus,
} from './types';
import { containmentPlaneOf } from './view/hierarchy';

/** The notation id a plane (or the model) declares to be drawn as a STRIDE
 * data-flow diagram. */
export const TM_NOTATION = 'threat-model' as const;
export const TM_ENTITY_TYPE = 'tm-entity' as const;
export const TM_PROCESS_TYPE = 'tm-process' as const;
export const TM_STORE_TYPE = 'tm-store' as const;
/** A trust boundary is a CONTAINER, never a box with arrows: "this flow crosses
 * a boundary" is then derived from containment (see crossings) instead of being
 * authored, and cannot disagree with the drawing. */
export const TM_BOUNDARY_TYPE = 'tm-boundary' as const;
export const TM_FLOW_KIND = 'data-flow' as const;
export const TM_TYPES: ReadonlySet<string> = new Set([TM_ENTITY_TYPE, TM_PROCESS_TYPE, TM_STORE_TYPE, TM_BOUNDARY_TYPE]);
export const isThreatModelNode = (n: DiagramNode): boolean => n.type !== undefined && TM_TYPES.has(n.type);

export const STRIDE_NAMES: Record<StrideCategory, string> = {
  S: 'Spoofing',
  T: 'Tampering',
  R: 'Repudiation',
  I: 'Information disclosure',
  D: 'Denial of service',
  E: 'Elevation of privilege',
};

/** The title a threat gets when it is added from the canvas, before anyone has
 * typed one. It is a real title rather than `''` because a threat with an empty
 * title fails validation (`threat-title`) — and the studio autosaves on a timer,
 * so an empty one would reach the save handler as a 400 while the user is still
 * typing. Lives in core so every host seeds the same word, and so "was this ever
 * titled?" is one comparison rather than a per-host convention. */
export const NEW_THREAT_TITLE = 'New threat';

/** which element a threat command or register row refers to */
export type ThreatTarget = { node: string } | { relation: string };

/** The overlay key a threat target is filed under (`LayoutOverlay.notes`). Node
 * and relation ids are separate namespaces — nothing stops a node and a relation
 * sharing an id — so one flat map needs the prefix. */
export const threatTargetKey = (t: ThreatTarget): string => ('node' in t ? `node:${t.node}` : `relation:${t.relation}`);

/** The element's threat list — `[]` when it carries none, undefined when there
 * is no such element. The two are different answers: a note is drawn for the
 * first case's element and the second is a dangling reference. */
export function threatsOf(m: DiagramModel, t: ThreatTarget): readonly Threat[] | undefined {
  const el = 'node' in t ? m.nodes.find((n) => n.id === t.node) : m.relations.find((r) => r.id === t.relation);
  return el === undefined ? undefined : (el.threats ?? []);
}

/** First free `t<n>`. Ids are scoped to their element, so a removed `t2` is
 * handed out again rather than the counter climbing forever. */
export function nextThreatId(threats: readonly Threat[]): string {
  const taken = new Set(threats.map((t) => t.id));
  let n = 1;
  while (taken.has(`t${n}`)) n += 1;
  return `t${n}`;
}

/** the boundaries a relation's ends sit in; an absent side is "outside every boundary" */
export interface Crossing {
  from?: string;
  to?: string;
}

export interface ThreatRow {
  target: ThreatTarget;
  /** the element's display name — a flow reads `from → to (label)` */
  name: string;
  threat: Threat;
}

export const isOpen = (t: Threat): boolean => (t.status ?? 'open') === 'open';

/** STRIDE-per-element (the Microsoft table): which categories apply to a DFD
 * element. A type outside the DFD vocabulary — a C4 container being
 * threat-modelled on its own plane — gets every category offered. */
const STRIDE_FOR: Record<string, readonly StrideCategory[]> = {
  [TM_ENTITY_TYPE]: ['S', 'R'],
  [TM_PROCESS_TYPE]: STRIDE,
  [TM_STORE_TYPE]: ['T', 'R', 'I', 'D'],
  [TM_FLOW_KIND]: ['T', 'I', 'D'],
};
export function strideFor(typeOrKind: string | undefined): readonly StrideCategory[] {
  return (typeOrKind !== undefined ? STRIDE_FOR[typeOrKind] : undefined) ?? STRIDE;
}

/** child → parents on the plane a view of `plane` uses (containmentOf resolved;
 * an untagged edge belongs to the first-declared plane), declaration order kept */
function planeParents(m: DiagramModel, plane: string | undefined): Map<string, string[]> {
  const active = containmentPlaneOf(m, plane);
  const defaultPlane = m.planes?.[0]?.id;
  const parents = new Map<string, string[]>();
  for (const e of m.containment) {
    if ((e.plane ?? defaultPlane) !== active) continue;
    parents.set(e.child, [...(parents.get(e.child) ?? []), e.parent]);
  }
  return parents;
}

function nearestBoundary(parents: Map<string, string[]>, typeOf: Map<string, string | undefined>, id: string): string | undefined {
  const seen = new Set<string>();
  let cur = parents.get(id)?.[0];
  // `seen` is belt-and-braces: validation rejects containment cycles, but a
  // derivation that runs every frame must not be able to spin on a bad model.
  while (cur !== undefined && !seen.has(cur)) {
    if (typeOf.get(cur) === TM_BOUNDARY_TYPE) return cur;
    seen.add(cur);
    cur = parents.get(cur)?.[0];
  }
  return undefined;
}

/** The nearest trust boundary above `nodeId` on the viewed plane, or undefined
 * outside every boundary. Containment is a DAG; the first parent by declaration
 * order is the one followed — the same pick a reader makes from the drawing. */
export function boundaryOf(m: DiagramModel, plane: string | undefined, nodeId: string): string | undefined {
  return nearestBoundary(planeParents(m, plane), new Map(m.nodes.map((n) => [n.id, n.type])), nodeId);
}

/** Every relation whose two ends sit in different boundaries — the flows STRIDE
 * cares about. Derived from containment, not authored, and not filtered by kind:
 * a boundary crossing is a fact about the drawing, whatever the arrow means. */
export function crossings(m: DiagramModel, plane: string | undefined): ReadonlyMap<string, Crossing> {
  const parents = planeParents(m, plane);
  const typeOf = new Map(m.nodes.map((n) => [n.id, n.type]));
  const cache = new Map<string, string | undefined>();
  const bOf = (id: string): string | undefined => {
    if (!cache.has(id)) cache.set(id, nearestBoundary(parents, typeOf, id));
    return cache.get(id);
  };
  const out = new Map<string, Crossing>();
  for (const r of m.relations) {
    const from = bOf(r.from);
    const to = bOf(r.to);
    if (from === to) continue;
    // an absent side means "outside every boundary" — omitted rather than
    // `undefined` so a serialized Crossing stays minimal
    out.set(r.id, { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) });
  }
  return out;
}

/** One end of a crossing, as a reader sees it: *outside* where the end sits in
 * no boundary at all, otherwise the boundary node's name — or, for an id no node
 * carries, the id itself, so a broken model still says which one it means. */
export function boundaryName(m: DiagramModel, id: string | undefined): string {
  return id === undefined ? 'outside' : (m.nodes.find((n) => n.id === id)?.name ?? id);
}

/** `DMZ ⇢ Backend`: a crossing read between the two BOUNDARIES its ends sit in.
 * The other arrow is the whole point — a flow's own line reads `from → to` and
 * names the elements, this one names the trust zones the flow leaves and enters.
 * Formatted here rather than at each call site so the studio panel and the
 * published table cannot word the same fact differently. */
export function crossingLabel(m: DiagramModel, crossing: Crossing): string {
  return `${boundaryName(m, crossing.from)} ⇢ ${boundaryName(m, crossing.to)}`;
}

/** The register: every threat in the model, nodes first then relations, each in
 * declaration order — the one order the studio list and the published table share. */
export function threatRegister(m: DiagramModel): ThreatRow[] {
  const rows: ThreatRow[] = [];
  for (const n of m.nodes) for (const threat of n.threats ?? []) rows.push({ target: { node: n.id }, name: n.name, threat });
  const nameOf = (id: string): string => m.nodes.find((n) => n.id === id)?.name ?? id;
  for (const r of m.relations) {
    if (r.threats === undefined || r.threats.length === 0) continue;
    const label = relationLabels(r)[0]?.text;
    const name = `${nameOf(r.from)} → ${nameOf(r.to)}${label !== undefined && label !== '' ? ` (${label})` : ''}`;
    for (const threat of r.threats) rows.push({ target: { relation: r.id }, name, threat });
  }
  return rows;
}

export function threatSummary(threats: readonly Threat[] | undefined): { open: number; total: number } {
  const list = threats ?? [];
  return { open: list.filter(isOpen).length, total: list.length };
}

/** the status a bubble's chip advances to on a click: the THREAT_STATUSES
 * order, wrapping — an absent status is `open`, as isOpen reads it */
export function nextThreatStatus(t: Threat): ThreatStatus {
  const i = THREAT_STATUSES.indexOf(t.status ?? 'open');
  return THREAT_STATUSES[(i + 1) % THREAT_STATUSES.length] ?? 'open';
}

/**
 * Whether every threat-bearing element in the model has an open bubble on
 * `planeKey` — the studio's `Notes` chip reads pressed exactly then, so a
 * press always does the thing the picture is missing (opens the rest, or
 * closes all). Model-wide, like set-notes-open: the chip and the command must
 * agree on what "all" means. False when nothing carries a threat.
 */
export function allNotesOpen(model: DiagramModel, layout: LayoutOverlay, planeKey: string): boolean {
  const bucket = layout.notes?.[planeKey];
  let any = false;
  for (const n of model.nodes) {
    if ((n.threats?.length ?? 0) === 0) continue;
    any = true;
    if (bucket?.[threatTargetKey({ node: n.id })]?.open !== true) return false;
  }
  for (const r of model.relations) {
    if ((r.threats?.length ?? 0) === 0) continue;
    any = true;
    if (bucket?.[threatTargetKey({ relation: r.id })]?.open !== true) return false;
  }
  return any;
}
