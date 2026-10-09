import type { DiagramModel, DiagramNode, DiagramRelation } from './types';
import { defaultPlaneOf } from './planes';

/**
 * What changed between two versions of one diagram, by meaning only: nodes,
 * relations, layers and planes. Positions live in the layout overlay and are
 * not compared — a box nudged ten pixels is not an architecture change.
 *
 * Nodes match by id. Relations match by id first, then any left over pair up
 * by `from`, `to` and `kind`: a relation the studio re-created, or one whose
 * builder id shifted, is the same arrow and should read as one.
 */
export type DiffStatus = 'added' | 'removed' | 'changed';

export interface NodeChange {
  id: string;
  name: string;
  /** the fields that differ, in the model's own names; `parent` when the node
   * moved to another container (in any plane) */
  fields: string[];
}

export interface RelationChange {
  /** the relation's id on each side — equal unless the match was by endpoints */
  before: string;
  after: string;
  fields: string[];
}

export interface ModelDiff {
  nodes: { added: DiagramNode[]; removed: DiagramNode[]; changed: NodeChange[] };
  relations: { added: DiagramRelation[]; removed: DiagramRelation[]; changed: RelationChange[] };
  layers: { added: string[]; removed: string[] };
  planes: { added: string[]; removed: string[] };
}

/** Element ids to mark on one side's picture: the before picture shows what
 * went (and what changed), the after picture what arrived (and what changed). */
export interface DiffMarks {
  nodes: Record<string, DiffStatus>;
  relations: Record<string, DiffStatus>;
}

/** JSON with sorted keys: a .diagram.ts and the .diagram.json it was ejected
 * to can hold the same node with its keys in another order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function changedFields(before: object, after: object, skip: ReadonlySet<string>): string[] {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => !skip.has(k) && canonical(b[k]) !== canonical(a[k])).sort();
}

/** each node's containers, as `plane:parent` (default plane spelled out) */
function parentsByNode(m: DiagramModel): Map<string, string> {
  const defaultPlane = defaultPlaneOf(m) ?? '';
  const sets = new Map<string, string[]>();
  for (const e of m.containment) {
    const list = sets.get(e.child) ?? [];
    list.push(`${e.plane ?? defaultPlane}:${e.parent}`);
    sets.set(e.child, list);
  }
  return new Map([...sets].map(([id, list]) => [id, list.sort().join('|')]));
}

const NO_SKIP: ReadonlySet<string> = new Set();
const SKIP_ID: ReadonlySet<string> = new Set(['id']);

export function diffModels(before: DiagramModel, after: DiagramModel): ModelDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const beforeParents = parentsByNode(before);
  const afterParents = parentsByNode(after);

  const changedNodes: NodeChange[] = [];
  for (const a of after.nodes) {
    const b = beforeNodes.get(a.id);
    if (b === undefined) continue;
    const fields = changedFields(b, a, NO_SKIP);
    if ((beforeParents.get(a.id) ?? '') !== (afterParents.get(a.id) ?? '')) fields.push('parent');
    if (fields.length > 0) changedNodes.push({ id: a.id, name: a.name, fields });
  }

  const beforeRels = new Map(before.relations.map((r) => [r.id, r]));
  const afterIds = new Set(after.relations.map((r) => r.id));
  const changedRels: RelationChange[] = [];
  const addedRels: DiagramRelation[] = [];
  for (const a of after.relations) {
    const b = beforeRels.get(a.id);
    if (b === undefined) {
      addedRels.push(a);
      continue;
    }
    const fields = changedFields(b, a, NO_SKIP);
    if (fields.length > 0) changedRels.push({ before: b.id, after: a.id, fields });
  }
  // Leftovers on both sides: pair them by endpoints and kind, first come first served.
  const removedRels: DiagramRelation[] = [];
  const unmatched = before.relations.filter((r) => !afterIds.has(r.id));
  const endpoint = (r: DiagramRelation) => `${r.from}\u0000${r.to}\u0000${r.kind}`;
  for (const b of unmatched) {
    const at = addedRels.findIndex((a) => endpoint(a) === endpoint(b));
    if (at === -1) {
      removedRels.push(b);
      continue;
    }
    const a = addedRels.splice(at, 1)[0]!;
    const fields = changedFields(b, a, SKIP_ID);
    if (fields.length > 0) changedRels.push({ before: b.id, after: a.id, fields });
  }

  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const added = (b: Set<string>, a: Set<string>) => [...a].filter((id) => !b.has(id));
  const beforeLayers = ids(before.layers);
  const afterLayers = ids(after.layers);
  const beforePlanes = ids(before.planes);
  const afterPlanes = ids(after.planes);

  return {
    nodes: {
      added: after.nodes.filter((n) => !beforeNodes.has(n.id)),
      removed: before.nodes.filter((n) => !afterNodes.has(n.id)),
      changed: changedNodes,
    },
    relations: { added: addedRels, removed: removedRels, changed: changedRels },
    layers: { added: added(beforeLayers, afterLayers), removed: added(afterLayers, beforeLayers) },
    planes: { added: added(beforePlanes, afterPlanes), removed: added(afterPlanes, beforePlanes) },
  };
}

export function isEmptyDiff(d: ModelDiff): boolean {
  return (
    d.nodes.added.length +
      d.nodes.removed.length +
      d.nodes.changed.length +
      d.relations.added.length +
      d.relations.removed.length +
      d.relations.changed.length +
      d.layers.added.length +
      d.layers.removed.length +
      d.planes.added.length +
      d.planes.removed.length ===
    0
  );
}

export function diffMarks(d: ModelDiff, side: 'before' | 'after'): DiffMarks {
  const nodes: Record<string, DiffStatus> = {};
  const relations: Record<string, DiffStatus> = {};
  for (const n of d.nodes.changed) nodes[n.id] = 'changed';
  for (const r of d.relations.changed) relations[side === 'before' ? r.before : r.after] = 'changed';
  if (side === 'before') {
    for (const n of d.nodes.removed) nodes[n.id] = 'removed';
    for (const r of d.relations.removed) relations[r.id] = 'removed';
  } else {
    for (const n of d.nodes.added) nodes[n.id] = 'added';
    for (const r of d.relations.added) relations[r.id] = 'added';
  }
  return { nodes, relations };
}
