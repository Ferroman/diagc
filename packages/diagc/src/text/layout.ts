import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { CompiledView, ViewNode } from '@diagc/core/internal';
import type { CellPoint, CellRect } from './canvas';
import { DOWN, LEFT, RIGHT, UP } from './glyphs';
import type { BoxText } from './content';
import { cellWidth } from './width';

/** Where a box is, in whole cells from the picture's top-left corner. */
export type BoxGeometry = CellRect;

/** An edge's path. `points[0]` is the cell just outside the source box and the last
 * point the cell just outside the target box, where the arrowhead goes; consecutive
 * points differ on one axis only. On a fish (`FishDrawing`) a bone and a tick are
 * slanted instead, one cell a row, and end on the line they meet. */
export interface Route {
  points: CellPoint[];
  label?: CellPoint & { text: string };
}

/** What a fishbone is drawn with besides boxes and routes, where it is drawn as the
 * fish (fish.ts). */
export interface FishDrawing {
  /** the spine, along row `y` from its tail to the head's border */
  spine: { y: number; from: number; to: number };
  /** the effect, boxed at the spine's right end */
  head: string;
  /** the categories and causes, drawn as their words rather than boxed: each line
   * where it starts. A node's box in `boxes` is the cells its words take. */
  words: Map<string, (CellPoint & { text: string })[]>;
  /** the categories among `words`: their bones' labels */
  labels: Set<string>;
}

export interface TextLayout {
  width: number;
  height: number;
  boxes: Map<string, BoxGeometry>;
  routes: Map<string, Route>;
  fish?: FishDrawing;
}

/**
 * elk `layered`, in character cells: a node is as big as its text, and the gaps
 * are a few cells. elk's options do not inherit into nested graphs, and every one it
 * is not told falls back to its pixel-sized default (10, 12, 20 …), which in cells
 * opens tens of rows between the levels of a container — so this set goes on the
 * root and on every container alike.
 */
export const CELL_OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '4',
  'elk.layered.spacing.nodeNodeBetweenLayers': '2',
  'elk.spacing.edgeNode': '2',
  'elk.spacing.edgeEdge': '1',
  'elk.layered.spacing.edgeNodeBetweenLayers': '1',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '1',
  'elk.spacing.edgeLabel': '1',
  'elk.spacing.labelLabel': '0',
  'elk.spacing.labelNode': '0',
  'elk.spacing.portPort': '1',
  'elk.spacing.componentComponent': '4',
  'elk.separateConnectedComponents': 'true',
};

/** Inside a container's frame: the title row and a blank one above the children, a
 * row below, two columns either side. */
const CONTAINER_PADDING = '[top=2,left=2,bottom=1,right=2]';

/** The gaps for a flow. A cell is about twice as tall as it is wide, so a sideways
 * flow's gap between neighbours, counted in rows, is half a downward one's, counted in
 * columns, and its gap between levels twice: turned, the picture keeps its proportions. */
function cellOptions(direction: string): Readonly<Record<string, string>> {
  if (direction === 'DOWN' || direction === 'UP') return CELL_OPTIONS;
  return { ...CELL_OPTIONS, 'elk.spacing.nodeNode': '2', 'elk.layered.spacing.nodeNodeBetweenLayers': '4' };
}

const elk = new ELK();

function elkNode(vn: ViewNode, boxes: ReadonlyMap<string, BoxText>, direction: string): ElkNode {
  const box = boxes.get(vn.id);
  const width = box?.width ?? 5;
  const height = box?.height ?? 3;
  if (vn.state !== 'expanded' || vn.children.length === 0) return { id: vn.id, width, height };
  // layered works left to right and turns a vertical flow afterwards, and the minimum
  // size of a hierarchical node is read before the turn: under DOWN or UP it has to
  // be given as (height, width) to come out as (width, height). Measured on elkjs
  // 0.12 with INCLUDE_CHILDREN — layout.test.ts pins all four directions.
  const vertical = direction === 'DOWN' || direction === 'UP';
  return {
    id: vn.id,
    layoutOptions: {
      ...cellOptions(direction),
      'elk.direction': direction,
      'elk.padding': CONTAINER_PADDING,
      'elk.nodeSize.constraints': 'MINIMUM_SIZE',
      'elk.nodeSize.minimum': vertical ? `(${height}, ${width})` : `(${width}, ${height})`,
    },
    children: vn.children.map((c) => elkNode(c, boxes, direction)),
  };
}

function elkEdges(view: CompiledView, labels: ReadonlyMap<string, string>): ElkExtendedEdge[] {
  return view.layoutEdges.map((e) => {
    const text = labels.get(e.id) ?? '';
    return {
      id: e.id,
      sources: [e.from],
      targets: [e.to],
      ...(text !== '' ? { labels: [{ text, width: cellWidth(text), height: 1 }] } : {}),
    };
  });
}

type RoutedEdge = ElkExtendedEdge & { container?: string };

interface Collected {
  boxes: Map<string, BoxGeometry>;
  /** every elk node's absolute origin, unrounded, for translating routes */
  origins: Map<string, CellPoint>;
  edges: { edge: RoutedEdge; owner: CellPoint }[];
}

/** elk's tree, read back into absolute cells. A box's edges are rounded, not its
 * size, so two boxes elk set side by side stay side by side after rounding. */
function collect(root: ElkNode): Collected {
  const out: Collected = { boxes: new Map(), origins: new Map(), edges: [] };
  const walk = (n: ElkNode, ax: number, ay: number): void => {
    const x = ax + (n.x ?? 0);
    const y = ay + (n.y ?? 0);
    out.origins.set(n.id, { x, y });
    if (n !== root) {
      const left = Math.round(x);
      const top = Math.round(y);
      out.boxes.set(n.id, {
        x: left,
        y: top,
        width: Math.round(x + (n.width ?? 0)) - left,
        height: Math.round(y + (n.height ?? 0)) - top,
      });
    }
    for (const edge of (n.edges ?? []) as RoutedEdge[]) out.edges.push({ edge, owner: { x, y } });
    n.children?.forEach((c) => walk(c, x, y));
  };
  walk(root, 0, 0);
  return out;
}

const onBorder = (p: CellPoint, b: BoxGeometry): boolean => {
  const inX = p.x >= b.x && p.x < b.x + b.width;
  const inY = p.y >= b.y && p.y < b.y + b.height;
  return (inX && (p.y === b.y || p.y === b.y + b.height - 1)) || (inY && (p.x === b.x || p.x === b.x + b.width - 1));
};

/** An end that lands on its box's border, moved one cell towards where the route
 * comes from. elk ends a route ON the box's outline; a cell is either border or not,
 * and the border cell belongs to the box, so the end — the arrowhead — has to sit in
 * the next cell out (or in, for a container's edge to something inside it). */
function offBorder(end: CellPoint, from: CellPoint, box: BoxGeometry | undefined): CellPoint {
  if (box === undefined || !onBorder(end, box)) return end;
  if (from.x !== end.x) return { x: end.x + Math.sign(from.x - end.x), y: end.y };
  if (from.y !== end.y) return { x: end.x, y: end.y + Math.sign(from.y - end.y) };
  return end;
}

/** Where a box is from an end of a route that stops beside it: the direction (a
 * glyph mask bit) to step from the end to reach its border; undefined when the end is
 * not beside it. */
export function towardBox(end: CellPoint, g: BoxGeometry): number | undefined {
  const inX = end.x >= g.x && end.x < g.x + g.width;
  const inY = end.y >= g.y && end.y < g.y + g.height;
  if (inX && end.y === g.y + g.height) return UP;
  if (inX && end.y === g.y - 1) return DOWN;
  if (inY && end.x === g.x - 1) return RIGHT;
  if (inY && end.x === g.x + g.width) return LEFT;
  return undefined;
}

/** One cell's step in each direction. */
export const STEP: Readonly<Record<number, CellPoint>> = {
  [UP]: { x: 0, y: -1 },
  [DOWN]: { x: 0, y: 1 },
  [LEFT]: { x: -1, y: 0 },
  [RIGHT]: { x: 1, y: 0 },
};

const encloses = (outer: BoxGeometry, inner: BoxGeometry): boolean =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(v, high));

/** Where an end goes: beside its box (`offBorder`) — unless the box is a container
 * holding the other end, where it goes on the container's frame. Between a child and
 * its own frame there is no cell to spare, and an end moved outside would draw the
 * edge leaving the box it points into. */
function placeEnd(
  end: CellPoint,
  next: CellPoint,
  box: BoxGeometry | undefined,
  other: BoxGeometry | undefined,
): CellPoint {
  if (box === undefined || other === undefined || box === other || !encloses(box, other))
    return offBorder(end, next, box);
  return { x: clamp(end.x, box.x, box.x + box.width - 1), y: clamp(end.y, box.y, box.y + box.height - 1) };
}

/**
 * A route squeezed into one cell: a child flush against its own frame, where the
 * cell is the frame's. From the child, the route starts on the child's border, so
 * the cell has a way in; into the child, the cell is both ends, beside the child.
 * Anything else that folds to one cell is no route at all.
 */
function oneCell(cell: CellPoint, source: BoxGeometry | undefined, target: BoxGeometry | undefined): CellPoint[] {
  const out = source === undefined ? undefined : towardBox(cell, source);
  if (out !== undefined) return [{ x: cell.x + STEP[out]!.x, y: cell.y + STEP[out]!.y }, cell];
  if (target !== undefined && towardBox(cell, target) !== undefined) return [cell, cell];
  return [cell];
}

const sameCell = (a: CellPoint, b: CellPoint): boolean => a.x === b.x && a.y === b.y;

/** Where an end beside a corner of its box goes: beside the nearest cell of that side
 * that is not a corner, so the arrow points at the box and not at its corner. An end
 * beside the middle of a side, or not beside the box at all, stays. */
function besideSide(end: CellPoint, box: BoxGeometry): CellPoint {
  const toward = towardBox(end, box);
  if (toward === LEFT || toward === RIGHT) return { x: end.x, y: clamp(end.y, box.y + 1, box.y + box.height - 2) };
  if (toward === UP || toward === DOWN) return { x: clamp(end.x, box.x + 1, box.x + box.width - 2), y: end.y };
  return end;
}

/**
 * The route with its last point beside the side of its box (`besideSide`). A box one
 * line of text tall has one row between its corners, and on a sideways flow elk's ends
 * miss it: a lone end, in the middle of the side, is half a cell into that row and
 * rounds onto the border's, and several are spread over the whole side. Where the
 * last segment meets the side square on it moves along
 * with the end, staying straight; on a route of one segment that moves the other end
 * too, so where that one would leave the middle of its own box's side the route jogs
 * halfway instead.
 */
function slideEnd(points: CellPoint[], box: BoxGeometry | undefined, other: BoxGeometry | undefined): CellPoint[] {
  const end = points.at(-1)!;
  const before = points.at(-2)!;
  const to = box === undefined ? end : besideSide(end, box);
  if (sameCell(to, end)) return points;
  const [dx, dy] = [to.x - end.x, to.y - end.y];
  const squareOn = dx !== 0 ? before.x === end.x : before.y === end.y;
  if (!squareOn) return [...points.slice(0, -1), to];
  const moved = { x: before.x + dx, y: before.y + dy };
  const stays =
    points.length > 2 ||
    other === undefined ||
    (towardBox(moved, other) !== undefined && sameCell(besideSide(moved, other), moved));
  if (stays) return [...points.slice(0, -2), moved, to];
  const half = dy !== 0 ? Math.floor((before.x + end.x) / 2) : Math.floor((before.y + end.y) / 2);
  const jog =
    dy !== 0
      ? [
          { x: half, y: before.y },
          { x: half, y: to.y },
        ]
      : [
          { x: before.x, y: half },
          { x: to.x, y: half },
        ];
  return [before, ...jog, to];
}

/** Both ends of a route beside the sides of their boxes, not their corners. */
function offCorners(
  points: CellPoint[],
  source: BoxGeometry | undefined,
  target: BoxGeometry | undefined,
): CellPoint[] {
  const ended = slideEnd(points, target, source);
  return orthogonal(slideEnd([...ended].reverse(), source, target).reverse());
}

/** Points with repeats and straight-through middles dropped, and a corner put in
 * wherever rounding left two consecutive points apart on both axes. */
function orthogonal(points: readonly CellPoint[]): CellPoint[] {
  const out: CellPoint[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last !== undefined && last.x === p.x && last.y === p.y) continue;
    if (last !== undefined && last.x !== p.x && last.y !== p.y) out.push({ x: p.x, y: last.y });
    out.push(p);
  }
  return out.filter((p, i) => {
    const [a, b] = [out[i - 1], out[i + 1]];
    return a === undefined || b === undefined || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

function routeOf(
  entry: Collected['edges'][number],
  laid: Collected,
  labels: ReadonlyMap<string, string>,
): Route | undefined {
  const { edge, owner } = entry;
  const section = edge.sections?.[0];
  if (section === undefined) return undefined;
  // Under INCLUDE_CHILDREN elk states a route in the frame of the endpoints' lowest
  // common ancestor (`container`), not of the node the edge was declared on; see the
  // renderer's collectLaid for the long version.
  const o = (edge.container !== undefined ? laid.origins.get(edge.container) : undefined) ?? owner;
  const raw = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
    x: Math.round(o.x + p.x),
    y: Math.round(o.y + p.y),
  }));
  const points = orthogonal(raw);
  if (points.length < 2) return undefined;
  const [source, target] = [laid.boxes.get(edge.sources[0]!), laid.boxes.get(edge.targets[0]!)];
  points[0] = placeEnd(points[0]!, points[1]!, source, target);
  points[points.length - 1] = placeEnd(points.at(-1)!, points.at(-2)!, target, source);
  let placed = orthogonal(points);
  if (placed.length >= 2) placed = offCorners(placed, source, target);
  if (placed.length === 1) placed = oneCell(placed[0]!, source, target);
  if (placed.length < 2) return undefined;
  const text = labels.get(edge.id) ?? '';
  const spot = edge.labels?.[0];
  return {
    points: placed,
    ...(text !== '' && spot?.x !== undefined && spot.y !== undefined
      ? { label: { x: Math.round(o.x + spot.x), y: Math.round(o.y + spot.y), text } }
      : {}),
  };
}

/** Shifts everything so nothing sits left of or above the origin, and measures the
 * picture as what it holds. */
function normalize(boxes: Map<string, BoxGeometry>, routes: Map<string, Route>): TextLayout {
  const xs: number[] = [];
  const ys: number[] = [];
  const span = (x0: number, x1: number, y0: number, y1: number): void => {
    xs.push(x0, x1);
    ys.push(y0, y1);
  };
  for (const b of boxes.values()) span(b.x, b.x + b.width - 1, b.y, b.y + b.height - 1);
  for (const r of routes.values()) {
    for (const p of r.points) span(p.x, p.x, p.y, p.y);
    if (r.label !== undefined) span(r.label.x, r.label.x + cellWidth(r.label.text) - 1, r.label.y, r.label.y);
  }
  if (xs.length === 0) return { width: 0, height: 0, boxes, routes };
  const dx = -Math.min(0, ...xs);
  const dy = -Math.min(0, ...ys);
  const shift = <P extends CellPoint>(p: P): P => ({ ...p, x: p.x + dx, y: p.y + dy });
  if (dx !== 0 || dy !== 0) {
    for (const [id, b] of boxes) boxes.set(id, shift(b));
    for (const [id, r] of routes) {
      routes.set(id, { points: r.points.map(shift), ...(r.label !== undefined ? { label: shift(r.label) } : {}) });
    }
  }
  return { width: Math.max(...xs) + dx + 1, height: Math.max(...ys) + dy + 1, boxes, routes };
}

/**
 * Lays the view out in cells. Every one of `layoutEdges` takes part, drawn or not,
 * so that turning a layer on or off never moves a box (the renderer's rule); the
 * routes of the edges actually drawn are picked from the result by id.
 */
export async function layoutCells(
  view: CompiledView,
  boxes: ReadonlyMap<string, BoxText>,
  direction: string,
  labels: ReadonlyMap<string, string>,
): Promise<TextLayout> {
  if (view.roots.length === 0) return { width: 0, height: 0, boxes: new Map(), routes: new Map() };
  const graph: ElkNode = {
    id: '__root',
    layoutOptions: {
      ...cellOptions(direction),
      'elk.direction': direction,
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: view.roots.map((vn) => elkNode(vn, boxes, direction)),
    edges: elkEdges(view, labels),
  };
  const laid = collect(await elk.layout(graph));
  const routes = new Map<string, Route>();
  for (const entry of laid.edges) {
    const route = routeOf(entry, laid, labels);
    if (route !== undefined) routes.set(entry.edge.id, route);
  }
  return normalize(laid.boxes, routes);
}
