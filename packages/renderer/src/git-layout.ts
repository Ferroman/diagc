import {
  gitGraph,
  isGitKind,
  LEAF_SIZE,
  type CompiledView,
  type DiagramModel,
  type GitGraph,
  type ViewEdge,
  type ViewNode,
} from '@diagramming/core';
import type { EdgePoint, LayoutResult, NodeGeometry } from './layout';

/** Flow-pixel constants of the git arrangement. Tuned against real renders;
 * tests derive their expectations from these, never from literals. */
export const GIT_LAYOUT = {
  /** column pitch */
  COL: 64,
  /** lane (row) height */
  LANE: 56,
  /** commit circle */
  DIAMETER: 28,
  LABEL_W: 170,
  LABEL_H: 36,
  MARGIN: 24,
  /** room between the last column and the label box */
  TAIL_GAP: 16,
} as const;

/** Lane colours for branches that set none, by lane index. */
export const LANE_PALETTE = ['#7ba7d9', '#d9534f', '#e0a030', '#7bbf7b', '#b08ad9', '#8a8f96'] as const;

// gitGraph is cheap but called from the layout, both colour resolvers and the
// overlay on every render; one derivation per (model object, plane) keeps the
// answers identical and the work single.
const graphCache = new WeakMap<DiagramModel, Map<string | undefined, GitGraph>>();
export function gitGraphCached(model: DiagramModel, plane: string | undefined): GitGraph {
  let byPlane = graphCache.get(model);
  if (byPlane === undefined) {
    byPlane = new Map();
    graphCache.set(model, byPlane);
  }
  let g = byPlane.get(plane);
  if (g === undefined) {
    g = gitGraph(model, plane);
    byPlane.set(plane, g);
  }
  return g;
}

const colorCache = new WeakMap<GitGraph, Map<string, string>>();

/** lane id → colour, commit id → its own colour else its lane's. Lanes: own
 * `color`, else the model's `typeColors` for `branch`, else the palette. */
export function gitNodeColors(model: DiagramModel, plane: string | undefined): ReadonlyMap<string, string> {
  const g = gitGraphCached(model, plane);
  const hit = colorCache.get(g);
  if (hit !== undefined) return hit;
  const byType = model.typeColors?.['branch'] ?? model.typeColors?.['*'];
  const colors = new Map<string, string>();
  g.lanes.forEach((lane, i) => {
    const laneColor = lane.node.color ?? byType ?? LANE_PALETTE[i % LANE_PALETTE.length]!;
    colors.set(lane.id, laneColor);
    for (const c of lane.commits) colors.set(c.id, c.color ?? laneColor);
  });
  colorCache.set(g, colors);
  return colors;
}

/** `branch` → the target lane's colour, `commit` → its own lane's, `merge` → the
 * lower of the two lanes (greater index): a feature lane merging up keeps its
 * colour, a trunk merging down into a lane takes that lane's. */
export function gitEdgeColor(e: ViewEdge, model: DiagramModel, plane: string | undefined): string | undefined {
  if (!isGitKind(e.kind)) return undefined;
  const g = gitGraphCached(model, plane);
  const from = g.laneOf.get(e.from);
  const to = g.laneOf.get(e.to);
  if (from === undefined || to === undefined) return undefined;
  const index = (id: string): number => g.lanes.findIndex((l) => l.id === id);
  const lane = e.kind === 'branch' ? to : e.kind === 'commit' ? from : index(from) >= index(to) ? from : to;
  return gitNodeColors(model, plane).get(lane);
}

/** Orthogonal waypoints between two circle centres, by direction. */
export function gitRoute(s: EdgePoint, t: EdgePoint, col: number): EdgePoint[] {
  if (t.y === s.y || t.x <= s.x) return [s, t];
  if (t.y > s.y) return [s, { x: s.x, y: t.y }, t];
  const x = t.x - col / 2;
  return [s, { x, y: s.y }, { x, y: t.y }, t];
}

/**
 * The git arrangement: lanes are full-width bands in declaration order, commits
 * sit at their column, links get orthogonal routes. Pure and synchronous; it
 * replaces elk for a git-graph plane (see NotationProfile.layout). Geometry is
 * parent-relative like elk output; routes are absolute like elk's.
 */
export function gitLayout(
  view: CompiledView,
  model: DiagramModel,
  plane: string | undefined,
  sizeHints?: ReadonlyMap<string, { width: number; height: number }>,
): LayoutResult {
  const { COL, LANE, DIAMETER, LABEL_W, MARGIN, TAIL_GAP } = GIT_LAYOUT;
  const g = gitGraphCached(model, plane);
  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, EdgePoint[]>();
  const centres = new Map<string, EdgePoint>();

  // Only what the view shows is placed: a folded lane has no commits in the
  // tree, a layer-hidden node is absent, and elk output follows the same rule.
  const shown = new Set<string>();
  const walk = (n: ViewNode): void => {
    shown.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);

  let maxCol = -1;
  for (const [id, c] of g.columns) if (shown.has(id)) maxCol = Math.max(maxCol, c);
  const width = MARGIN + (maxCol + 1) * COL + TAIL_GAP + LABEL_W + MARGIN;
  const columnX = (id: string): number => MARGIN + DIAMETER / 2 + (g.columns.get(id) ?? 0) * COL;

  const lanes = g.lanes.filter((l) => shown.has(l.id));
  lanes.forEach((lane, i) => {
    const y = MARGIN + i * LANE;
    geometry.set(lane.id, { x: 0, y, width, height: LANE });
    for (const c of lane.commits) {
      if (!shown.has(c.id)) continue;
      const cx = columnX(c.id);
      geometry.set(c.id, { x: cx - DIAMETER / 2, y: LANE / 2 - DIAMETER / 2, width: DIAMETER, height: DIAMETER });
      centres.set(c.id, { x: cx, y: y + LANE / 2 });
    }
  });

  // Spare row: strays at their column, then everything else the view shows
  // that is not a lane or a placed commit, packed left to right.
  const rowY = MARGIN + lanes.length * LANE + MARGIN;
  // MARGIN's type is the literal `24` (from GIT_LAYOUT's `as const`), which does
  // not widen through a plain `let` initializer — annotate so later reassignment
  // with plain `number` results type-checks.
  let cursor: number = MARGIN;
  for (const s of g.strays) {
    if (!shown.has(s.id)) continue;
    const cx = columnX(s.id);
    geometry.set(s.id, { x: cx - DIAMETER / 2, y: rowY, width: DIAMETER, height: DIAMETER });
    centres.set(s.id, { x: cx, y: rowY + DIAMETER / 2 });
    cursor = Math.max(cursor, cx + DIAMETER / 2 + COL);
  }
  const placeLoose = (n: ViewNode): void => {
    if (!geometry.has(n.id)) {
      const size = sizeHints?.get(n.id) ?? LEAF_SIZE;
      geometry.set(n.id, { x: cursor, y: rowY, width: size.width, height: size.height });
      cursor += size.width + COL;
    }
    n.children.forEach(placeLoose);
  };
  view.roots.forEach(placeLoose);

  // Routes for the git links the view lays out against (hidden-layer links
  // included, as elk does — toggling a layer must not move anything).
  for (const e of view.layoutEdges) {
    if (!isGitKind(e.kind)) continue;
    const s = centres.get(e.from);
    const t = centres.get(e.to);
    if (s === undefined || t === undefined) continue;
    routes.set(e.id, gitRoute(s, t, COL));
  }
  return { geometry, routes, algorithm: 'git-graph' };
}
