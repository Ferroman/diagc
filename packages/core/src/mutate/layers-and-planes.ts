import {
  BUILTIN_NOTATIONS,
  type DiagramLayer,
  type DiagramModel,
  type DiagramPlane,
  type DiagramRelation,
} from '../types';
import { CommandError } from '../command-error';
import { prunePlaneLists, requireNode } from './shared';

export function upsertLayer(model: DiagramModel, layer: DiagramLayer): DiagramModel {
  const exists = model.layers.some((l) => l.id === layer.id);
  return {
    ...model,
    layers: exists ? model.layers.map((l) => (l.id === layer.id ? layer : l)) : [...model.layers, layer],
  };
}

export function deleteLayer(model: DiagramModel, id: string): DiagramModel {
  if (!model.layers.some((l) => l.id === id)) throw new CommandError(`Unknown layer '${id}'`);
  // Destructive: remove the layer's tagged nodes + relations. Cascade like
  // deleteNode — a destroyed node's containment is severed (untagged children
  // survive top-level) and relations touching it are dropped.
  const doomed = new Set(model.nodes.filter((n) => n.layer === id).map((n) => n.id));
  // A tagged column goes with its layer too, and so does a relation anchored to
  // it: that relation is the column's foreign key, and without the row it would
  // fail validation as an unknown-column.
  const doomedColumns = new Set<string>();
  const nodes = model.nodes
    .filter((n) => n.layer !== id)
    .map((n) => {
      if (!n.columns?.some((c) => c.layer === id)) return n;
      for (const c of n.columns) if (c.layer === id) doomedColumns.add(`${n.id}\u0000${c.name}`);
      return { ...n, columns: n.columns.filter((c) => c.layer !== id) };
    });
  const anchoredToDoomed = (r: DiagramRelation): boolean =>
    (r.fromColumn !== undefined && doomedColumns.has(`${r.from}\u0000${r.fromColumn}`)) ||
    (r.toColumn !== undefined && doomedColumns.has(`${r.to}\u0000${r.toColumn}`));
  return {
    ...model,
    layers: model.layers.filter((l) => l.id !== id),
    nodes,
    relations: model.relations.filter(
      (r) => r.layer !== id && !doomed.has(r.from) && !doomed.has(r.to) && !anchoredToDoomed(r),
    ),
    containment: model.containment.filter((e) => !doomed.has(e.parent) && !doomed.has(e.child)),
    // The layer leaves every plane's preset list, and its destroyed nodes every
    // hides/hidesTree (a stale entry fails `unknown-hidden-node` on the next save).
    planes: prunePlaneLists(model.planes ?? [], {
      layers: (l) => l === id,
      hides: (h) => doomed.has(h),
      hidesTree: (h) => doomed.has(h),
    }),
  };
}

export function mergeLayers(model: DiagramModel, sourceIds: string[], targetId?: string): DiagramModel {
  if (targetId !== undefined && !model.layers.some((l) => l.id === targetId)) {
    throw new CommandError(`Unknown layer '${targetId}'`);
  }
  for (const id of sourceIds) {
    if (!model.layers.some((l) => l.id === id)) throw new CommandError(`Unknown layer '${id}'`);
    if (id === targetId) throw new CommandError('Cannot merge a layer into itself');
  }
  if (sourceIds.length === 0) return model;
  const sources = new Set(sourceIds);
  // Retag a source-tagged node/relation onto the target, or drop the tag
  // entirely when merging to the base sheet (targetId omitted).
  const retag = <T extends { layer?: string }>(x: T): T => {
    if (x.layer === undefined || !sources.has(x.layer)) return x;
    if (targetId === undefined) {
      const { layer: _layer, ...rest } = x;
      return rest as T;
    }
    return { ...x, layer: targetId };
  };
  return {
    ...model,
    layers: model.layers.filter((l) => !sources.has(l.id)),
    nodes: model.nodes.map((n) => {
      const node = retag(n);
      if (!node.columns?.some((c) => c.layer !== undefined && sources.has(c.layer))) return node;
      return { ...node, columns: node.columns.map(retag) };
    }),
    relations: model.relations.map(retag),
    planes: (model.planes ?? []).map((p) => {
      if (p.layers === undefined) return p;
      const layers =
        targetId === undefined
          ? p.layers.filter((l) => !sources.has(l))
          : [...new Set(p.layers.map((l) => (sources.has(l) ? targetId : l)))];
      return { ...p, layers };
    }),
  };
}

export function upsertPlane(model: DiagramModel, plane: DiagramPlane): DiagramModel {
  if (plane.notation !== undefined && !(BUILTIN_NOTATIONS as readonly string[]).includes(plane.notation)) {
    throw new CommandError(`Unknown notation '${plane.notation}'`);
  }
  if (plane.containmentOf !== undefined) {
    if (plane.containmentOf === plane.id) {
      throw new CommandError(`Plane '${plane.id}' cannot borrow containment from itself`);
    }
    const target = (model.planes ?? []).find((p) => p.id === plane.containmentOf);
    if (target === undefined) {
      throw new CommandError(`Unknown plane '${plane.containmentOf}'`);
    }
    if (target.containmentOf !== undefined) {
      throw new CommandError(`Plane '${plane.containmentOf}' itself borrows containment — chains are not allowed`);
    }
  }
  const planes = model.planes ?? [];
  const exists = planes.some((p) => p.id === plane.id);
  return { ...model, planes: exists ? planes.map((p) => (p.id === plane.id ? plane : p)) : [...planes, plane] };
}

/** Add/remove a shared node from a plane's `hides`. A node already scoped to a
 * plane is view-local, so hiding it is a no-op (validation flags a stray one). */
export function setNodePlaneHidden(
  model: DiagramModel,
  nodeId: string,
  planeId: string,
  hidden: boolean,
): DiagramModel {
  const node = requireNode(model, nodeId);
  if (hidden && node.plane !== undefined) return model;
  return {
    ...model,
    planes: (model.planes ?? []).map((p) => {
      if (p.id !== planeId) return p;
      const set = new Set(p.hides ?? []);
      if (hidden) set.add(nodeId);
      else set.delete(nodeId);
      const { hides: _drop, ...rest } = p;
      return set.size > 0 ? { ...rest, hides: [...set] } : rest;
    }),
  };
}

export function deletePlane(model: DiagramModel, id: string): DiagramModel {
  const planes = model.planes ?? [];
  if (!planes.some((p) => p.id === id)) throw new CommandError(`Unknown plane '${id}'`);
  const borrower = planes.find((p) => p.containmentOf === id);
  if (borrower !== undefined) {
    throw new CommandError(`Plane '${borrower.id}' borrows containment from '${id}' — delete or repoint it first`);
  }
  // The first-declared plane owns the untagged (base) edges; drop them with it so
  // structure doesn't silently migrate to whichever plane becomes first next.
  const isFirst = planes[0]?.id === id;
  return {
    ...model,
    planes: planes.filter((p) => p.id !== id),
    containment: model.containment.filter((e) => e.plane !== id && !(isFirst && e.plane === undefined)),
  };
}
