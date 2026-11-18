import type { DiagramModel, DiagramNode, DiagramPlane, DiagramRelation } from './types';
import { defaultPlaneOf } from './planes';

/**
 * What changed between two versions of one diagram, by meaning only: nodes,
 * relations, layers and planes. Positions live in the layout overlay and are
 * not compared — a box nudged ten pixels is not an architecture change.
 *
 * Nodes match by id. Relations match by what they say, not by id: the builder
 * numbers the relations of a pair in the order they are written, so one new
 * relation shifts the id of every later one between the same two nodes
 * (matchRelations).
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
  layers: { added: string[]; removed: string[]; changed: FieldChange[] };
  planes: { added: string[]; removed: string[]; changed: FieldChange[] };
}

/** A layer or a plane both versions have, and the fields that differ. */
export interface FieldChange {
  id: string;
  fields: string[];
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
function parentsByNode(model: DiagramModel): Map<string, string> {
  const defaultPlane = defaultPlaneOf(model) ?? '';
  const sets = new Map<string, string[]>();
  for (const e of model.containment) {
    const list = sets.get(e.child) ?? [];
    list.push(`${e.plane ?? defaultPlane}:${e.parent}`);
    sets.set(e.child, list);
  }
  return new Map([...sets].map(([id, list]) => [id, list.sort().join('|')]));
}

const NO_SKIP: ReadonlySet<string> = new Set();
const SKIP_ID: ReadonlySet<string> = new Set(['id']);

/** the entries both lists have, by id, whose fields differ */
function changedById<T extends { id: string }>(before: readonly T[], after: readonly T[]): FieldChange[] {
  const was = new Map(before.map((x) => [x.id, x]));
  return after.flatMap((a) => {
    const b = was.get(a.id);
    const fields = b === undefined ? [] : changedFields(b, a, NO_SKIP);
    return fields.length > 0 ? [{ id: a.id, fields }] : [];
  });
}

/** Whether `r`'s id is the one the builder gives a relation that names none:
 * its place among the relations of its pair, which moves when one is added. */
function hasPositionalId(r: DiagramRelation): boolean {
  return r.id.startsWith(`${r.from}->${r.to}#`);
}

/**
 * Pair the relations of two versions, in three passes over what is left:
 *
 * 1. the same content, whatever the id: nothing changed;
 * 2. the same ends, kind and layer: the one arrow, changed. Where several share
 *    those, the pairs with the fewest differing fields go first;
 * 3. the same id, where the author gave one: the arrow moved to other ends or
 *    another layer.
 *
 * What no pass pairs was added or removed. A positional id is never evidence on
 * its own: two versions can give it to unrelated relations.
 */
function matchRelations(before: readonly DiagramRelation[], after: readonly DiagramRelation[]): ModelDiff['relations'] {
  const content = (r: DiagramRelation) => canonical({ ...r, id: undefined });
  const pool = new Map<string, DiagramRelation[]>();
  for (const b of before) pool.set(content(b), [...(pool.get(content(b)) ?? []), b]);
  let afterLeft: DiagramRelation[] = [];
  for (const a of after) {
    const same = pool.get(content(a));
    if (same === undefined || same.length === 0) {
      afterLeft.push(a);
      continue;
    }
    const at = same.findIndex((b) => b.id === a.id);
    same.splice(at === -1 ? 0 : at, 1);
  }
  const unmatched = new Set([...pool.values()].flat());
  let beforeLeft = before.filter((b) => unmatched.has(b));

  const changed: RelationChange[] = [];
  const pair = (b: DiagramRelation, a: DiagramRelation) => {
    changed.push({ before: b.id, after: a.id, fields: changedFields(b, a, SKIP_ID) });
    beforeLeft = beforeLeft.filter((x) => x !== b);
    afterLeft = afterLeft.filter((x) => x !== a);
  };

  const slot = (r: DiagramRelation) => [r.from, r.to, r.kind, r.layer ?? ''].join('\u0000');
  const candidates = beforeLeft.flatMap((b) =>
    afterLeft
      .filter((a) => slot(a) === slot(b))
      .map((a) => ({ b, a, distance: changedFields(b, a, SKIP_ID).length, sameId: a.id === b.id })),
  );
  // Stable: equal candidates keep declaration order.
  candidates.sort((x, y) => x.distance - y.distance || Number(y.sameId) - Number(x.sameId));
  for (const { b, a } of candidates) if (beforeLeft.includes(b) && afterLeft.includes(a)) pair(b, a);

  for (const a of [...afterLeft]) {
    if (hasPositionalId(a)) continue;
    // a kind is what an arrow is: another kind under the same id is another arrow
    const b = beforeLeft.find((x) => x.id === a.id && x.kind === a.kind && !hasPositionalId(x));
    if (b !== undefined) pair(b, a);
  }
  // In the order the after version declares them, as the lists are.
  const order = new Map(after.map((r, i) => [r.id, i]));
  changed.sort((x, y) => (order.get(x.after) ?? 0) - (order.get(y.after) ?? 0));
  return { added: afterLeft, removed: beforeLeft, changed };
}

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

  const relations = matchRelations(before.relations, after.relations);

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
    relations,
    layers: {
      added: added(beforeLayers, afterLayers),
      removed: added(afterLayers, beforeLayers),
      changed: changedById(before.layers, after.layers),
    },
    planes: {
      added: added(beforePlanes, afterPlanes),
      removed: added(afterPlanes, beforePlanes),
      changed: changedById(before.planes, after.planes),
    },
  };
}

export function isEmptyDiff(diff: ModelDiff): boolean {
  return (
    diff.nodes.added.length +
      diff.nodes.removed.length +
      diff.nodes.changed.length +
      diff.relations.added.length +
      diff.relations.removed.length +
      diff.relations.changed.length +
      diff.layers.added.length +
      diff.layers.removed.length +
      diff.layers.changed.length +
      diff.planes.added.length +
      diff.planes.removed.length +
      diff.planes.changed.length ===
    0
  );
}

export function diffMarks(diff: ModelDiff, side: 'before' | 'after'): DiffMarks {
  const nodes: Record<string, DiffStatus> = {};
  const relations: Record<string, DiffStatus> = {};
  for (const n of diff.nodes.changed) nodes[n.id] = 'changed';
  for (const r of diff.relations.changed) relations[side === 'before' ? r.before : r.after] = 'changed';
  if (side === 'before') {
    for (const n of diff.nodes.removed) nodes[n.id] = 'removed';
    for (const r of diff.relations.removed) relations[r.id] = 'removed';
  } else {
    for (const n of diff.nodes.added) nodes[n.id] = 'added';
    for (const r of diff.relations.added) relations[r.id] = 'added';
  }
  return { nodes, relations };
}

/** Both versions in one model, and how to mark it. */
export interface CombinedDiff {
  model: DiagramModel;
  marks: DiffMarks;
}

/**
 * The after version with what the before version lost put back in: its removed
 * nodes where they sat, its removed relations, and the layers and planes that
 * went, so one picture can show what arrived, what changed and what left.
 *
 * A removed relation keeps its id unless the after version gives that id to
 * another one (positional ids repeat across versions); then it gets a suffix.
 * The removed elements are read from `before` by id, so the two models may be
 * copies the caller has worked on since the diff (their assets inlined).
 */
export function combineDiff(before: DiagramModel, after: DiagramModel, diff: ModelDiff): CombinedDiff {
  const marks = diffMarks(diff, 'after');
  const gone = new Set(diff.nodes.removed.map((n) => n.id));
  for (const id of gone) marks.nodes[id] = 'removed';

  const was = new Map(before.relations.map((r) => [r.id, r]));
  const taken = new Set(after.relations.map((r) => r.id));
  const ghosts = diff.relations.removed.map((removed) => {
    const r = was.get(removed.id) ?? removed;
    let id = r.id;
    while (taken.has(id)) id = `${id}~removed`;
    taken.add(id);
    marks.relations[id] = 'removed';
    return id === r.id ? r : { ...r, id };
  });

  const lostLayers = new Set(diff.layers.removed);
  const lostPlanes = new Set(diff.planes.removed);
  return {
    model: {
      ...after,
      nodes: [...after.nodes, ...before.nodes.filter((n) => gone.has(n.id))],
      containment: [...after.containment, ...before.containment.filter((e) => gone.has(e.child))],
      relations: [...after.relations, ...ghosts],
      layers: [...after.layers, ...before.layers.filter((l) => lostLayers.has(l.id))],
      planes: [...after.planes, ...before.planes.filter((p) => lostPlanes.has(p.id))],
    },
    marks,
  };
}

/** Whether a view of `plane` opens with `relation` drawn: on that plane, and on
 * one of the layers the plane switches on (or on none, where the plane keeps its
 * base relations). */
function relationOpensOn(relation: DiagramRelation, plane: DiagramPlane | undefined): boolean {
  if (plane === undefined) return relation.layer === undefined;
  if (relation.plane !== undefined && relation.plane !== plane.id) return false;
  if (relation.layer === undefined) return plane.baseRelations !== false;
  return (plane.layers ?? []).includes(relation.layer);
}

/** What a plane's opening view shows of the marks, by id. */
export interface PlaneMarks {
  nodes: string[];
  relations: string[];
}

/**
 * The marked nodes and relations each plane's opening view shows, by plane id.
 * A model without planes has the one entry `''`. A diff page reads it to say
 * where the changes are, and to find a plane that shows one of them.
 */
export function diffMarksByPlane(model: DiagramModel, marks: DiffMarks): Map<string, PlaneMarks> {
  const planes: (DiagramPlane | undefined)[] = model.planes.length > 0 ? model.planes : [undefined];
  return new Map(
    planes.map((plane) => {
      const scoped = (n: DiagramNode) =>
        plane === undefined || n.plane === undefined || n.plane === plane.id || n.plane === plane.containmentOf;
      const hidden = new Set([...(plane?.hides ?? []), ...(plane?.hidesTree ?? [])]);
      const shown: PlaneMarks = {
        nodes: model.nodes
          .filter((n) => marks.nodes[n.id] !== undefined && scoped(n) && !hidden.has(n.id))
          .map((n) => n.id),
        relations: model.relations
          .filter((r) => marks.relations[r.id] !== undefined && relationOpensOn(r, plane))
          .map((r) => r.id),
      };
      return [plane?.id ?? '', shown];
    }),
  );
}
