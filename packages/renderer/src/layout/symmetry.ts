import type { CompiledView, Point, ViewNode } from '@diagc/core/internal';
import type { NodeGeometry } from './layout';

/** What the pass moves: parent-relative boxes, and routes and label spots in
 * absolute space — the three parts of a `LayoutResult` that carry positions. */
export interface Arrangement {
  geometry: Map<string, NodeGeometry>;
  routes: Map<string, Point[]>;
  labelSpots: Map<string, Point>;
}

type Axis = 'x' | 'y';

/** Two coordinates this close are one: elk's output is fractional, and a run
 * that reaches a box's edge is read as touching it. */
const EPS = 0.5;

/**
 * A row of one level, in the ORIGINAL absolute coordinates (what the routes are
 * expressed in): where it lies along the flow, the extent of its level across
 * it, how deep its level is, and how far everything in it moves across — its
 * own centring plus every enclosing level's.
 */
interface Band {
  level: string | null;
  depth: number;
  start: number;
  end: number;
  from: number;
  to: number;
  shift: number;
}

const size = (g: NodeGeometry, axis: Axis): number => (axis === 'x' ? g.width : g.height);
const moved = (g: NodeGeometry, axis: Axis, by: number): NodeGeometry =>
  axis === 'x' ? { ...g, x: g.x + by } : { ...g, y: g.y + by };
const movedPoint = (p: Point, axis: Axis, by: number): Point =>
  axis === 'x' ? { x: p.x + by, y: p.y } : { x: p.x, y: p.y + by };
const within = (v: number, lo: number, hi: number): boolean => v >= lo - EPS && v <= hi + EPS;
const deepest = (bands: readonly Band[]): Band | undefined =>
  bands.reduce<Band | undefined>((best, b) => (best === undefined || b.depth > best.depth ? b : best), undefined);

/**
 * Centre every row of every level on its level's axis — the symmetric setting.
 *
 * elk's balanced placement favours straight edges: a parent lands over ONE of
 * its children rather than over the middle of the row. This pass takes elk's
 * arrangement and slides each row (each column, for a sideways flow) so that
 * its middle is the middle of its level: the root's whole extent, or an open
 * container's content. Rows keep their internal spacing, so nothing overlaps
 * and no container has to grow.
 *
 * The routed edges follow. A point moves with the row it starts or ends in; a
 * bend in the gap between rows moves with the row its along-the-flow run comes
 * from; and a straight run between two rows that moved by different amounts is
 * bent in the gap between them, as elk would have routed it. Every lookup is
 * made in the ORIGINAL coordinates, which is why the bands are recorded before
 * anything is moved.
 */
export function centreLevels(view: CompiledView, arrangement: Arrangement, direction: string): Arrangement {
  const across: Axis = direction === 'RIGHT' || direction === 'LEFT' ? 'y' : 'x';
  const along: Axis = across === 'x' ? 'y' : 'x';
  const geometry = new Map(arrangement.geometry);
  const bands: Band[] = [];
  centreLevel(
    view.roots,
    { level: null, depth: 0, origin: { x: 0, y: 0 }, shift: 0 },
    { across, along, geometry, bands },
  );
  const axes = { across, along, bands };
  const routes = new Map([...arrangement.routes].map(([id, pts]) => [id, shiftRoute(pts, axes)]));
  const labelSpots = new Map(
    [...arrangement.labelSpots].map(([id, spot]) => [id, shiftLabel(spot, arrangement.routes.get(id) ?? [], axes)]),
  );
  return { geometry, routes, labelSpots };
}

interface Level {
  level: string | null;
  depth: number;
  /** the level's absolute origin, in the original coordinates */
  origin: Point;
  /** how far the level as a whole already moves across */
  shift: number;
}

interface Pass {
  across: Axis;
  along: Axis;
  geometry: Map<string, NodeGeometry>;
  bands: Band[];
}

interface Placed {
  node: ViewNode;
  geo: NodeGeometry;
  start: number;
  end: number;
  from: number;
  to: number;
}

function centreLevel(nodes: readonly ViewNode[], level: Level, pass: Pass): void {
  const { across, along, geometry } = pass;
  const boxes: Placed[] = [];
  for (const node of nodes) {
    const geo = geometry.get(node.id);
    if (geo === undefined) continue;
    const start = level.origin[along] + geo[along];
    const from = level.origin[across] + geo[across];
    boxes.push({ node, geo, start, end: start + size(geo, along), from, to: from + size(geo, across) });
  }
  if (boxes.length === 0) return;
  boxes.sort((a, b) => a.start - b.start);
  const from = Math.min(...boxes.map((b) => b.from));
  const to = Math.max(...boxes.map((b) => b.to));
  const axis = (from + to) / 2;
  for (const row of rowsOf(boxes)) {
    const rowFrom = Math.min(...row.map((b) => b.from));
    const rowTo = Math.max(...row.map((b) => b.to));
    const by = axis - (rowFrom + rowTo) / 2;
    const shift = level.shift + by;
    pass.bands.push({
      level: level.level,
      depth: level.depth,
      start: Math.min(...row.map((b) => b.start)),
      end: Math.max(...row.map((b) => b.end)),
      from,
      to,
      shift,
    });
    for (const b of row) {
      if (by !== 0) geometry.set(b.node.id, moved(b.geo, across, by));
      if (b.node.state !== 'expanded') continue;
      const origin: Point = along === 'x' ? { x: b.start, y: b.from } : { x: b.from, y: b.start };
      centreLevel(b.node.children, { level: b.node.id, depth: level.depth + 1, origin, shift }, pass);
    }
  }
}

/** Siblings sorted along the flow, grouped into rows: a box joins the open row
 * while it overlaps the row's extent along the flow. */
function rowsOf(sorted: readonly Placed[]): Placed[][] {
  const rows: Placed[][] = [];
  let row: Placed[] = [];
  let rowEnd = -Infinity;
  for (const b of sorted) {
    if (row.length > 0 && b.start >= rowEnd - EPS) {
      rows.push(row);
      row = [];
    }
    row.push(b);
    rowEnd = Math.max(rowEnd, b.end);
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

interface Axes {
  across: Axis;
  along: Axis;
  bands: readonly Band[];
}

/** the deepest row a point lies in, if any */
function bandOf(p: Point, { across, along, bands }: Axes): Band | undefined {
  return deepest(bands.filter((b) => within(p[across], b.from, b.to) && within(p[along], b.start, b.end)));
}

/** the deepest row an along-the-flow run touches or crosses, if any */
function bandCrossed(at: number, a: number, b: number, { bands }: Axes): Band | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return deepest(
    bands.filter((band) => within(at, band.from, band.to) && lo <= band.end + EPS && hi >= band.start - EPS),
  );
}

/** Where to bend a run leaving `band` toward `q`: the middle of the gap between
 * the band and the next row of the same level in that direction — the gap elk
 * itself routes through — and the run's own middle when there is no such row. */
function jogAt(band: Band, p: Point, q: Point, { along, bands }: Axes): number {
  const forward = q[along] > p[along];
  const siblings = bands.filter((b) => b.level === band.level && b !== band);
  const next = forward
    ? Math.min(...siblings.filter((b) => b.start >= band.end - EPS).map((b) => b.start))
    : Math.max(...siblings.filter((b) => b.end <= band.start + EPS).map((b) => b.end));
  const at = forward ? (band.end + next) / 2 : (next + band.start) / 2;
  const lo = Math.min(p[along], q[along]);
  const hi = Math.max(p[along], q[along]);
  return Number.isFinite(at) && at > lo && at < hi ? at : (lo + hi) / 2;
}

const isRun = (p: Point, q: Point, across: Axis): boolean => Math.abs(p[across] - q[across]) <= EPS;

/** the row each point of a route moves with: its own, else the one the run it
 * ends touches or crosses; undefined for a bend in a gap, which follows its
 * neighbours (see routeShifts) */
function routeBands(pts: readonly Point[], axes: Axes): (Band | undefined)[] {
  const { across, along } = axes;
  const bands: (Band | undefined)[] = pts.map((p) => bandOf(p, axes));
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    if (!isRun(p, q, across) || (bands[i] !== undefined && bands[i + 1] !== undefined)) continue;
    const crossed = bandCrossed(p[across], p[along], q[along], axes);
    if (crossed === undefined) continue;
    bands[i] ??= crossed;
    bands[i + 1] ??= crossed;
  }
  return bands;
}

/** each point's move across: its row's, else its predecessor's (its successor's
 * at the start); a route that touches no row at all stays where it is */
function routeShifts(bands: readonly (Band | undefined)[]): number[] {
  const shifts: (number | undefined)[] = [];
  for (let i = 0; i < bands.length; i++) shifts.push(bands[i]?.shift ?? shifts[i - 1]);
  for (let i = bands.length - 2; i >= 0; i--) shifts[i] ??= shifts[i + 1];
  return shifts.map((shift) => shift ?? 0);
}

function shiftRoute(pts: readonly Point[], axes: Axes): Point[] {
  const { across, along } = axes;
  const bands = routeBands(pts, axes);
  const shifts = routeShifts(bands);
  const corner = (a: number, c: number): Point => (along === 'x' ? { x: a, y: c } : { x: c, y: a });
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const shift = shifts[i]!;
    const here = movedPoint(p, across, shift);
    out.push(here);
    const q = pts[i + 1];
    if (q === undefined || !isRun(p, q, across) || shifts[i + 1] === shift) continue;
    // a run between rows that moved apart bends in the gap between them
    const band = bands[i];
    const at = band !== undefined ? jogAt(band, p, q, axes) : (p[along] + q[along]) / 2;
    out.push(corner(at, here[across]), corner(at, q[across] + shifts[i + 1]!));
  }
  return out;
}

/** a label moves with its row, else with the nearest point of its route */
function shiftLabel(spot: Point, route: readonly Point[], axes: Axes): Point {
  const own = bandOf(spot, axes);
  if (own !== undefined) return movedPoint(spot, axes.across, own.shift);
  let nearest: Point | undefined;
  let best = Infinity;
  for (const p of route) {
    const d = Math.hypot(p.x - spot.x, p.y - spot.y);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  if (nearest === undefined) return spot;
  const moved = shiftRoute([nearest], axes)[0]!;
  return movedPoint(spot, axes.across, moved[axes.across] - nearest[axes.across]);
}
