import {
  gitGraph,
  isGitKind,
  latestCommit,
  mergedAway,
  placeColumns,
  type ColumnTag,
  type CompiledView,
  type DiagramModel,
  type DiagramNode,
  type GitGraph,
  type ViewNode,
} from '@diagc/core/internal';
import type { CellPoint } from './canvas';
import type { BoxText } from './content';
import type { BoxGeometry, GitDrawing, Route, TextLayout } from './layout';
import { cellWidth, printable } from './width';

// A git graph in cells, as the page draws it (the renderer's git-layout.ts): one row
// per lane in declaration order, each commit a dot at its column with its tag on the
// row above, and the lane's name at the right end, past every column, where the page
// has its label box. Columns come from core's placeColumns, as the page's do, so a
// tag clears its neighbours and a stage frame is wide enough for its title. Stages
// frame their columns across every lane, titled in their top border. Commits on no
// lane get a row of their own under the lanes, and the rest a row of boxes under that.

/** The graph's spacing, in cells. */
export const GIT = {
  /** neighbouring columns' distance when nothing needs more: a dot and three cells of line */
  PITCH: 4,
  /** the least room between two tags on one lane: two cells, as one would read the
   * two as one phrase */
  TAG_GAP: 2,
  /** rows from one lane's line to the next: the next lane's tags and a blank row between */
  LANE: 3,
  /** what a stage's frame needs besides its title: a corner and a cell of border
   * before it, a space either side, a cell of border and a corner after */
  FRAME_ROOM: 6,
  /** from the last column's reach to the lanes' names: the tail's run and a space */
  NAME_GAP: 2,
  /** blank rows between the lanes and the boxes under them */
  STRAY_ROW: 1,
  /** between two boxes in that row */
  STRAY_GAP: 4,
} as const;

/** A name on one line, as a tag, a lane's name and a stage's title are drawn. */
const oneLine = (node: DiagramNode): string => printable(node.name.split(/\r?\n/).join(' '));

/** Every node the view shows, parents before children. */
function shownNodes(view: CompiledView): ViewNode[] {
  const out: ViewNode[] = [];
  const walk = (vn: ViewNode): void => {
    out.push(vn);
    vn.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return out;
}

/** The rows the dots go on: each lane the view shows, then the strays' when there are any. */
function rowsOf(graph: GitGraph, shown: ReadonlySet<string>): { id: string; commits: DiagramNode[] }[] {
  const rows = graph.lanes
    .filter((lane) => shown.has(lane.id))
    .map((lane) => ({ id: lane.id, commits: lane.commits.filter((c) => shown.has(c.id)) }));
  const strays = graph.strays.filter((c) => shown.has(c.id));
  return strays.length > 0 ? [...rows, { id: '', commits: strays }] : rows;
}

/** A git link's path from dot to dot: down from where a branch leaves and along its
 * lane, along and up half a pitch before where a merge lands (the page's gitRoute). */
function linkRoute(s: CellPoint, t: CellPoint): CellPoint[] {
  if (t.y === s.y) return [s, t];
  if (t.y > s.y || t.x <= s.x) return [s, { x: s.x, y: t.y }, t];
  const x = t.x - GIT.PITCH / 2;
  return [s, { x, y: s.y }, { x, y: t.y }, t];
}

/** What is not on a row, boxed in a row from the left at `y`. */
function placeLoose(
  nodes: readonly ViewNode[],
  boxes: ReadonlyMap<string, BoxText>,
  y: number,
  placed: Map<string, BoxGeometry>,
): void {
  let x = 0;
  for (const vn of nodes) {
    if (placed.has(vn.id)) continue;
    const text = boxes.get(vn.id);
    const [width, height] = [text?.width ?? 5, text?.height ?? 3];
    placed.set(vn.id, { x, y, width, height });
    x += width + GIT.STRAY_GAP;
  }
}

/** The picture's size: every box and every route. */
function measure(boxes: ReadonlyMap<string, BoxGeometry>, routes: ReadonlyMap<string, Route>): [number, number] {
  let [width, height] = [0, 0];
  for (const b of boxes.values()) [width, height] = [Math.max(width, b.x + b.width), Math.max(height, b.y + b.height)];
  for (const r of routes.values()) {
    for (const p of r.points) [width, height] = [Math.max(width, p.x + 1), Math.max(height, p.y + 1)];
  }
  return [width, height];
}

/**
 * The graph in cells, for a git-graph plane: every node the view shows gets a box — a
 * commit its dot and tag, a lane its name, a stage its frame — and every drawn git
 * link between two dots a route from one to the other.
 */
export function gitCells(
  model: DiagramModel,
  plane: string | undefined,
  view: CompiledView,
  boxes: ReadonlyMap<string, BoxText>,
): TextLayout {
  const nodes = shownNodes(view);
  const shown = new Set(nodes.map((n) => n.id));
  const graph = gitGraph(model, plane);
  const rows = rowsOf(graph, shown);
  const stages = graph.stages.filter((s) => shown.has(s.id));

  const tags: ColumnTag[] = [];
  for (const row of rows) {
    for (const c of row.commits) {
      const width = cellWidth(oneLine(c));
      if (width > 0)
        tags.push({
          col: graph.columns.get(c.id) ?? 0,
          row: row.id,
          left: Math.floor(width / 2),
          right: Math.ceil(width / 2),
        });
    }
  }
  // a frame's width rounded up to even, so that it grows by whole cells either side
  const frames = stages.map((s) => {
    const width = cellWidth(oneLine(s.node)) + GIT.FRAME_ROOM;
    return { id: s.id, fromCol: s.fromCol, toCol: s.toCol, width: width + (width % 2) };
  });
  let maxCol = -1;
  for (const row of rows) for (const c of row.commits) maxCol = Math.max(maxCol, graph.columns.get(c.id) ?? 0);
  for (const s of stages) maxCol = Math.max(maxCol, s.toCol);
  const half = GIT.PITCH / 2;
  const cols = placeColumns({ maxCol, first: half, pitch: GIT.PITCH, gap: GIT.TAG_GAP, tags, frames });

  const placed = new Map<string, BoxGeometry>();
  const git: GitDrawing = { dots: new Map(), tags: new Map(), names: new Map(), tails: [], stages: new Map() };
  const top = stages.length > 0 ? 1 : 0;
  const lineOf = (i: number): number => top + i * GIT.LANE + 1;
  const end = maxCol < 0 ? 0 : cols.x[maxCol]! + half + cols.growRight[maxCol]!;
  const nameX = end + GIT.NAME_GAP;
  rows.forEach((row, i) => {
    const y = lineOf(i);
    for (const c of row.commits) {
      const dot = { x: cols.x[graph.columns.get(c.id) ?? 0]!, y };
      git.dots.set(c.id, dot);
      const text = oneLine(c);
      const width = cellWidth(text);
      if (width === 0) {
        placed.set(c.id, { ...dot, width: 1, height: 1 });
        continue;
      }
      const tag = { x: dot.x - Math.floor(width / 2), y: y - 1, text };
      git.tags.set(c.id, tag);
      const x = Math.min(tag.x, dot.x);
      placed.set(c.id, { x, y: tag.y, width: Math.max(tag.x + width, dot.x + 1) - x, height: 2 });
    }
    const lane = graph.lanes.find((l) => l.id === row.id);
    if (lane === undefined) return;
    const name = { x: nameX, y, text: oneLine(lane.node) };
    git.names.set(lane.id, name);
    placed.set(lane.id, { x: name.x, y, width: Math.max(1, cellWidth(name.text)), height: 1 });
    const last = latestCommit(graph, lane.id);
    const from = last === undefined ? undefined : git.dots.get(last.id);
    if (last !== undefined && from !== undefined && !mergedAway(model, last.id) && from.x + 1 <= nameX - 2) {
      git.tails.push({ lane: lane.id, y, from: from.x + 1, to: nameX - 2 });
    }
  });
  const bottom = rows.length === 0 ? top : lineOf(rows.length - 1) + 1;
  for (const s of stages) {
    const grow = cols.growth.get(s.id)!;
    const x = cols.x[s.fromCol]! - half - grow;
    placed.set(s.id, { x, y: 0, width: cols.x[s.toCol]! + half + grow - x, height: bottom + 1 });
    git.stages.set(s.id, oneLine(s.node));
  }

  const routes = new Map<string, Route>();
  for (const e of view.edges) {
    const [s, t] = [git.dots.get(e.from), git.dots.get(e.to)];
    if (isGitKind(e.kind) && s !== undefined && t !== undefined) routes.set(e.id, { points: linkRoute(s, t) });
  }
  placeLoose(nodes, boxes, bottom + 1 + GIT.STRAY_ROW, placed);
  const [width, height] = measure(placed, routes);
  return { width, height, boxes: placed, routes, git };
}
