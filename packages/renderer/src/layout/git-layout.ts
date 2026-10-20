import {
  GIT_NOTATION,
  gitGraph,
  isGitKind,
  LEAF_SIZE,
  placeColumns,
  type ColumnPlaces,
  type ColumnTag,
  type DiagramModel,
  type DiagramNode,
  type GitGraph,
  type GitStage,
  type Point,
  type ViewEdge,
  type ViewNode,
} from '@diagc/core/internal';
import { textWidth } from './box-size';
import type { LayoutResult, NodeGeometry, NotationLayoutInput } from './layout';

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
  /** band above the first lane that holds the stage titles (only when the view
   * shows a stage — a graph without any keeps exactly the height it had) */
  STAGE_HEADER: 30,
  /** how far a stage frame reaches past the first/last lane it covers */
  STAGE_PAD: 6,
  /** the size a commit tag and a stage title are measured at — must match the
   * font of `.dg-commit-tag` and `.dg-git-stage-name` (600 12px, the weight
   * `textWidth`'s advances are calibrated for) */
  TAG_PX: 12,
  /** least room between two tags on one lane */
  TAG_GAP: 8,
  /** a stage title's inset from each side of its frame (`.dg-git-stage-name` padding) */
  STAGE_TITLE_PAD: 6,
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
  let graph = byPlane.get(plane);
  if (graph === undefined) {
    graph = gitGraph(model, plane);
    byPlane.set(plane, graph);
  }
  return graph;
}

const colorCache = new WeakMap<GitGraph, Map<string, string>>();

/** lane id → colour, commit id → its own colour else its lane's. Lanes: own
 * `color`, else the model's `typeColors` for `branch`, else the palette. */
export function gitNodeColors(model: DiagramModel, plane: string | undefined): ReadonlyMap<string, string> {
  const graph = gitGraphCached(model, plane);
  const hit = colorCache.get(graph);
  if (hit !== undefined) return hit;
  const byType = model.typeColors?.['branch'] ?? model.typeColors?.['*'];
  const colors = new Map<string, string>();
  graph.lanes.forEach((lane, i) => {
    const laneColor = lane.node.color ?? byType ?? LANE_PALETTE[i % LANE_PALETTE.length]!;
    colors.set(lane.id, laneColor);
    for (const c of lane.commits) colors.set(c.id, c.color ?? laneColor);
  });
  colorCache.set(graph, colors);
  return colors;
}

/** `branch` → the target lane's colour, `commit` → its own lane's, `merge` → the
 * lower of the two lanes (greater index): a feature lane merging up keeps its
 * colour, a trunk merging down into a lane takes that lane's. */
export function gitEdgeColor(e: ViewEdge, model: DiagramModel, plane: string | undefined): string | undefined {
  if (!isGitKind(e.kind)) return undefined;
  const graph = gitGraphCached(model, plane);
  const from = graph.laneOf.get(e.from);
  const to = graph.laneOf.get(e.to);
  if (from === undefined || to === undefined) return undefined;
  const index = (id: string): number => graph.lanes.findIndex((l) => l.id === id);
  const lane = e.kind === 'branch' ? to : e.kind === 'commit' ? from : index(from) >= index(to) ? from : to;
  return gitNodeColors(model, plane).get(lane);
}

/** Orthogonal waypoints between two circle centres, by direction. */
export function gitRoute(s: Point, t: Point, col: number): Point[] {
  if (t.y === s.y || t.x <= s.x) return [s, t];
  if (t.y > s.y) return [s, { x: s.x, y: t.y }, t];
  const x = t.x - col / 2;
  return [s, { x, y: s.y }, { x, y: t.y }, t];
}

/**
 * Where each column stands (core's `placeColumns`, in pixels): a tag hangs centred
 * over its commit on its lane's row, or on the spare row the strays share, and a
 * stage frame needs its title's width. Only what the view shows takes room.
 */
function columnsOf(graph: GitGraph, shown: ReadonlySet<string>, stages: GitStage[], maxCol: number): ColumnPlaces {
  const { COL, DIAMETER, MARGIN, TAG_PX, TAG_GAP, STAGE_TITLE_PAD } = GIT_LAYOUT;
  const measure = (text: string): number => Math.ceil(textWidth(text, TAG_PX));
  const tags: ColumnTag[] = [];
  const tag = (commit: DiagramNode, row: string): void => {
    if (!shown.has(commit.id) || commit.name === '') return;
    const half = measure(commit.name) / 2;
    tags.push({ col: graph.columns.get(commit.id) ?? 0, row, left: half, right: half });
  };
  for (const lane of graph.lanes) for (const c of lane.commits) tag(c, lane.id);
  for (const s of graph.strays) tag(s, '');
  const frames = stages.map((s) => ({ ...s, width: measure(s.node.name) + 2 * STAGE_TITLE_PAD }));
  return placeColumns({ maxCol, first: MARGIN + DIAMETER / 2, pitch: COL, gap: TAG_GAP, tags, frames });
}

/**
 * The git arrangement: lanes are full-width bands in declaration order, commits
 * sit at their column, links get orthogonal routes. Pure and synchronous; it
 * replaces elk for a git-graph plane (see NotationProfile.layout). Geometry is
 * parent-relative like elk output; routes are absolute like elk's.
 */
export function gitLayout({ view, model, plane, sizeHints }: NotationLayoutInput): LayoutResult {
  const { COL, LANE, DIAMETER, LABEL_W, MARGIN, TAIL_GAP, STAGE_HEADER, STAGE_PAD } = GIT_LAYOUT;
  const graph = gitGraphCached(model, plane);
  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, Point[]>();
  const centres = new Map<string, Point>();

  // Only what the view shows is placed: a folded lane has no commits in the
  // tree, a layer-hidden node is absent, and elk output follows the same rule.
  const shown = new Set<string>();
  const walk = (n: ViewNode): void => {
    shown.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);

  const stages = graph.stages.filter((s) => shown.has(s.id));
  let maxCol = -1;
  for (const [id, c] of graph.columns) if (shown.has(id)) maxCol = Math.max(maxCol, c);
  for (const s of stages) maxCol = Math.max(maxCol, s.toCol);
  const cols = columnsOf(graph, shown, stages, maxCol);
  const end = maxCol < 0 ? MARGIN : cols.x[maxCol]! - DIAMETER / 2 + COL + cols.growRight[maxCol]!;
  const width = end + TAIL_GAP + LABEL_W + MARGIN;
  const columnX = (id: string): number => cols.x[graph.columns.get(id) ?? 0]!;

  const lanes = graph.lanes.filter((l) => shown.has(l.id));
  // Stages: frames across every lane, one column-span each, titled in a band
  // above the first lane (the tags of that lane's commits hang just below it).
  const top = MARGIN + (stages.length > 0 ? STAGE_HEADER : 0);
  for (const s of stages) {
    const grow = cols.growth.get(s.id)!;
    geometry.set(s.id, {
      x: cols.x[s.fromCol]! - COL / 2 - grow,
      y: top - STAGE_HEADER,
      width: cols.x[s.toCol]! - cols.x[s.fromCol]! + COL + 2 * grow,
      height: STAGE_HEADER + lanes.length * LANE + STAGE_PAD,
    });
  }
  lanes.forEach((lane, i) => {
    const y = top + i * LANE;
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
  const rowY = top + lanes.length * LANE + MARGIN;
  // MARGIN's type is the literal `24` (from GIT_LAYOUT's `as const`), which does
  // not widen through a plain `let` initializer — annotate so later reassignment
  // with plain `number` results type-checks.
  let cursor: number = MARGIN;
  for (const s of graph.strays) {
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
  return { geometry, routes, labelSpots: new Map(), algorithm: GIT_NOTATION };
}
