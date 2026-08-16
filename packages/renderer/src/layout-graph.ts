import type { CompiledView, ViewNode } from '@diagramming/core';

/** An elk edge after lifting: both endpoints are direct children of the owner. */
export interface LiftedEdge {
  id: string;
  sources: string[];
  targets: string[];
}

/**
 * Group every layout edge under the container that owns it — the lowest common
 * ancestor of its endpoints — with both endpoints raised to that container's
 * DIRECT children. A `null` key means the root graph.
 *
 * Why raise the endpoints rather than leave them pointing at the real nodes:
 * elk's non-hierarchical algorithms (force, stress, mrtree, radial) cannot see
 * through a container wall. An edge aimed at a deep descendant is invisible to
 * them, so every level would be laid out with an empty edge set and collapse
 * into plain packing. Raising turns a cross-container edge into a real edge
 * between two siblings, which is what gives a force layout something to pull
 * on. The lifted edge is a layout-only construct — the renderer still draws the
 * true endpoints.
 */
export function liftEdges(view: CompiledView): Map<string | null, LiftedEdge[]> {
  const parent = new Map<string, string | null>();
  const walk = (n: ViewNode, p: string | null) => {
    parent.set(n.id, p);
    n.children.forEach((c) => walk(c, n.id));
  };
  view.roots.forEach((r) => walk(r, null));

  // root-first, so two chains sharing a prefix share those ancestors
  const chainOf = (id: string): string[] => {
    const out: string[] = [];
    let cur: string | null | undefined = id;
    while (cur !== null && cur !== undefined) {
      out.push(cur);
      cur = parent.get(cur);
    }
    return out.reverse();
  };

  const byOwner = new Map<string | null, LiftedEdge[]>();
  for (const e of view.layoutEdges) {
    const a = chainOf(e.from);
    const b = chainOf(e.to);
    if (a.length === 0 || b.length === 0) continue; // endpoint not in this view
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    // a[i - 1] is the last shared ancestor; i === 0 means the two share none,
    // so the edge belongs to the root graph.
    const owner = i === 0 ? null : a[i - 1]!;
    const from = a[i];
    const to = b[i];
    // Either is undefined when one endpoint IS the ancestor of the other, and
    // they are equal when both raise to the same child. Both raise to a
    // self-loop on the container, which elk rejects and which constrains
    // nothing — the existing flat path drops these too (`e.from !== e.to`).
    if (from === undefined || to === undefined || from === to) continue;
    const list = byOwner.get(owner) ?? [];
    list.push({ id: e.id, sources: [from], targets: [to] });
    byOwner.set(owner, list);
  }
  return byOwner;
}
