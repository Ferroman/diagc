import type { DiagramModel, DiagramNode } from '../types';

export interface HierarchyIndex {
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  roots: string[];
}

/**
 * Containment indexes for one plane, over the plane's VISIBLE nodes only.
 * Visibility is explicit: a node is shared (`node.plane` unset) and shown unless
 * the plane hides it, or it is scoped to exactly this plane. Re-nesting via a
 * plane-tagged containment edge never changes membership. `plane` = the resolved
 * plane id (see compile.ts `resolveContainmentPlane`); omitted = the model's
 * default (first-declared) plane, or all-shared for models without planes.
 *
 * A node tagged with a transparent-sheet `layer` is visible only while that layer
 * is active; untagged nodes are the always-on base sheet. `activeLayers` omitted =
 * no layer filtering (every layer treated as on).
 */
export function buildHierarchy(m: DiagramModel, plane?: string, activeLayers?: ReadonlySet<string>): HierarchyIndex {
  const defaultPlane = (m.planes ?? [])[0]?.id;
  const active = plane ?? defaultPlane;
  const planeDef = active !== undefined ? (m.planes ?? []).find((p) => p.id === active) : undefined;
  const hides = new Set(planeDef?.hides ?? []);

  const layerOn = (n: DiagramNode): boolean =>
    n.layer === undefined || activeLayers === undefined || activeLayers.has(n.layer);
  const isVisible = (n: DiagramNode): boolean =>
    (n.plane === undefined ? !hides.has(n.id) : n.plane === active) && layerOn(n);
  const visible = new Set(m.nodes.filter(isVisible).map((n) => n.id));

  const edges = (
    active === undefined ? m.containment : m.containment.filter((e) => (e.plane ?? defaultPlane) === active)
  ).filter((e) => visible.has(e.parent) && visible.has(e.child));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const id of visible) {
    parentsOf.set(id, []);
    childrenOf.set(id, []);
  }
  for (const e of edges) {
    childrenOf.get(e.parent)?.push(e.child);
    parentsOf.get(e.child)?.push(e.parent);
  }
  const roots = m.nodes
    .filter((n) => visible.has(n.id) && (parentsOf.get(n.id)?.length ?? 0) === 0)
    .map((n) => n.id);
  return { parentsOf, childrenOf, roots };
}
