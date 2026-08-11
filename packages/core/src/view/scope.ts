import type { DiagramModel, DiagramRelation } from '../types';
import type { HierarchyIndex } from './hierarchy';

/** Reserved id prefix for external stub nodes (the off-frame node a boundary-
 *  crossing edge points to in an isolated drill view). The `__ext__:` prefix keeps it from
 *  ever colliding with a real, author-authored node id. */
export const EXTERNAL_STUB_PREFIX = '__ext__:';

export interface ScopedModel {
  /** synthetic model: the drill root's descendants + external stubs, with
   *  boundary-crossing relations re-pointed to those stubs */
  model: DiagramModel;
  /** stub node id -> the real off-frame node it stands in for */
  externals: Map<string, string>;
}

/**
 * Scope a model to the INTERIOR of `root` for an isolated drill view: keep only
 * root's descendants (root's own children become the parentless top level), drop
 * relations wholly outside, keep internal ones, and re-point each boundary-crossing
 * relation to a stub node standing in for the off-frame endpoint's outermost
 * ancestor OUTSIDE the drill root's own ancestor chain (so "a class uses the
 * database" stays visible as class → ⟨Database⟩, and a sibling of the root stands
 * for itself rather than collapsing into the ancestor both sides share).
 */
export function scopeToRoot(m: DiagramModel, h: HierarchyIndex, root: string): ScopedModel {
  const sub = new Set<string>();
  const stack = [...(h.childrenOf.get(root) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (sub.has(id)) continue;
    sub.add(id);
    stack.push(...(h.childrenOf.get(id) ?? []));
  }

  // the drill root and everything containing it (first-parent chain) — a stub
  // representing a box that CONTAINS the frame would say nothing about the edge
  const rootAncestors = new Set<string>([root]);
  for (let cur = root; ; ) {
    const p = (h.parentsOf.get(cur) ?? [])[0];
    if (p === undefined || rootAncestors.has(p)) break;
    rootAncestors.add(p);
    cur = p;
  }

  // outermost ancestor of `id` outside the root's ancestor chain (following the
  // first-parent chain; containment is a DAG); undefined when `id` is itself on
  // that chain — the relation touches the frame, not a peer
  const repOf = (id: string): string | undefined => {
    if (rootAncestors.has(id)) return undefined;
    const seen = new Set<string>([id]);
    let cur = id;
    for (;;) {
      const p = (h.parentsOf.get(cur) ?? [])[0];
      if (p === undefined || rootAncestors.has(p) || seen.has(p)) return cur;
      seen.add(p);
      cur = p;
    }
  };

  const nodeOf = new Map(m.nodes.map((n) => [n.id, n]));
  const externals = new Map<string, string>();
  const stubFor = (offFrame: string): string | undefined => {
    const rep = repOf(offFrame);
    if (rep === undefined || sub.has(rep)) return undefined; // a relation on the frame itself — skip
    const id = `${EXTERNAL_STUB_PREFIX}${rep}`;
    externals.set(id, rep);
    return id;
  };

  const relations: DiagramRelation[] = [];
  for (const r of m.relations) {
    const fromIn = sub.has(r.from);
    const toIn = sub.has(r.to);
    if (fromIn && toIn) {
      relations.push(r);
    } else if (fromIn) {
      const stub = stubFor(r.to);
      if (stub !== undefined) relations.push({ ...r, to: stub });
    } else if (toIn) {
      const stub = stubFor(r.from);
      if (stub !== undefined) relations.push({ ...r, from: stub });
    }
  }

  // The subtree is already within one resolved plane; the synthetic model is
  // plane-less, so strip each node's `plane` scope (else buildHierarchy would
  // filter a plane-scoped node out when no plane is active).
  const nodes = m.nodes
    .filter((n) => sub.has(n.id))
    .map(({ plane: _plane, ...rest }) => rest);
  // a stub keeps the represented node's visual identity (type/shape/color/icon)
  // so it renders like the original entity; the renderer adds the ghost look
  for (const [stubId, rep] of externals) {
    const src = nodeOf.get(rep);
    nodes.push({
      id: stubId,
      name: src?.name ?? rep,
      ...(src?.type !== undefined ? { type: src.type } : {}),
      ...(src?.icon !== undefined ? { icon: src.icon } : {}),
      ...(src?.image !== undefined ? { image: src.image } : {}),
      ...(src?.shape !== undefined ? { shape: src.shape } : {}),
      ...(src?.color !== undefined ? { color: src.color } : {}),
      ...(src?.textColor !== undefined ? { textColor: src.textColor } : {}),
    });
  }
  const containment = m.containment
    .filter((e) => sub.has(e.parent) && sub.has(e.child))
    .map(({ plane: _plane, ...rest }) => rest);

  // Drill happens within one already-resolved plane; the synthetic model is
  // plane-less so buildHierarchy uses its raw containment (root's children +
  // stubs are the parentless roots).
  return { model: { ...m, nodes, containment, relations, planes: [] }, externals };
}
