import { LEAF_SIZE, RESERVED_NODE_ID, type CompiledView, type LayoutSettings, type ViewEdge, type ViewNode } from '@diagc/core';
import { ACTIVITY_LAYOUT } from './activity-frame';
import { EDGE_LABEL_MAX_CHARS } from './label-size';

/** An elk edge after lifting: both endpoints are direct children of the owner. */
export interface LiftedEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export const COLLAPSED_SIZE = { width: 200, height: 88 } as const;

/**
 * What the layout is told about one node: the size it is DRAWN at, plus any room
 * elk must keep free beneath it for something that hangs outside the box — an
 * image node's caption. The strip is part of the node's elk footprint and is
 * taken back off the reported geometry (`layoutView`), so React Flow still sizes
 * the node to its picture while neighbours, edges and container walls stay off
 * the text.
 */
export interface SizeHint {
  width: number;
  height: number;
  reserveBottom?: number;
}

/** The box elk lays out for a hinted node: drawn size plus the reserved strip. */
export function footprint(size: SizeHint): { width: number; height: number } {
  return { width: size.width, height: size.height + (size.reserveBottom ?? 0) };
}

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
  labels?: { width: number; height: number; text: string; layoutOptions?: Record<string, string> }[];
}
// elk populates `sections` (with routing waypoints) on OUTPUT edges only; typed
// separately so the INPUT graph stays assignable to elk's ElkNode. `container`
// names the node whose coordinate system the sections are expressed in — under
// INCLUDE_CHILDREN that is the endpoints' lowest common ancestor, NOT the node
// the edge was declared on.
export type ElkRoutedEdge = ElkEdge & {
  sections?: ElkEdgeSection[];
  container?: string;
  /** on the way out elk has placed each label box (same frame as `sections`) */
  labels?: { x?: number; y?: number; width?: number; height?: number }[];
};
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

/** The flow direction when the settings name none. Callers that know the model
 * resolve `defaultLayoutDirection(model)` into the settings first (useViewLayout);
 * this is what that resolves to for everything but an activity model. */
export const FALLBACK_DIRECTION = 'DOWN';

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
  // Layers sit as far apart as the boxes within one. It used to be 1.5x, which
  // read as loose once boxes took their real (34–50px tall) size — and elk pays
  // the between-layers gap TWICE around every labelled edge, whose label takes
  // a layer of its own, so the extra half was mostly spent on air around labels.
  const betweenLayers = nodeNode;

  const opts: Record<string, string> = {
    'elk.algorithm': algorithm,
    'elk.direction': settings?.direction ?? FALLBACK_DIRECTION,
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
    // Wrapping is a layered concept (the other algorithms have no layers to
    // wrap). Opt-in per plane: a default would move every existing diagram
    // and the committed docs PNGs. MULTI_EDGE was the only strategy that
    // reined a long chain in (spec § Spike evidence); SINGLE_EDGE barely moved.
    if (settings?.aspectRatio !== undefined) {
      opts['elk.layered.wrapping.strategy'] = 'MULTI_EDGE';
      opts['elk.aspectRatio'] = String(settings.aspectRatio);
    }
  }

  // Always orthogonal, whichever way the edges are then DRAWN (soft or sharp
  // corners, see DiagramEdge): it is layered's own default, so naming it moves
  // nothing, and it is the one router elk applies consistently — asked for
  // SPLINES or POLYLINE it still hands back right-angled waypoints for every
  // edge that crosses a container wall.
  if (algorithm === DEFAULT_ALGORITHM || settings?.edgeRouting === 'orthogonal') {
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

export interface Pad {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Room an ordinary container keeps around its children: a 36px header band for
 * the title, 16px elsewhere. */
export const CONTAINER_PAD: Pad = { top: 36, left: 16, bottom: 16, right: 16 };
// Activity chrome puts its title somewhere else, so the generic padding is wrong
// on two sides at once: a lane's name runs down a strip on its LEFT edge (content
// at 16px sat on top of it) and nothing heads it (36px of dead height); a frame
// is only its own title strip plus the lanes, which the band pass
// (activity-frame.ts) then stretches edge to edge.
const LANE_PAD: Pad = {
  top: ACTIVITY_LAYOUT.PAD,
  left: ACTIVITY_LAYOUT.LANE_STRIP_W + ACTIVITY_LAYOUT.PAD,
  bottom: ACTIVITY_LAYOUT.PAD,
  right: ACTIVITY_LAYOUT.PAD,
};
const FRAME_PAD: Pad = { top: 0, left: ACTIVITY_LAYOUT.TITLE_STRIP_W, bottom: 0, right: 0 };

/** The room `n` keeps around its children. Numbers, not just an elk option,
 * because `layoutView` embeds separately arranged insides by hand and must leave
 * exactly the room elk would. */
export function containerPad(n: ViewNode): Pad {
  if (n.node.type === 'activity-lane') return LANE_PAD;
  if (n.node.type === 'activity-frame') return FRAME_PAD;
  return CONTAINER_PAD;
}

const elkPadding = (p: Pad): string => `[top=${p.top}.0,left=${p.left}.0,bottom=${p.bottom}.0,right=${p.right}.0]`;
const NO_PADDING = elkPadding({ top: 0, left: 0, bottom: 0, right: 0 });

/**
 * Gap between independently arranged blocks (pack.ts). Both values follow a
 * plane's `spacing` the way the layer gap does, so one setting loosens or
 * tightens the whole picture.
 *
 * Connected parts sit a little further apart than the boxes inside them (the
 * root `componentComponent` spacing), so the eye separates the groups. A level
 * of nothing but loose single boxes is a list, not a set of groups: it takes the
 * plain node spacing, and so matches a same-layer stack elk drew right beside it.
 */
export function componentGap(settings: LayoutSettings | undefined, looseBoxesOnly: boolean): number {
  const node = settings?.spacing ?? 40;
  return looseBoxesOnly ? node : Math.round(node * 1.2);
}

/**
 * Parts of the view that `layoutView` arranged separately (see layout-plan.ts)
 * and that this graph must therefore treat as opaque, fixed-size boxes. Flat
 * (layered) path only.
 */
export interface GraphSubstitutions {
  /** the nodes forming this graph's top level — one connected group, not
   * necessarily the view's roots */
  roots: readonly ViewNode[];
  /** unfolded containers whose whole inside was arranged separately: emitted as
   * leaves of this (padding-inclusive) size */
  prelaid: ReadonlyMap<string, { width: number; height: number }>;
  /** per container: the children standing apart from its connected part,
   * replaced by ONE synthetic leaf the size of their packed block */
  packs: ReadonlyMap<string, { id: string; width: number; height: number; members: ReadonlySet<string> }>;
}

/** The per-graph spacing subset of a root option record (`elk.spacing.*` and
 * `elk.layered.spacing.*`) — the options elk never inherits into a container. */
function spacingOptionsOf(options: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(options).filter(([k]) => k.includes('.spacing.')));
}

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

// A label rides ON its edge: elk makes the label box a stop on the route and
// runs the line through its centre, where the chip then masks it. Left to its
// default elk parks the box BESIDE the line, and a label floating in the gap
// between two parallel arrows reads as belonging to either.
const INLINE_LABEL = { 'elk.edgeLabels.inline': 'true' };

function edgeLabelBox(text: string): { width: number; height: number } | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  // the chip is ellipsised at EDGE_LABEL_MAX_CHARS, so no more room than that
  const chars = Math.min([...t].length, EDGE_LABEL_MAX_CHARS);
  return { width: Math.round(chars * EDGE_LABEL_CHAR + EDGE_LABEL_PAD), height: EDGE_LABEL_HEIGHT };
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
  sizes: ReadonlyMap<string, SizeHint> | undefined,
  settings: LayoutSettings | undefined,
  opts?: { flat?: boolean; substitute?: GraphSubstitutions; partitions?: ReadonlyMap<string, number> },
): { graph: ElkShape; lifted: boolean } {
  const substitute = opts?.substitute;
  const partitions = opts?.partitions !== undefined && opts.partitions.size > 0 ? opts.partitions : undefined;
  // A substituted graph is a block to embed, not a canvas: elk's default 12px
  // root padding would become a stray margin around every embedded block.
  const rootOptions = {
    ...layoutOptionsFor(settings),
    ...(substitute !== undefined ? { 'elk.padding': NO_PADDING } : {}),
    // A notation that derives an ORDER for its nodes (second-order thinking)
    // pins each to it: partition k is laid out strictly before k+1, so a node
    // cannot sink toward the only thing it feeds. Root nodes only — a partition
    // is relative to the graph that owns the node.
    ...(partitions !== undefined ? { 'elk.partitioning.activate': 'true' } : {}),
  };
  const nested = usesNestedLayout(settings) && opts?.flat !== true;
  const byOwner = nested ? liftEdges(view) : undefined;

  // On the nested path each level is a separate layout run and inherits
  // nothing, so a container needs the full option set.
  //
  // On the flat path INCLUDE_CHILDREN makes the whole tree ONE run, and the
  // run-wide knobs (algorithm, direction, crossing/placement strategy) do come
  // from the root. Spacing does not: elk reads every `*.spacing.*` option per
  // graph, off the node that owns that graph, so a bare container laid its
  // interior out at elk's 20/20 defaults while the root used 40/60 — and a
  // plane's `spacing` setting only ever moved the top level. So a flat-path
  // container carries the spacing subset, and nothing else: an `elk.algorithm`
  // here would end the hierarchical run at this container.
  //
  // Padding is applied AFTER the spread so the container-specific value wins:
  // `layoutOptionsFor` never emits `elk.padding` today, but if it ever did, a
  // container would silently lose its 36px header room and the title would
  // overlap its children. elk is indifferent to key order.
  const sharedContainerOptions = nested ? rootOptions : spacingOptionsOf(rootOptions);
  const containerOptions = (n: ViewNode): Record<string, string> => ({
    ...sharedContainerOptions,
    'elk.padding': elkPadding(containerPad(n)),
  });

  let attachedToContainer = false;

  // every id this graph emits — an edge survives substitution only when both of
  // its endpoints did (the rest live inside a block arranged elsewhere)
  const emitted = new Set<string>();

  const toNode = (n: ViewNode): ElkShape => {
    emitted.add(n.id);
    const prelaid = substitute?.prelaid.get(n.id);
    if (prelaid !== undefined) return { id: n.id, width: prelaid.width, height: prelaid.height };
    const pack = substitute?.packs.get(n.id);
    if (pack !== undefined) {
      return {
        id: n.id,
        children: [
          ...n.children.filter((c) => !pack.members.has(c.id)).map(toNode),
          { id: pack.id, width: pack.width, height: pack.height },
        ],
        layoutOptions: containerOptions(n),
      };
    }
    if (n.state === 'expanded') {
      const own = byOwner?.get(n.id);
      const hasOwn = own !== undefined && own.length > 0;
      if (hasOwn) attachedToContainer = true;
      return {
        id: n.id,
        children: n.children.map(toNode),
        layoutOptions: containerOptions(n),
        ...(hasOwn ? { edges: own } : {}),
      };
    }
    // A folded container is a titled box, never its leaf form (an image override
    // only makes sense for a leaf, where the picture IS the body) — so a size
    // reaching here for one must be a FOLDED-box size. `withBoxSizes` guarantees
    // that for the view path by replacing any leaf hint on a folded node;
    // `COLLAPSED_SIZE` is the fallback for callers that pass no sizes at all.
    if (n.state === 'collapsed') {
      const folded = sizes?.get(n.id) ?? COLLAPSED_SIZE;
      return { id: n.id, width: folded.width, height: folded.height };
    }
    return { id: n.id, ...footprint(sizes?.get(n.id) ?? LEAF_SIZE) };
  };

  const pinned = (shape: ElkShape): ElkShape => {
    const p = partitions?.get(shape.id);
    return p === undefined ? shape : { ...shape, layoutOptions: { ...shape.layoutOptions, 'elk.partitioning.partition': String(p) } };
  };
  // Lifted edges carry no label box. A raised edge stands for every relation
  // between two subtrees, so no single label belongs to it, and elk's force and
  // stress do not reserve label space the way layered does. Recorded in
  // DEFERRALS.md rather than faked.
  // built before the edges are — `toNode` is what fills `emitted`, and what
  // discovers container-owned edges for the `lifted` flag below
  const children = (substitute?.roots ?? view.roots).map((n) => pinned(toNode(n)));

  const rootEdges: ElkEdge[] = nested
    ? (byOwner?.get(null) ?? [])
    : view.layoutEdges
        .filter((e) => e.from !== e.to && (substitute === undefined || (emitted.has(e.from) && emitted.has(e.to))))
        .map((e) => {
          const text = edgeLabelText(e).trim();
          const box = edgeLabelBox(text);
          return {
            id: e.id,
            sources: [e.from],
            targets: [e.to],
            ...(box !== undefined ? { labels: [{ ...box, text, layoutOptions: INLINE_LABEL }] } : {}),
          };
        });

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
      id: RESERVED_NODE_ID,
      layoutOptions: rootOptions,
      children,
      edges: rootEdges,
    },
    lifted,
  };
}
