import ELK from 'elkjs/lib/elk.bundled.js';
import { LEAF_SIZE, type CompiledView, type LayoutSettings, type ViewEdge, type ViewNode } from '@diagramming/core';
import {
  buildGraph,
  layoutOptionsFor,
  COLLAPSED_SIZE,
  type ElkRoutedEdge,
  type ElkShape,
} from './layout-graph';

// Re-exported so `index.tsx` and existing importers keep their import path.
export { COLLAPSED_SIZE, layoutOptionsFor };

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
   * settings.edgeRouting === 'orthogonal', otherwise empty. */
  routes: Map<string, EdgePoint[]>;
}

const elk = new ELK();
const cache = new Map<string, LayoutResult>();
const CACHE_CAP = 50;

// Edge-label footprint fed into elk so it reserves room and neighbours don't
// overlap the label. Approximate: the drawn label is a ~10px-font chip, so a
// per-char width plus horizontal padding lands close to the real box.
const EDGE_LABEL_CHAR = 6;
const EDGE_LABEL_PAD = 12;
const EDGE_LABEL_HEIGHT = 18;

/** The widest single label an edge carries (aggregate edges expose one joined
 * `label`; a sole relation exposes its positioned `labels`). Empty ⇒ no label. */
function edgeLabelText(e: ViewEdge): string {
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

function toElkNode(n: ViewNode, sizes?: Map<string, { width: number; height: number }>): ElkShape {
  if (n.state === 'expanded') {
    return {
      id: n.id,
      children: n.children.map((c) => toElkNode(c, sizes)),
      layoutOptions: {
        'elk.padding': '[top=36.0,left=16.0,bottom=16.0,right=16.0]',
      },
    };
  }
  // collapsed containers keep the fixed collapsed size — an image override only
  // makes sense for a leaf, where the picture IS the body
  if (n.state === 'collapsed') {
    return { id: n.id, width: COLLAPSED_SIZE.width, height: COLLAPSED_SIZE.height };
  }
  const size = sizes?.get(n.id) ?? LEAF_SIZE;
  return { id: n.id, width: size.width, height: size.height };
}

export async function layoutView(
  view: CompiledView,
  sizeOverrides?: Map<string, { width: number; height: number }>,
  settings?: LayoutSettings,
): Promise<LayoutResult> {
  const key = signature(view, sizeOverrides, settings);
  const hit = cache.get(key);
  if (hit) return hit;

  const graph: ElkShape = {
    id: '__root__',
    layoutOptions: layoutOptionsFor(settings),
    children: view.roots.map((r) => toElkNode(r, sizeOverrides)),
    edges: view.layoutEdges
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
      }),
  };

  const laid = (await elk.layout(graph)) as ElkShape;
  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, EdgePoint[]>();
  const wantRoutes = settings?.edgeRouting === 'orthogonal';

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
