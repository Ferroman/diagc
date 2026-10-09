import type { DiagramModel } from '../types';
import type { HierarchyIndex } from './hierarchy';
import type { LodState, NodeViewState, ViewNode } from './types';

export interface ViewTree {
  roots: ViewNode[];
  byId: Map<string, ViewNode>;
  /** hidden node id -> its unique visible absorber */
  anchorOf: Map<string, string>;
  /** visible node id -> placement parent (null = top level) */
  hostOf: Map<string, string | null>;
}

/** Which nodes the view shows and where each is placed. */
interface Placement {
  visible: Set<string>;
  /** visible node id -> placement parent (null = top level) */
  hostOf: Map<string, string | null>;
  /** shared nodes lifted out of their folded parents to sit beside them */
  promoted: Set<string>;
}

type StateOf = (id: string) => NodeViewState;

export function buildViewTree(model: DiagramModel, hierarchy: HierarchyIndex, lod: LodState): ViewTree {
  const stateOf: StateOf = (id) =>
    (hierarchy.childrenOf.get(id) ?? []).length === 0 ? 'leaf' : (lod[id] ?? 'collapsed');
  const placement = placeNodes(model, hierarchy, stateOf);
  const anchorOf = anchorsOfHidden(model, hierarchy, placement.visible);
  const byId = viewNodes(model, placement, stateOf);
  const roots = arrange(model, byId, placement);
  markSharedMembers(model, hierarchy, byId, placement.hostOf);
  return { roots, byId, anchorOf, hostOf: placement.hostOf };
}

/** The visible boxes a hidden node folds into: each visible parent, and through
 * each hidden parent, that parent's. */
function absorbersOf(
  id: string,
  hierarchy: HierarchyIndex,
  visible: ReadonlySet<string>,
  memo: Map<string, Set<string>>,
): Set<string> {
  const hit = memo.get(id);
  if (hit) return hit;
  const acc = new Set<string>();
  memo.set(id, acc); // pre-set guards diamond re-entry (containment is a DAG)
  for (const p of hierarchy.parentsOf.get(id) ?? []) {
    if (visible.has(p)) acc.add(p);
    else for (const a of absorbersOf(p, hierarchy, visible, memo)) acc.add(a);
  }
  return acc;
}

/** The innermost placement parent every absorber sits inside, or null (top level). */
function commonHost(absorbers: Set<string>, hostOf: ReadonlyMap<string, string | null>): string | null {
  const chains = [...absorbers].map((a) => {
    const chain: string[] = [];
    let cur = hostOf.get(a) ?? null;
    while (cur !== null) {
      chain.push(cur);
      cur = hostOf.get(cur) ?? null;
    }
    return chain;
  });
  const [first, ...rest] = chains;
  for (const cand of first ?? []) {
    if (rest.every((c) => c.includes(cand))) return cand;
  }
  return null;
}

// Reveal children of visible expanded nodes; then promote hidden shared
// nodes spanning >=2 visible groups; repeat until stable. Within a round,
// only "membership-maximal" candidates promote: a candidate with a hidden
// ancestor that is itself a candidate waits — once the ancestor is visible,
// the descendant usually resolves to a single absorber (it lives inside the
// promoted container) instead of being wrongly promoted next to it.
function placeNodes(model: DiagramModel, hierarchy: HierarchyIndex, stateOf: StateOf): Placement {
  const placement: Placement = { visible: new Set(), hostOf: new Map(), promoted: new Set() };
  for (const r of hierarchy.roots) {
    placement.visible.add(r);
    placement.hostOf.set(r, null);
  }
  do revealChildren(model, hierarchy, stateOf, placement);
  while (promoteShared(model, hierarchy, placement));
  return placement;
}

/** Shows the children of every visible expanded node, until none is left to show. */
function revealChildren(model: DiagramModel, hierarchy: HierarchyIndex, stateOf: StateOf, placement: Placement): void {
  const { visible, hostOf } = placement;
  let placed = true;
  while (placed) {
    placed = false;
    for (const n of model.nodes) {
      if (visible.has(n.id)) continue;
      const host = (hierarchy.parentsOf.get(n.id) ?? []).find((p) => visible.has(p) && stateOf(p) === 'expanded');
      if (host !== undefined) {
        visible.add(n.id);
        hostOf.set(n.id, host);
        placed = true;
      }
    }
  }
}

/** One round of promotion; false when no hidden node spans two visible boxes. */
function promoteShared(model: DiagramModel, hierarchy: HierarchyIndex, placement: Placement): boolean {
  const { visible, hostOf, promoted } = placement;
  const memo = new Map<string, Set<string>>();
  const candidates = model.nodes.filter(
    (n) => !visible.has(n.id) && absorbersOf(n.id, hierarchy, visible, memo).size >= 2,
  );
  if (candidates.length === 0) return false;
  const candidateIds = new Set(candidates.map((n) => n.id));
  // A DAG always has a maximal candidate, so this round promotes >=1 node.
  for (const n of candidates.filter((c) => !hasCandidateAncestor(c.id, hierarchy, visible, candidateIds))) {
    promoted.add(n.id);
    visible.add(n.id);
    hostOf.set(n.id, commonHost(absorbersOf(n.id, hierarchy, visible, memo), hostOf));
  }
  return true;
}

/** Whether a hidden ancestor of `id`, short of the visible boxes, is a candidate too. */
function hasCandidateAncestor(
  id: string,
  hierarchy: HierarchyIndex,
  visible: ReadonlySet<string>,
  candidateIds: ReadonlySet<string>,
): boolean {
  const seen = new Set<string>();
  const stack = [...(hierarchy.parentsOf.get(id) ?? [])];
  while (stack.length > 0) {
    const p = stack.pop();
    if (p === undefined || seen.has(p)) continue;
    seen.add(p);
    if (candidateIds.has(p)) return true;
    if (!visible.has(p)) stack.push(...(hierarchy.parentsOf.get(p) ?? []));
  }
  return false;
}

/** Anchors for hidden nodes (unique by construction: >=2 would have promoted). */
function anchorsOfHidden(
  model: DiagramModel,
  hierarchy: HierarchyIndex,
  visible: ReadonlySet<string>,
): Map<string, string> {
  const anchorOf = new Map<string, string>();
  const memo = new Map<string, Set<string>>();
  for (const n of model.nodes) {
    if (visible.has(n.id)) continue;
    const [anchor] = absorbersOf(n.id, hierarchy, visible, memo);
    if (anchor !== undefined) anchorOf.set(n.id, anchor);
  }
  return anchorOf;
}

/** A ViewNode per visible node, in model order. */
function viewNodes(model: DiagramModel, placement: Placement, stateOf: StateOf): Map<string, ViewNode> {
  const byId = new Map<string, ViewNode>();
  for (const n of model.nodes) {
    if (!placement.visible.has(n.id)) continue;
    byId.set(n.id, {
      id: n.id,
      node: n,
      state: stateOf(n.id),
      children: [],
      promoted: placement.promoted.has(n.id),
      sharedMembers: [],
    });
  }
  return byId;
}

/** Puts each ViewNode in its host's children, or in the roots. Two passes so
 * promoted nodes land AFTER normally-placed siblings within each roots/children
 * list, each group internally in model order. */
function arrange(model: DiagramModel, byId: ReadonlyMap<string, ViewNode>, placement: Placement): ViewNode[] {
  const roots: ViewNode[] = [];
  const placeInto = (vn: ViewNode): void => {
    const host = placement.hostOf.get(vn.id) ?? null;
    if (host === null) roots.push(vn);
    else byId.get(host)?.children.push(vn);
  };
  for (const n of model.nodes) {
    const vn = byId.get(n.id);
    if (vn && !placement.promoted.has(n.id)) placeInto(vn);
  }
  for (const n of model.nodes) {
    const vn = byId.get(n.id);
    if (vn && placement.promoted.has(n.id)) placeInto(vn);
  }
  return roots;
}

/** Shared markers: visible parents that are not the placement host. */
function markSharedMembers(
  model: DiagramModel,
  hierarchy: HierarchyIndex,
  byId: ReadonlyMap<string, ViewNode>,
  hostOf: ReadonlyMap<string, string | null>,
): void {
  for (const n of model.nodes) {
    if (!byId.has(n.id)) continue;
    const parents = hierarchy.parentsOf.get(n.id) ?? [];
    if (parents.length < 2) continue;
    for (const p of parents) {
      if (p !== hostOf.get(n.id) && byId.has(p)) byId.get(p)?.sharedMembers.push(n.id);
    }
  }
}
