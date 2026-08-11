import type { DiagramModel } from './types';
import type { CompiledView, ViewNode } from './view/types';

/**
 * Build a parent → children index over a set of containment edges. Shared by the
 * two cycle detectors — mutate's BFS-reachability guard (`wouldCycle`) and
 * validate's DFS-coloring check (`findContainmentCycle`) — which agree on this
 * map shape even though they walk it differently. Absent parents (nodes with no
 * children) do not appear; callers read with `?? []`.
 */
export function childrenOf(edges: DiagramModel['containment']): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    children.set(e.parent, [...(children.get(e.parent) ?? []), e.child]);
  }
  return children;
}

/**
 * Per-node hidden-descendant counts over a compiled view, for the collapse
 * badge (`hiddenCount` on collapsed containers). A node's "hidden" set is
 * exactly the model nodes that are not visible in the compiled view; each is
 * attributed to the collapsed visible container that absorbed it. The compiled
 * view does not expose anchors, so this approximates by subtree size: for a
 * collapsed visible container, hidden descendants = reachable containment
 * descendants that are not visible. Uses the shared `childrenOf` containment
 * index — hierarchy knowledge lives in core, not the renderer.
 */
export function countAnchored(model: DiagramModel, view: CompiledView): Map<string, number> {
  const visible = new Set<string>();
  const walk = (n: ViewNode) => {
    visible.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  const counts = new Map<string, number>();
  const children = childrenOf(model.containment);
  const countHidden = (id: string): number => {
    let n = 0;
    for (const c of children.get(id) ?? []) {
      if (!visible.has(c)) n += 1 + countHidden(c);
    }
    return n;
  };
  for (const id of visible) counts.set(id, countHidden(id));
  return counts;
}
