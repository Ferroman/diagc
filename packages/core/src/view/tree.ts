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

export function buildViewTree(m: DiagramModel, h: HierarchyIndex, lod: LodState): ViewTree {
  const stateOf = (id: string): NodeViewState =>
    (h.childrenOf.get(id) ?? []).length === 0 ? 'leaf' : (lod[id] ?? 'collapsed');

  const visible = new Set<string>();
  const hostOf = new Map<string, string | null>();
  const promoted = new Set<string>();
  for (const r of h.roots) {
    visible.add(r);
    hostOf.set(r, null);
  }

  const absorbersOf = (id: string, memo: Map<string, Set<string>>): Set<string> => {
    const hit = memo.get(id);
    if (hit) return hit;
    const acc = new Set<string>();
    memo.set(id, acc); // pre-set guards diamond re-entry (containment is a DAG)
    for (const p of h.parentsOf.get(id) ?? []) {
      if (visible.has(p)) acc.add(p);
      else for (const a of absorbersOf(p, memo)) acc.add(a);
    }
    return acc;
  };

  const commonHost = (absorbers: Set<string>): string | null => {
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
  };

  // Reveal children of visible expanded nodes; then promote hidden shared
  // nodes spanning >=2 visible groups; repeat until stable. Within a round,
  // only "membership-maximal" candidates promote: a candidate with a hidden
  // ancestor that is itself a candidate waits — once the ancestor is visible,
  // the descendant usually resolves to a single absorber (it lives inside the
  // promoted container) instead of being wrongly promoted next to it.
  for (;;) {
    let placed = true;
    while (placed) {
      placed = false;
      for (const n of m.nodes) {
        if (visible.has(n.id)) continue;
        const host = (h.parentsOf.get(n.id) ?? []).find(
          (p) => visible.has(p) && stateOf(p) === 'expanded',
        );
        if (host !== undefined) {
          visible.add(n.id);
          hostOf.set(n.id, host);
          placed = true;
        }
      }
    }
    const memo = new Map<string, Set<string>>();
    const candidates = m.nodes.filter(
      (n) => !visible.has(n.id) && absorbersOf(n.id, memo).size >= 2,
    );
    if (candidates.length === 0) break;
    const candidateIds = new Set(candidates.map((n) => n.id));
    const hasCandidateAncestor = (id: string): boolean => {
      const seen = new Set<string>();
      const stack = [...(h.parentsOf.get(id) ?? [])];
      while (stack.length > 0) {
        const p = stack.pop();
        if (p === undefined || seen.has(p)) continue;
        seen.add(p);
        if (candidateIds.has(p)) return true;
        if (!visible.has(p)) stack.push(...(h.parentsOf.get(p) ?? []));
      }
      return false;
    };
    // A DAG always has a maximal candidate, so this round promotes >=1 node.
    for (const n of candidates.filter((c) => !hasCandidateAncestor(c.id))) {
      promoted.add(n.id);
      visible.add(n.id);
      hostOf.set(n.id, commonHost(absorbersOf(n.id, memo)));
    }
  }

  // Anchors for hidden nodes (unique by construction: >=2 would have promoted).
  const anchorOf = new Map<string, string>();
  const finalMemo = new Map<string, Set<string>>();
  for (const n of m.nodes) {
    if (visible.has(n.id)) continue;
    const [anchor] = absorbersOf(n.id, finalMemo);
    if (anchor !== undefined) anchorOf.set(n.id, anchor);
  }

  // Assemble ViewNodes in model order.
  const byId = new Map<string, ViewNode>();
  for (const n of m.nodes) {
    if (!visible.has(n.id)) continue;
    byId.set(n.id, {
      id: n.id,
      node: n,
      state: stateOf(n.id),
      children: [],
      promoted: promoted.has(n.id),
      sharedMembers: [],
    });
  }
  // Two passes so promoted nodes land AFTER normally-placed siblings within
  // each roots/children list, each group internally in model order.
  const roots: ViewNode[] = [];
  const placeInto = (vn: ViewNode): void => {
    const host = hostOf.get(vn.id) ?? null;
    if (host === null) roots.push(vn);
    else byId.get(host)?.children.push(vn);
  };
  for (const n of m.nodes) {
    const vn = byId.get(n.id);
    if (vn && !promoted.has(n.id)) placeInto(vn);
  }
  for (const n of m.nodes) {
    const vn = byId.get(n.id);
    if (vn && promoted.has(n.id)) placeInto(vn);
  }

  // Shared markers: visible parents that are not the placement host.
  for (const n of m.nodes) {
    if (!byId.has(n.id)) continue;
    const parents = h.parentsOf.get(n.id) ?? [];
    if (parents.length < 2) continue;
    for (const p of parents) {
      if (p !== hostOf.get(n.id) && byId.has(p)) byId.get(p)?.sharedMembers.push(n.id);
    }
  }

  return { roots, byId, anchorOf, hostOf };
}
