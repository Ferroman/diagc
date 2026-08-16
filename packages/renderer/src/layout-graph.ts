import type { CompiledView, LayoutSettings, ViewNode } from '@diagramming/core';

/** An elk edge after lifting: both endpoints are direct children of the owner. */
export interface LiftedEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export const COLLAPSED_SIZE = { width: 200, height: 88 } as const;

export interface ElkPoint {
  x: number;
  y: number;
}
export interface ElkEdgeSection {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}
export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  // elk reserves label space only when `text` is non-empty (width/height alone
  // are ignored), so the trigger text rides along with the footprint.
  labels?: { width: number; height: number; text: string }[];
}
// elk populates `sections` (with routing waypoints) on OUTPUT edges only; typed
// separately so the INPUT graph stays assignable to elk's ElkNode.
export type ElkRoutedEdge = ElkEdge & { sections?: ElkEdgeSection[] };
export interface ElkShape {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkShape[];
  layoutOptions?: Record<string, string>;
  edges?: ElkEdge[];
}

/**
 * Algorithms that read edges but cannot see through a container wall, so they
 * need per-level lifted edges and a per-container algorithm option.
 *
 * `layered` is absent because it implements INCLUDE_CHILDREN itself and does it
 * better; `rectpacking` because it ignores edges by design. Lifting measurably
 * degrades both — see the design note's table.
 */
export const NESTED_LAYOUT_ALGORITHMS = new Set(['force', 'stress', 'mrtree', 'radial']);

export function usesNestedLayout(settings?: LayoutSettings): boolean {
  return NESTED_LAYOUT_ALGORITHMS.has(settings?.algorithm ?? 'layered');
}

/**
 * The root elk `layoutOptions`, tuned for fewer crossings, straighter alignment,
 * roomier spacing, and label-aware placement. Pure (no elk call) so it is
 * unit-testable. Per-plane `settings` override algorithm/direction/spacing and
 * opt into orthogonal edge routing.
 */
export function layoutOptionsFor(settings?: LayoutSettings): Record<string, string> {
  const algorithm = settings?.algorithm ?? 'layered';
  const spacing = settings?.spacing;
  const nodeNode = spacing !== undefined ? String(spacing) : '40';
  const betweenLayers = spacing !== undefined ? String(Math.round(spacing * 1.5)) : '60';

  const opts: Record<string, string> = {
    'elk.algorithm': algorithm,
    'elk.direction': settings?.direction ?? 'RIGHT',
    'elk.spacing.nodeNode': nodeNode,
    'elk.spacing.edgeNode': '20',
    'elk.spacing.edgeEdge': '12',
    'elk.spacing.componentComponent': '48',
    'elk.spacing.edgeLabel': '6',
    'elk.separateConnectedComponents': 'true',
    // INCLUDE_CHILDREN asks elk to lay out every nesting level as one graph,
    // which ONLY `layered` implements. The others silently ignore it and lay
    // out each level alone, which is why they get lifted per-level edges
    // instead (liftEdges). Sending it anyway is not harmless: it is the reason
    // the option list looked interchangeable for so long.
    ...(usesNestedLayout(settings) ? {} : { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' }),
  };

  // layered-only knobs — harmless to other algorithms but kept off the record
  // for cleanliness / testability.
  if (algorithm === 'layered') {
    opts['elk.layered.spacing.nodeNodeBetweenLayers'] = betweenLayers;
    opts['elk.layered.thoroughness'] = '10';
    opts['elk.layered.crossingMinimization.strategy'] = 'LAYER_SWEEP';
    opts['elk.layered.nodePlacement.strategy'] = 'BRANDES_KOEPF';
    opts['elk.layered.nodePlacement.bk.fixedAlignment'] = 'BALANCED';
  }

  if (settings?.edgeRouting === 'orthogonal') {
    opts['elk.edgeRouting'] = 'ORTHOGONAL';
  }

  return opts;
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
