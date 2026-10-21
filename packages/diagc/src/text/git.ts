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
  type GitStage,
  type ViewNode,
} from '@diagc/core/internal';
import type { CellPoint } from './canvas';
import type { BoxText } from './content';
import type { BoxGeometry, GitDrawing, Route, TextLayout } from './layout';
import { cellWidth, printable } from './width';

// A git graph in cells, one of two ways. Down the screen, the default, as a terminal
// reads a history: each lane a column in declaration order, each commit a dot on its
// column's row with its tag beside it, and the lanes' names along the foot. Across the
// screen, as the page draws it (the renderer's git-layout.ts): each lane a row, each
// commit a dot at its column with its tag on the row above, and the lane's name at the
// right end, where the page has its label box. Across, columns come from core's
// placeColumns, as the page's do, so a tag clears its neighbours and a stage frame is
// wide enough for its title; down, the rows do, so a frame has room for its border.
// Stages frame their columns across every lane. Commits on no lane get a track of their
// own after the lanes, and the rest a row of boxes under the picture.

/** The graph's spacing across the screen, in cells. */
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

/** The graph's spacing down the screen, in cells. */
export const GIT_DOWN = {
  /** rows from one column's dots to the next when nothing needs more: a dot and the row
   * a branch turns off on, or a merge turns in */
  PITCH: 2,
  /** rows a stage's frame reaches past its first and last dots: the row a line turns
   * on, then its border, so no line turns along a border */
  FRAME: 2,
  /** the least room between a lane's widest tag, or its name, and the next lane */
  LANE_GAP: 2,
  /** columns left of the first lane where stages are framed: the frame's side and a space */
  MARGIN: 2,
  /** what a stage's frame needs past the last lane besides its title: a cell of border
   * before it, a space either side, a cell of border and a corner after */
  TITLE_ROOM: 5,
  /** rows from the last dot's reach to the lanes' names: the tail's run */
  NAME_GAP: 2,
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

/** What the dots go on, a row each across the screen or a column each down it. */
interface Track {
  /** the lane's id; '' for the strays' */
  id: string;
  commits: DiagramNode[];
}

/** The tracks: each lane the view shows, then the strays' when there are any. */
function tracksOf(graph: GitGraph, shown: ReadonlySet<string>): Track[] {
  const tracks = graph.lanes
    .filter((lane) => shown.has(lane.id))
    .map((lane) => ({ id: lane.id, commits: lane.commits.filter((c) => shown.has(c.id)) }));
  const strays = graph.strays.filter((c) => shown.has(c.id));
  return strays.length > 0 ? [...tracks, { id: '', commits: strays }] : tracks;
}

/** What both ways of laying the graph out read. */
interface Parts {
  model: DiagramModel;
  graph: GitGraph;
  view: CompiledView;
  boxes: ReadonlyMap<string, BoxText>;
  nodes: ViewNode[];
  tracks: Track[];
  stages: GitStage[];
  /** the last column a dot or a stage takes; -1 for none */
  maxCol: number;
}

/** What a way of laying out has placed, for `finished` to route and measure. */
interface Placed {
  git: GitDrawing;
  placed: Map<string, BoxGeometry>;
  /** a git link's path from dot to dot */
  route: (s: CellPoint, t: CellPoint) => CellPoint[];
  /** the row the boxes of what is on no track go on */
  looseY: number;
}

const columnOf = (parts: Parts, commit: DiagramNode): number => parts.graph.columns.get(commit.id) ?? 0;

/** The dot a lane's tail runs on from: its last commit's, unless that merged away. */
function tailFrom(parts: Parts, lane: string, dots: ReadonlyMap<string, CellPoint>): CellPoint | undefined {
  const last = latestCommit(parts.graph, lane);
  return last === undefined || mergedAway(parts.model, last.id) ? undefined : dots.get(last.id);
}

/** A git link's path across the screen: down from where a branch leaves and along its
 * lane, along and up half a pitch before where a merge lands (the page's gitRoute). */
function acrossRoute(s: CellPoint, t: CellPoint): CellPoint[] {
  if (t.y === s.y) return [s, t];
  if (t.y > s.y || t.x <= s.x) return [s, { x: s.x, y: t.y }, t];
  const x = t.x - GIT.PITCH / 2;
  return [s, { x, y: s.y }, { x, y: t.y }, t];
}

/** A git link's path down the screen, which turns the way acrossRoute does, by the
 * lanes' order: across on the row under where it leaves, as its tag is beside it, and
 * down its lane, or down its lane and across on the row over where it lands. */
function downRoute(s: CellPoint, t: CellPoint): CellPoint[] {
  if (t.x === s.x) return [s, t];
  const y = t.x > s.x || t.y <= s.y ? s.y + 1 : t.y - 1;
  return [s, { x: s.x, y }, { x: t.x, y }, t];
}

/** What is not on a track, boxed in a row from the left at `y`. */
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

/** The layout, its links routed from dot to dot and what is on no track boxed. */
function finished(parts: Parts, { git, placed, route, looseY }: Placed): TextLayout {
  const routes = new Map<string, Route>();
  for (const e of parts.view.edges) {
    const [s, t] = [git.dots.get(e.from), git.dots.get(e.to)];
    if (isGitKind(e.kind) && s !== undefined && t !== undefined) routes.set(e.id, { points: route(s, t) });
  }
  placeLoose(parts.nodes, parts.boxes, looseY, placed);
  const [width, height] = measure(placed, routes);
  return { width, height, boxes: placed, routes, git };
}

/** The graph across the screen: a row a track, the names at the right end. */
function across(parts: Parts): TextLayout {
  const { graph, tracks, stages, maxCol } = parts;
  const tags: ColumnTag[] = [];
  for (const track of tracks) {
    for (const c of track.commits) {
      const width = cellWidth(oneLine(c));
      if (width > 0)
        tags.push({ col: columnOf(parts, c), row: track.id, left: Math.floor(width / 2), right: Math.ceil(width / 2) });
    }
  }
  // a frame's width rounded up to even, so that it grows by whole cells either side
  const frames = stages.map((s) => {
    const width = cellWidth(oneLine(s.node)) + GIT.FRAME_ROOM;
    return { id: s.id, fromCol: s.fromCol, toCol: s.toCol, width: width + (width % 2) };
  });
  const half = GIT.PITCH / 2;
  const cols = placeColumns({ maxCol, first: half, pitch: GIT.PITCH, gap: GIT.TAG_GAP, tags, frames });

  const placed = new Map<string, BoxGeometry>();
  const git: GitDrawing = {
    down: false,
    dots: new Map(),
    tags: new Map(),
    names: new Map(),
    tails: [],
    stages: new Map(),
  };
  const top = stages.length > 0 ? 1 : 0;
  const lineOf = (i: number): number => top + i * GIT.LANE + 1;
  const end = maxCol < 0 ? 0 : cols.x[maxCol]! + half + cols.growRight[maxCol]!;
  const nameX = end + GIT.NAME_GAP;
  tracks.forEach((track, i) => {
    const y = lineOf(i);
    for (const c of track.commits) {
      const dot = { x: cols.x[columnOf(parts, c)]!, y };
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
    const lane = graph.lanes.find((l) => l.id === track.id);
    if (lane === undefined) return;
    const name = { x: nameX, y, text: oneLine(lane.node) };
    git.names.set(lane.id, name);
    placed.set(lane.id, { x: name.x, y, width: Math.max(1, cellWidth(name.text)), height: 1 });
    const from = tailFrom(parts, lane.id, git.dots);
    if (from !== undefined && from.x + 1 <= nameX - 2) {
      git.tails.push({ lane: lane.id, from: { x: from.x + 1, y }, to: { x: nameX - 2, y } });
    }
  });
  const bottom = tracks.length === 0 ? top : lineOf(tracks.length - 1) + 1;
  for (const s of stages) {
    const grow = cols.growth.get(s.id)!;
    const x = cols.x[s.fromCol]! - half - grow;
    placed.set(s.id, { x, y: 0, width: cols.x[s.toCol]! + half + grow - x, height: bottom + 1 });
    git.stages.set(s.id, { x: x + 2, y: 0, text: oneLine(s.node) });
  }
  return finished(parts, { git, placed, route: acrossRoute, looseY: bottom + 1 + GIT.STRAY_ROW });
}

/** The graph down the screen: a column a track, each as wide as its widest tag or its
 * name, the names along the foot. */
function down(parts: Parts): TextLayout {
  const { graph, tracks, stages, maxCol } = parts;
  const { PITCH, FRAME, LANE_GAP, NAME_GAP } = GIT_DOWN;
  // A tag is on its dot's row, so it takes no room between rows; a frame takes its reach.
  const frames = stages.map((s) => ({ ...s, width: (s.toCol - s.fromCol + 1) * PITCH + 2 * FRAME }));
  const rows = placeColumns({ maxCol, first: 0, pitch: PITCH, gap: 0, tags: [], frames });
  const nameY = (maxCol < 0 ? 0 : rows.x[maxCol]! + rows.growRight[maxCol]!) + NAME_GAP;

  const placed = new Map<string, BoxGeometry>();
  const git: GitDrawing = {
    down: true,
    dots: new Map(),
    tags: new Map(),
    names: new Map(),
    tails: [],
    stages: new Map(),
  };
  let x = stages.length > 0 ? GIT_DOWN.MARGIN : 0;
  let [last, reachEnd] = [x, x];
  for (const track of tracks) {
    let reach = 1;
    for (const c of track.commits) {
      const dot = { x, y: rows.x[columnOf(parts, c)]! };
      git.dots.set(c.id, dot);
      const text = oneLine(c);
      const width = cellWidth(text);
      if (width > 0) git.tags.set(c.id, { x: x + 2, y: dot.y, text });
      placed.set(c.id, { ...dot, width: width > 0 ? 2 + width : 1, height: 1 });
      reach = Math.max(reach, width > 0 ? 2 + width : 1);
    }
    const lane = graph.lanes.find((l) => l.id === track.id);
    if (lane !== undefined) {
      const name = { x, y: nameY, text: oneLine(lane.node) };
      git.names.set(lane.id, name);
      const width = Math.max(1, cellWidth(name.text));
      placed.set(lane.id, { x, y: nameY, width, height: 1 });
      reach = Math.max(reach, width);
      const from = tailFrom(parts, lane.id, git.dots);
      if (from !== undefined) git.tails.push({ lane: lane.id, from: { x, y: from.y + 1 }, to: { x, y: nameY - 1 } });
    }
    [last, reachEnd] = [x, x + reach];
    x += reach + LANE_GAP;
  }
  // Every frame is as wide as the picture, and as the widest title written past the
  // last track, where no lane's line crosses its border.
  let right = reachEnd + 1;
  for (const s of stages) right = Math.max(right, last + cellWidth(oneLine(s.node)) + GIT_DOWN.TITLE_ROOM);
  for (const s of stages) {
    const y = rows.x[s.fromCol]! - FRAME;
    placed.set(s.id, { x: 0, y, width: right + 1, height: rows.x[s.toCol]! + FRAME - y + 1 });
    git.stages.set(s.id, { x: last + 2, y, text: oneLine(s.node) });
  }
  return finished(parts, { git, placed, route: downRoute, looseY: nameY + 1 + GIT.STRAY_ROW });
}

/** How a git graph is drawn: on which plane, and across the screen or down it. */
export interface GitWay {
  plane?: string;
  /** across the screen, as the page draws it; absent = down it */
  across?: boolean;
}

/**
 * The graph in cells, for a git-graph plane: every node the view shows gets a box — a
 * commit its dot and tag, a lane its name, a stage its frame — and every drawn git
 * link between two dots a route from one to the other.
 */
export function gitCells(
  model: DiagramModel,
  view: CompiledView,
  boxes: ReadonlyMap<string, BoxText>,
  way: GitWay,
): TextLayout {
  const nodes = shownNodes(view);
  const shown = new Set(nodes.map((n) => n.id));
  const graph = gitGraph(model, way.plane);
  const tracks = tracksOf(graph, shown);
  const stages = graph.stages.filter((s) => shown.has(s.id));
  let maxCol = -1;
  for (const track of tracks) for (const c of track.commits) maxCol = Math.max(maxCol, graph.columns.get(c.id) ?? 0);
  for (const s of stages) maxCol = Math.max(maxCol, s.toCol);
  const parts: Parts = { model, graph, view, boxes, nodes, tracks, stages, maxCol };
  return way.across === true ? across(parts) : down(parts);
}
