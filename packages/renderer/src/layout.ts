import ELK from 'elkjs/lib/elk.bundled.js';
import { type CompiledView, type LayoutSettings, type ViewNode } from '@diagramming/core';
import { buildGraph, usesNestedLayout, edgeLabelText, type ElkRoutedEdge, type ElkShape } from './layout-graph';

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
   * settings.edgeRouting === 'orthogonal' AND the algorithm used the flat
   * graph (layered, rectpacking, or a nested pick that fell back to flat),
   * otherwise empty. */
  routes: Map<string, EdgePoint[]>;
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

  // A rejected pick should degrade rather than blank the canvas: radial throws
  // outright on any graph that is not a tree, and a future algorithm may reject
  // some other shape. Retry with the pre-lift graph, which is what every
  // non-layered algorithm effectively received before. Only the elk call is
  // guarded — buildGraph itself must throw straight through, or a bug in our
  // own graph builder (e.g. liftEdges) would silently and permanently degrade
  // to the flat graph instead of surfacing.
  let usedNested = usesNestedLayout(settings);
  let laid: ElkShape;
  const graph = buildGraph(view, sizeOverrides, settings);
  try {
    laid = (await elk.layout(graph)) as ElkShape;
  } catch {
    usedNested = false;
    laid = (await elk.layout(buildGraph(view, sizeOverrides, settings, { flat: true }))) as ElkShape;
  }

  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, EdgePoint[]>();
  // Only the flat path produces routes worth drawing: a lifted edge's waypoints
  // run between containers rather than between the nodes the renderer draws —
  // so curved beziers are the honest fallback on the nested path. See DEFERRALS.md.
  const wantRoutes = settings?.edgeRouting === 'orthogonal' && !usedNested;

  // Node x/y stay parent-relative (React Flow positions children under parentId).
  // Edge sections, however, are relative to the container node that owns them, so
  // walk with the running absolute origin to lift routes into absolute space —
  // which is what the renderer draws edges in.
  const collect = (n: ElkShape, absX: number, absY: number) => {
    const ax = absX + (n.x ?? 0);
    const ay = absY + (n.y ?? 0);
    if (n.id !== '__root__') {
      geometry.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 });
    }
    if (wantRoutes && n.edges !== undefined) {
      for (const e of n.edges as ElkRoutedEdge[]) {
        const sec = e.sections?.[0];
        if (sec === undefined) continue;
        const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({
          x: ax + p.x,
          y: ay + p.y,
        }));
        routes.set(e.id, pts);
      }
    }
    n.children?.forEach((c) => collect(c, ax, ay));
  };
  collect(laid, 0, 0);

  const result: LayoutResult = { geometry, routes };
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}
