import ELK from 'elkjs/lib/elk.bundled.js';
import { RESERVED_NODE_ID, type CompiledView, type LayoutSettings, type ViewNode } from '@diagramming/core';
import { buildGraph, DEFAULT_ALGORITHM, edgeLabelText, type ElkRoutedEdge, type ElkShape } from './layout-graph';

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

export interface LayoutResult {
  /** parent-relative node geometry (elk output), keyed by node id */
  geometry: Map<string, NodeGeometry>;
  /** elk-routed absolute waypoints per edge id; populated only when
   * settings.edgeRouting === 'orthogonal' AND the graph handed to elk kept every
   * edge between its true endpoints (`buildGraph`'s `lifted` flag), otherwise
   * empty. */
  routes: Map<string, EdgePoint[]>;
  /** The algorithm this arrangement was actually produced with. Differs from the
   * requested one when that one could not lay the graph out at all (see
   * `layoutView`), so a caller can say so instead of presenting the fallback as
   * the user's pick. */
  algorithm: string;
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
  sizes?: Map<string, { width: number; height: number }>,
  settings?: LayoutSettings,
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
          .map(([id, s]) => `${id}:${s.width}x${s.height}`)
          .join('|')}`;
  return `${nodes.join('|')}#${edges}${sized}${settingsKey(settings)}`;
}

export async function layoutView(
  view: CompiledView,
  sizeOverrides?: Map<string, { width: number; height: number }>,
  settings?: LayoutSettings,
): Promise<LayoutResult> {
  const key = signature(view, sizeOverrides, settings);
  const hit = cache.get(key);
  if (hit) return hit;

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
    const built = buildGraph(view, sizeOverrides, attempt.settings, attempt.flat ? { flat: true } : undefined);
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

  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, EdgePoint[]>();
  // Only an unrestructured graph produces routes worth drawing: a lifted edge's
  // waypoints run between containers rather than between the nodes the renderer
  // draws — so curved beziers are the honest fallback there. See DEFERRALS.md.
  // The key is whether lifting ACTUALLY happened, not which algorithm was
  // picked: a container-free diagram lifts nothing, so force and stress keep
  // their routes exactly as they did before edge-lifting existed.
  const wantRoutes = settings?.edgeRouting === 'orthogonal' && !lifted;

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
    if (n.id !== RESERVED_NODE_ID) {
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
  }

  const result: LayoutResult = { geometry, routes, algorithm };
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}
