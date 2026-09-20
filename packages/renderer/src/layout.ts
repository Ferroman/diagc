import ELK from 'elkjs/lib/elk.bundled.js';
import { LEAF_SIZE, RESERVED_NODE_ID, type CompiledView, type LayoutSettings, type ViewNode } from '@diagc/core';
import {
  buildGraph,
  COLLAPSED_SIZE,
  componentGap,
  containerPad,
  DEFAULT_ALGORITHM,
  edgeLabelText,
  FALLBACK_DIRECTION,
  footprint,
  type ElkRoutedEdge,
  type ElkShape,
  type GraphSubstitutions,
  type Pad,
  type SizeHint,
} from './layout-graph';
import { planLayout, type LayoutPlan, type LevelPlan } from './layout-plan';
import { packBoxes } from './pack';

// Re-exported so `index.tsx` and existing importers keep their import path.
export { COLLAPSED_SIZE, layoutOptionsFor } from './layout-graph';

export interface NodeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgePoint {
  x: number;
  y: number;
}

export interface LayoutExtras {
  /** node id → layer partition, from a notation that derives an order for its
   * nodes (NotationProfile.partitionOf). Forces ONE layered run: component
   * packing arranges disconnected parts as separate blocks, whose rows would
   * not line up with each other. */
  partitions?: ReadonlyMap<string, number>;
}

export interface LayoutResult {
  /** parent-relative node geometry (elk output), keyed by node id */
  geometry: Map<string, NodeGeometry>;
  /** elk-routed absolute waypoints per edge id. Populated whenever the graph
   * handed to elk kept every edge between its true endpoints (`buildGraph`'s
   * `lifted` flag) and the algorithm routes at all: always for `layered`, and
   * for the others only when `edgeRouting: 'orthogonal'` asks. Otherwise empty,
   * and the renderer floats its edges. */
  routes: Map<string, EdgePoint[]>;
  /** where elk put each labelled edge's label (its CENTRE, absolute), keyed like
   * `routes`. elk reserves that spot — nothing else is routed through it — which
   * the midpoint of the line cannot promise. Absent for an unlabelled edge. */
  labelSpots: Map<string, EdgePoint>;
  /** The algorithm this arrangement was actually produced with. Differs from the
   * requested one when that one could not lay the graph out at all (see
   * `layoutView`), so a caller can say so instead of presenting the fallback as
   * the user's pick. */
  algorithm: string;
  /** Nodes whose place IS the notation's structure, so nothing may move them —
   * no drag, nudge or align, and a saved position for one is ignored. A
   * fishbone's lines end on OTHER LINES (a bone on the spine, a cause line on
   * its bone), not on boxes: a moved node cannot take them along, and floating
   * them box to box draws a different diagram. Absent = everything may move,
   * which is elk's answer and git-graph's (a floated commit link still reads). */
  fixed?: ReadonlySet<string>;
}

const elk = new ELK();
const cache = new Map<string, LayoutResult>();
const CACHE_CAP = 50;

function settingsKey(settings?: LayoutSettings): string {
  if (settings === undefined) return '';
  // stable order so equivalent settings hit the same cache entry
  const parts = [
    settings.algorithm ?? '',
    settings.direction ?? '',
    settings.spacing ?? '',
    settings.edgeRouting ?? '',
    settings.aspectRatio ?? '',
  ];
  return `!${parts.join(',')}`;
}

function signature(
  view: CompiledView,
  sizes?: ReadonlyMap<string, SizeHint>,
  settings?: LayoutSettings,
  partitions?: ReadonlyMap<string, number>,
): string {
  const nodes: string[] = [];
  const walk = (n: ViewNode) => {
    nodes.push(`${n.id}:${n.state}`);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  // an edge's reserved footprint depends on its label length, so fold that into
  // the key — editing a label must re-layout, not serve a stale arrangement.
  const edges = view.layoutEdges
    .map((e) => {
      const t = edgeLabelText(e).trim();
      return t === '' ? e.id : `${e.id}~${t.length}`;
    })
    .join('|');
  const sized =
    sizes === undefined || sizes.size === 0
      ? ''
      : `@${[...sizes.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, s]) => `${id}:${s.width}x${s.height}${s.reserveBottom !== undefined ? `+${s.reserveBottom}` : ''}`)
          .join('|')}`;
  const pinned =
    partitions === undefined || partitions.size === 0
      ? ''
      : `%${[...partitions.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, p]) => `${id}:${p}`)
          .join('|')}`;
  return `${nodes.join('|')}#${edges}${sized}${settingsKey(settings)}${pinned}`;
}

export async function layoutView(
  view: CompiledView,
  sizeOverrides?: ReadonlyMap<string, SizeHint>,
  settings?: LayoutSettings,
  extra?: LayoutExtras,
): Promise<LayoutResult> {
  const partitions = extra?.partitions !== undefined && extra.partitions.size > 0 ? extra.partitions : undefined;
  const key = signature(view, sizeOverrides, settings, partitions);
  const hit = cache.get(key);
  if (hit) return hit;

  const result =
    (partitions === undefined ? await layoutPlanned(view, sizeOverrides, settings) : undefined) ??
    (await layoutSingleRun(view, sizeOverrides, settings, partitions));
  releaseReserved(view, sizeOverrides, result.geometry);
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}

/** Hand the strips reserved under leaves (`SizeHint.reserveBottom`) back: elk
 * needed them in the footprint, the renderer must not draw them. Leaves only —
 * no other view state reads its hint, so nothing else was padded. */
function releaseReserved(
  view: CompiledView,
  sizes: ReadonlyMap<string, SizeHint> | undefined,
  geometry: Map<string, NodeGeometry>,
): void {
  if (sizes === undefined) return;
  const walk = (n: ViewNode) => {
    const reserve = n.state === 'leaf' ? sizes.get(n.id)?.reserveBottom : undefined;
    const g = geometry.get(n.id);
    if (reserve !== undefined && g !== undefined) geometry.set(n.id, { ...g, height: g.height - reserve });
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
}

/** elk's output tree, read back: parent-relative node geometry, plus — when
 * asked — every routed edge lifted into the tree's absolute space. */
function collectLaid(
  laid: ElkShape,
  wantRoutes: boolean,
  synthetic?: ReadonlySet<string>,
): {
  geometry: Map<string, NodeGeometry>;
  routes: Map<string, EdgePoint[]>;
  labelSpots: Map<string, EdgePoint>;
  origins: Map<string, { x: number; y: number }>;
} {
  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, EdgePoint[]>();
  const labelSpots = new Map<string, EdgePoint>();
  // Node x/y stay parent-relative (React Flow positions children under parentId).
  // Edge sections need lifting into absolute space (what the renderer draws
  // edges in), but NOT by the origin of the node the edge sits on: under
  // INCLUDE_CHILDREN elk re-expresses every routed edge in the coordinate
  // system of its endpoints' lowest common ancestor and names that node in the
  // output edge's `container` field — while the edge itself stays declared on
  // the root, where the flat graph put it. So walk once recording every node's
  // absolute origin, then translate each route by its container's origin,
  // falling back to the declaring node's for an edge elk left in place.
  const origins = new Map<string, { x: number; y: number }>();
  const routed: { e: ElkRoutedEdge; ownX: number; ownY: number }[] = [];
  const collect = (n: ElkShape, absX: number, absY: number) => {
    const ax = absX + (n.x ?? 0);
    const ay = absY + (n.y ?? 0);
    origins.set(n.id, { x: ax, y: ay });
    if (n.id !== RESERVED_NODE_ID && synthetic?.has(n.id) !== true) {
      geometry.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 });
    }
    if (wantRoutes && n.edges !== undefined) {
      for (const e of n.edges as ElkRoutedEdge[]) routed.push({ e, ownX: ax, ownY: ay });
    }
    n.children?.forEach((c) => collect(c, ax, ay));
  };
  collect(laid, 0, 0);
  for (const { e, ownX, ownY } of routed) {
    const sec = e.sections?.[0];
    if (sec === undefined) continue;
    const o = (e.container !== undefined ? origins.get(e.container) : undefined) ?? { x: ownX, y: ownY };
    const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({
      x: o.x + p.x,
      y: o.y + p.y,
    }));
    routes.set(e.id, pts);
    const label = e.labels?.[0];
    if (label?.x !== undefined && label.y !== undefined) {
      labelSpots.set(e.id, { x: o.x + label.x + (label.width ?? 0) / 2, y: o.y + label.y + (label.height ?? 0) / 2 });
    }
  }
  return { geometry, routes, labelSpots, origins };
}

/**
 * An independently arranged piece of the view. Its top-level nodes sit relative
 * to the block's own origin (deeper ones stay parent-relative, as everywhere),
 * and so do its routes — which is what makes a block embeddable: moving it is a
 * shift of `top` and of every route point, nothing else.
 */
interface Block {
  width: number;
  height: number;
  /** ids positioned against the block origin — the ones a move must shift */
  top: string[];
  geometry: Map<string, NodeGeometry>;
  routes: Map<string, EdgePoint[]>;
  labelSpots: Map<string, EdgePoint>;
}

/** Thrown when elk rejects a planned sub-graph: `layoutView` then falls back to
 * the single run. Our own bugs are NOT wrapped in it and surface as themselves. */
class ElkRejected extends Error {}

function shiftBlock(b: Block, dx: number, dy: number): void {
  for (const id of b.top) {
    const g = b.geometry.get(id);
    if (g !== undefined) b.geometry.set(id, { ...g, x: g.x + dx, y: g.y + dy });
  }
  for (const [id, pts] of b.routes) b.routes.set(id, pts.map((p) => ({ x: p.x + dx, y: p.y + dy })));
  for (const [id, p] of b.labelSpots) b.labelSpots.set(id, { x: p.x + dx, y: p.y + dy });
}

/** Move `inner`'s contents into `outer`: its top nodes to (dx,dy) against their
 * new parent, its routes to (absX,absY) in `outer`'s absolute space. */
function embed(outer: Block, inner: Block, at: { dx: number; dy: number; absX: number; absY: number }): void {
  for (const [id, g] of inner.geometry) {
    outer.geometry.set(id, inner.top.includes(id) ? { ...g, x: g.x + at.dx, y: g.y + at.dy } : g);
  }
  for (const [id, pts] of inner.routes) outer.routes.set(id, pts.map((p) => ({ x: p.x + at.absX, y: p.y + at.absY })));
  for (const [id, p] of inner.labelSpots) outer.labelSpots.set(id, { x: p.x + at.absX, y: p.y + at.absY });
}

/**
 * The layered layout with independent parts arranged separately and packed
 * (layout-plan.ts says which, pack.ts how). Returns `undefined` when there is
 * nothing to pack — the common, fully connected diagram — or when elk rejects a
 * sub-graph, and `layoutView` then runs the single graph exactly as before.
 */
async function layoutPlanned(
  view: CompiledView,
  sizes: ReadonlyMap<string, SizeHint> | undefined,
  settings: LayoutSettings | undefined,
): Promise<LayoutResult | undefined> {
  // Only layered skips component packing (it is the one that needs
  // INCLUDE_CHILDREN); the others pack on their own, level by level.
  if ((settings?.algorithm ?? DEFAULT_ALGORITHM) !== DEFAULT_ALGORITHM) return undefined;
  const plan = planLayout(view);
  if (plan.levels.size === 0) return undefined;

  const taken = new Set<string>();
  const note = (n: ViewNode) => {
    taken.add(n.id);
    n.children.forEach(note);
  };
  view.roots.forEach(note);
  const ctx: PlanContext = { view, sizes, settings, plan, taken };

  try {
    const rootLevel = plan.levels.get(null);
    const block = rootLevel !== undefined ? await arrangeLevel(rootLevel, ctx) : await arrangeGroup(view.roots, ctx);
    return { geometry: block.geometry, routes: block.routes, labelSpots: block.labelSpots, algorithm: DEFAULT_ALGORITHM };
  } catch (e) {
    if (e instanceof ElkRejected) return undefined;
    throw e;
  }
}

interface PlanContext {
  view: CompiledView;
  sizes: ReadonlyMap<string, SizeHint> | undefined;
  settings: LayoutSettings | undefined;
  plan: LayoutPlan;
  /** every id in the view, so a synthetic pack id can be proven unique */
  taken: Set<string>;
}

// Targets for a packed block sharing a layer (see arrangeLevel): wide and flat
// for a row, narrow and tall for a column. Not extremes — a dozen loose boxes
// should still fold into a second row/column rather than outgrow the container.
const ALONG_ROW_ASPECT = 4;
const ALONG_COLUMN_ASPECT = 0.4;

/** Arrange each detached group of a level on its own, then pack the blocks. */
async function arrangeLevel(level: LevelPlan, ctx: PlanContext): Promise<Block> {
  const parts: Block[] = [];
  for (const group of level.detached) parts.push(await arrangeGroup(group, ctx));
  const looseBoxesOnly = level.detached.every((g) => g.length === 1 && g[0]!.state !== 'expanded');
  // A level arranged wholly on its own aims at a screen's shape (or the plane's
  // own `aspectRatio`). A block going back INTO a run is different: it will share
  // a layer with the connected nodes, where extent along the layer is nearly free
  // and extent across it pushes every later layer away — so it runs with the
  // layer: down the column when the flow is horizontal, along the row when vertical.
  const direction = ctx.settings?.direction ?? FALLBACK_DIRECTION;
  const aspect =
    level.attached.length > 0
      ? direction === 'DOWN' || direction === 'UP'
        ? ALONG_ROW_ASPECT
        : ALONG_COLUMN_ASPECT
      : ctx.settings?.aspectRatio;
  const packed = packBoxes(parts, {
    gap: componentGap(ctx.settings, looseBoxesOnly),
    ...(aspect !== undefined ? { aspect } : {}),
  });
  const out: Block = {
    width: packed.width,
    height: packed.height,
    top: [],
    geometry: new Map(),
    routes: new Map(),
    labelSpots: new Map(),
  };
  parts.forEach((part, i) => {
    const at = packed.boxes[i]!;
    shiftBlock(part, at.x, at.y);
    for (const [id, g] of part.geometry) out.geometry.set(id, g);
    for (const [id, pts] of part.routes) out.routes.set(id, pts);
    for (const [id, p] of part.labelSpots) out.labelSpots.set(id, p);
    out.top.push(...part.top);
  });
  return out;
}

/** Arrange one connected group of siblings: a single elk run, in which every
 * planned level below is already a fixed-size box. */
async function arrangeGroup(nodes: readonly ViewNode[], ctx: PlanContext): Promise<Block> {
  // Resolve the planned levels inside this group first — elk needs their sizes.
  const prelaid = new Map<string, { width: number; height: number }>();
  const packs = new Map<string, { id: string; width: number; height: number; members: ReadonlySet<string> }>();
  const inner = new Map<string, Block>(); // keyed by the box standing in for it: a container id, or a pack id
  const pads = new Map<string, Pad>(); // a separately arranged container's own padding
  const resolve = async (n: ViewNode): Promise<void> => {
    if (n.state !== 'expanded') return;
    const level = ctx.plan.levels.get(n.id);
    if (level === undefined) {
      for (const c of n.children) await resolve(c);
      return;
    }
    const block = await arrangeLevel(level, ctx);
    if (level.attached.length === 0) {
      const pad = containerPad(n);
      prelaid.set(n.id, { width: block.width + pad.left + pad.right, height: block.height + pad.top + pad.bottom });
      pads.set(n.id, pad);
      inner.set(n.id, block);
      return;
    }
    let id = `${RESERVED_NODE_ID}pack:${n.id}`;
    while (ctx.taken.has(id)) id += '_';
    ctx.taken.add(id);
    packs.set(n.id, { id, width: block.width, height: block.height, members: new Set(block.top) });
    inner.set(id, block);
    for (const c of level.attached) await resolve(c);
  };
  for (const n of nodes) await resolve(n);

  // A lone box needs no elk: a leaf or folded container is its size, a
  // separately arranged container is its inside plus the padding.
  if (nodes.length === 1 && (nodes[0]!.state !== 'expanded' || prelaid.has(nodes[0]!.id))) {
    const n = nodes[0]!;
    const hint = ctx.sizes?.get(n.id);
    const size =
      prelaid.get(n.id) ??
      (n.state === 'collapsed' ? (hint ?? COLLAPSED_SIZE) : footprint(hint ?? LEAF_SIZE));
    const out: Block = {
      width: size.width,
      height: size.height,
      top: [n.id],
      geometry: new Map([[n.id, { x: 0, y: 0, width: size.width, height: size.height }]]),
      routes: new Map(),
      labelSpots: new Map(),
    };
    const block = inner.get(n.id);
    const pad = pads.get(n.id);
    if (block !== undefined && pad !== undefined) embed(out, block, { dx: pad.left, dy: pad.top, absX: pad.left, absY: pad.top });
    return out;
  }

  const substitute: GraphSubstitutions = { roots: nodes, prelaid, packs };
  const built = buildGraph(ctx.view, ctx.sizes, ctx.settings, { substitute });
  let laid: ElkShape;
  try {
    laid = (await elk.layout(built.graph)) as ElkShape;
  } catch (e) {
    throw new ElkRejected(String(e));
  }
  const synthetic = new Set([...packs.values()].map((p) => p.id));
  // planning is layered-only, and layered always routes
  const { geometry, routes, labelSpots, origins } = collectLaid(laid, !built.lifted, synthetic);
  const out: Block = {
    width: laid.width ?? 0,
    height: laid.height ?? 0,
    top: nodes.map((n) => n.id),
    geometry,
    routes,
    labelSpots,
  };
  for (const [standIn, block] of inner) {
    const abs = origins.get(standIn) ?? { x: 0, y: 0 };
    const pad = pads.get(standIn);
    if (pad !== undefined) {
      // the inside of a container: against the container, past its padding
      embed(out, block, { dx: pad.left, dy: pad.top, absX: abs.x + pad.left, absY: abs.y + pad.top });
    } else {
      // a packed block: its members are the container's children, so they move
      // by the pack leaf's own parent-relative position
      const leaf = findShape(laid, standIn);
      embed(out, block, { dx: leaf?.x ?? 0, dy: leaf?.y ?? 0, absX: abs.x, absY: abs.y });
    }
  }
  return out;
}

function findShape(root: ElkShape, id: string): ElkShape | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findShape(c, id);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The whole view as ONE elk graph — the path every diagram took before
 * planning existed, and still takes when nothing in it stands apart. */
async function layoutSingleRun(
  view: CompiledView,
  sizeOverrides: ReadonlyMap<string, SizeHint> | undefined,
  settings: LayoutSettings | undefined,
  partitions?: ReadonlyMap<string, number>,
): Promise<LayoutResult> {
  // A rejected pick must degrade rather than freeze the canvas, so the attempts
  // below run in escalating order of concession and EVERY one of them is
  // guarded. The last is the default algorithm, which lays out anything we can
  // build — without it a doomed pick left `layoutView` rejecting, DiagramView's
  // `.then` never ran, and the stale arrangement stayed on screen looking like
  // the control had simply done nothing.
  //
  // Retrying flat is not merely "what non-layered algorithms received before":
  // before edge-lifting they received an EMPTY edge set, which is why radial
  // appeared to work. Handed the real edges it rejects the lifted graph ("not a
  // tree") and then overflows the stack on the flat one, so on a real nested
  // diagram both of its attempts fail and only the default rescues it.
  //
  // buildGraph stays OUTSIDE the try: a bug in our own graph builder (e.g.
  // liftEdges) must surface rather than silently demote us to the next attempt.
  const chosen = settings?.algorithm ?? DEFAULT_ALGORITHM;
  const withDefaultAlgorithm: LayoutSettings = { ...settings };
  delete withDefaultAlgorithm.algorithm;

  const attempts: { settings: LayoutSettings | undefined; flat: boolean; algorithm: string }[] = [
    { settings, flat: false, algorithm: chosen },
    { settings, flat: true, algorithm: chosen },
  ];
  if (chosen !== DEFAULT_ALGORITHM) {
    attempts.push({ settings: withDefaultAlgorithm, flat: false, algorithm: DEFAULT_ALGORITHM });
  }

  let laid: ElkShape | undefined;
  let lifted = false;
  let algorithm = chosen;
  let lastError: unknown;
  for (const attempt of attempts) {
    // the flat graph restructures nothing, so its `lifted` is false by
    // construction — read it rather than assume it
    const built = buildGraph(view, sizeOverrides, attempt.settings, {
      ...(attempt.flat ? { flat: true } : {}),
      ...(partitions !== undefined ? { partitions } : {}),
    });
    try {
      laid = (await elk.layout(built.graph)) as ElkShape;
      lifted = built.lifted;
      algorithm = attempt.algorithm;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  // Even the default failed: there is no arrangement left to show, and
  // swallowing that would turn a real bug into a silently blank canvas.
  if (laid === undefined) throw lastError;

  // Only an unrestructured graph produces routes worth drawing: a lifted edge's
  // waypoints run between containers rather than between the nodes the renderer
  // draws — so curved beziers are the honest fallback there. See DEFERRALS.md.
  // The key is whether lifting ACTUALLY happened, not which algorithm was
  // picked: a container-free diagram lifts nothing, so force and stress keep
  // their routes exactly as they did before edge-lifting existed.
  // `layered` always routes (orthogonally — see layoutOptionsFor); the others
  // only place nodes unless orthogonal routing was asked of them.
  const wantRoutes = !lifted && (algorithm === DEFAULT_ALGORITHM || settings?.edgeRouting === 'orthogonal');
  const { geometry, routes, labelSpots } = collectLaid(laid, wantRoutes);
  return { geometry, routes, labelSpots, algorithm };
}
