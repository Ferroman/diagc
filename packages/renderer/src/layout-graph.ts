import { LEAF_SIZE, type CompiledView, type LayoutSettings, type ViewEdge, type ViewNode } from '@diagramming/core';

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

/** elk's default and ours: the one algorithm assumed to lay out anything we can
 * build, which is what makes it usable as `layoutView`'s last-resort attempt. */
export const DEFAULT_ALGORITHM = 'layered';

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
  return NESTED_LAYOUT_ALGORITHMS.has(settings?.algorithm ?? DEFAULT_ALGORITHM);
}

/**
 * The root elk `layoutOptions`, tuned for fewer crossings, straighter alignment,
 * roomier spacing, and label-aware placement. Pure (no elk call) so it is
 * unit-testable. Per-plane `settings` override algorithm/direction/spacing and
 * opt into orthogonal edge routing.
 */
export function layoutOptionsFor(settings?: LayoutSettings): Record<string, string> {
  const algorithm = settings?.algorithm ?? DEFAULT_ALGORITHM;
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
  if (algorithm === DEFAULT_ALGORITHM) {
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

const CONTAINER_PADDING = '[top=36.0,left=16.0,bottom=16.0,right=16.0]';

// Edge-label footprint fed into elk so it reserves room and neighbours don't
// overlap the label. Approximate: the drawn label is a ~10px-font chip, so a
// per-char width plus horizontal padding lands close to the real box.
const EDGE_LABEL_CHAR = 6;
const EDGE_LABEL_PAD = 12;
const EDGE_LABEL_HEIGHT = 18;

/** The widest single label an edge carries (aggregate edges expose one joined
 * `label`; a sole relation exposes its positioned `labels`). Empty ⇒ no label. */
export function edgeLabelText(e: ViewEdge): string {
  if (e.labels !== undefined && e.labels.length > 0) {
    return e.labels.reduce((widest, l) => (l.text.length > widest.length ? l.text : widest), '');
  }
  return e.label ?? '';
}

function edgeLabelBox(text: string): { width: number; height: number } | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  return { width: Math.round(t.length * EDGE_LABEL_CHAR + EDGE_LABEL_PAD), height: EDGE_LABEL_HEIGHT };
}

/**
 * The elk input graph.
 *
 * Two shapes, picked by `usesNestedLayout`. The flat one (layered, rectpacking)
 * hangs every edge off the root and lets INCLUDE_CHILDREN flatten the tree. The
 * nested one gives each container its own lifted edges and its own copy of the
 * layout options, because elk inherits neither into children.
 *
 * `opts.flat` forces the flat shape regardless — layoutView's fallback for an
 * algorithm that rejects the lifted graph outright (radial throws on any graph
 * that is not a tree).
 *
 * Returns the graph alongside `lifted`: whether this build actually restructured
 * the edge set (see the flag's own comment below). `layoutView` keys route
 * collection off it, because only an unrestructured graph yields waypoints that
 * describe the edges the renderer draws.
 */
export function buildGraph(
  view: CompiledView,
  sizes: Map<string, { width: number; height: number }> | undefined,
  settings: LayoutSettings | undefined,
  opts?: { flat?: boolean },
): { graph: ElkShape; lifted: boolean } {
  const rootOptions = layoutOptionsFor(settings);
  const nested = usesNestedLayout(settings) && opts?.flat !== true;
  const byOwner = nested ? liftEdges(view) : undefined;

  // On the flat path a container carries padding only: INCLUDE_CHILDREN means
  // elk lays the whole tree out as one graph, so the root's options already
  // govern every level. On the nested path each level is a separate layout run
  // and inherits nothing, so it needs the full set.
  //
  // Padding is applied AFTER rootOptions so the container-specific value wins:
  // `layoutOptionsFor` never emits `elk.padding` today, but if it ever did, a
  // container would silently lose its 36px header room and the title would
  // overlap its children. elk is indifferent to key order.
  const containerOptions = nested
    ? { ...rootOptions, 'elk.padding': CONTAINER_PADDING }
    : { 'elk.padding': CONTAINER_PADDING };

  let attachedToContainer = false;

  const toNode = (n: ViewNode): ElkShape => {
    if (n.state === 'expanded') {
      const own = byOwner?.get(n.id);
      const hasOwn = own !== undefined && own.length > 0;
      if (hasOwn) attachedToContainer = true;
      return {
        id: n.id,
        children: n.children.map(toNode),
        layoutOptions: containerOptions,
        ...(hasOwn ? { edges: own } : {}),
      };
    }
    // collapsed containers keep the fixed collapsed size — an image override
    // only makes sense for a leaf, where the picture IS the body
    if (n.state === 'collapsed') return { id: n.id, width: COLLAPSED_SIZE.width, height: COLLAPSED_SIZE.height };
    const size = sizes?.get(n.id) ?? LEAF_SIZE;
    return { id: n.id, width: size.width, height: size.height };
  };

  // Lifted edges carry no label box. A raised edge stands for every relation
  // between two subtrees, so no single label belongs to it, and elk's force and
  // stress do not reserve label space the way layered does. Recorded in
  // DEFERRALS.md rather than faked.
  const rootEdges: ElkEdge[] = nested
    ? (byOwner?.get(null) ?? [])
    : view.layoutEdges
        .filter((e) => e.from !== e.to)
        .map((e) => {
          const text = edgeLabelText(e).trim();
          const box = edgeLabelBox(text);
          return {
            id: e.id,
            sources: [e.from],
            targets: [e.to],
            ...(box !== undefined ? { labels: [{ ...box, text }] } : {}),
          };
        });

  // built before `lifted` is read — `toNode` is what discovers container-owned edges
  const children = view.roots.map(toNode);

  // Did this build restructure the edge set, so that elk's output sections stop
  // describing the edges the renderer draws? Two ways it can:
  //
  //  - an edge moved onto a container, whose sections we would have to attribute
  //    to a sub-layout run that elk does not route across levels; or
  //  - an endpoint was RAISED to an ancestor. Two containers joined by a single
  //    leaf-to-leaf edge produce no container-owned edges at all, yet the root
  //    edge now runs container-to-container — its waypoints stop at the two
  //    container borders, nowhere near the leaves the renderer connects.
  //
  // Neither happens on the flat path, nor on a nested run over a view whose
  // containers no edge touches (a container-free diagram being the obvious
  // case), and there the sections are honest and worth keeping.
  const raisesEndpoint = (): boolean => {
    const original = new Map(view.layoutEdges.map((e) => [e.id, e] as const));
    return rootEdges.some((e) => {
      const o = original.get(e.id);
      return o === undefined || e.sources[0] !== o.from || e.targets[0] !== o.to;
    });
  };
  const lifted = attachedToContainer || (nested && raisesEndpoint());

  return {
    graph: {
      id: '__root__',
      layoutOptions: rootOptions,
      children,
      edges: rootEdges,
    },
    lifted,
  };
}
