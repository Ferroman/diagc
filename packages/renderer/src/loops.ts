// Pure causal-loop (feedback loop) detection and R/B label placement.
// No React/xyflow imports — this module is plain graph math, shared by the
// loop-label overlay (LoopLabelLayer) and exercised directly in tests.

export type Polarity = '+' | '-';

export interface LoopEdgeInput {
  id: string;
  from: string;
  to: string;
  polarity?: Polarity;
}

/** the polarity shared by every given constituent polarity, iff all are
 * defined and agree; any missing polarity or any disagreement yields undefined
 * ("unknown"). Shared by the loop overlay (DiagramView aggregates each drawn
 * edge's constituent relations), the loop detector's arc collapse, and the
 * leverage analysis — so all three provably agree on what "unknown" means. */
export function combinePolarities(polarities: readonly (Polarity | undefined)[]): Polarity | undefined {
  let result: Polarity | undefined;
  for (const p of polarities) {
    if (p === undefined) return undefined;
    if (result === undefined) result = p;
    else if (result !== p) return undefined;
  }
  return result;
}

export type LoopKind = 'R' | 'B' | 'unknown';

export interface Loop {
  key: string;
  nodes: string[];
  edgeIds: string[];
  kind: LoopKind;
}

export interface FindLoopsOptions {
  maxLength?: number;
  maxLoops?: number;
  budget?: number;
}

export interface FindLoopsResult {
  loops: Loop[];
  truncated: boolean;
}

// A collapsed arc: all input edges sharing the same ordered (from,to) pair,
// merged into one graph edge for traversal.
interface Arc {
  from: string;
  to: string;
  polarity: Polarity | undefined;
  edgeIds: string[];
}

/**
 * Collapse parallel input edges per ordered (from,to). Combined polarity is
 * that value iff every contributing edge shares the same defined polarity;
 * otherwise undefined (any missing polarity, or any disagreement, poisons it
 * permanently — once undefined, later matching edges can't "fix" it).
 */
function collapseArcs(edges: readonly LoopEdgeInput[]): Map<string, Arc> {
  const arcs = new Map<string, Arc>();
  for (const e of edges) {
    // NUL-separated so a node id containing a plain delimiter can't collide
    // (e.g. "a"+"b c" vs "a b"+"c").
    const key = `${e.from}\0${e.to}`;
    const existing = arcs.get(key);
    if (existing === undefined) {
      arcs.set(key, { from: e.from, to: e.to, polarity: e.polarity, edgeIds: [e.id] });
      continue;
    }
    existing.edgeIds.push(e.id);
    existing.polarity = combinePolarities([existing.polarity, e.polarity]);
  }
  return arcs;
}

function classify(loopArcs: readonly Arc[]): LoopKind {
  let minusCount = 0;
  for (const arc of loopArcs) {
    if (arc.polarity === undefined) return 'unknown';
    if (arc.polarity === '-') minusCount++;
  }
  return minusCount % 2 === 0 ? 'R' : 'B';
}

function makeLoop(nodes: readonly string[], loopArcs: readonly Arc[]): Loop {
  return {
    key: nodes.join('→'),
    nodes: [...nodes],
    edgeIds: loopArcs.flatMap((a) => a.edgeIds),
    kind: classify(loopArcs),
  };
}

const idCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Canonical-start bounded DFS (the enumeration core of Johnson's algorithm,
 * without the blocked-set optimization — casual diagrams are small enough
 * that plain simple-path enumeration bounded by maxLength/budget is both fast
 * enough and much simpler to reason about). Enumeration runs to completion
 * (only the expansion `budget` can cut it short), so the final sort keeps the
 * genuinely shortest `maxLoops` — never an arbitrary start-order-dependent
 * subset, which would silently drop short loops rooted at higher-id nodes.
 */
export function findLoops(edges: readonly LoopEdgeInput[], opts?: FindLoopsOptions): FindLoopsResult {
  const maxLength = opts?.maxLength ?? 20;
  const maxLoops = opts?.maxLoops ?? 50;
  const budget = opts?.budget ?? 200_000;

  const arcMap = collapseArcs(edges);
  const arcs = [...arcMap.values()];

  const idSet = new Set<string>();
  for (const arc of arcs) {
    idSet.add(arc.from);
    idSet.add(arc.to);
  }
  const ids = [...idSet].sort(idCompare);
  const indexOf = new Map(ids.map((id, i) => [id, i]));

  const n = ids.length;
  const adjacency: { to: number; arc: Arc }[][] = Array.from({ length: n }, () => []);
  const selfArcs: Arc[] = [];
  for (const arc of arcs) {
    if (arc.from === arc.to) {
      selfArcs.push(arc);
      continue;
    }
    const fi = indexOf.get(arc.from);
    const ti = indexOf.get(arc.to);
    if (fi === undefined || ti === undefined) continue;
    adjacency[fi]?.push({ to: ti, arc });
  }
  for (const list of adjacency) list.sort((a, b) => a.to - b.to);
  selfArcs.sort((a, b) => idCompare(a.from, b.from));

  const raw: Loop[] = [];
  let expansions = 0;
  let budgetHit = false;

  for (const arc of selfArcs) raw.push(makeLoop([arc.from], [arc]));

  const pathIds: string[] = [];
  const pathArcs: Arc[] = [];
  const onPath = new Set<number>();

  function dfs(start: number, current: number): void {
    if (budgetHit) return;
    const neighbors = adjacency[current];
    if (neighbors === undefined) return;
    for (const { to, arc } of neighbors) {
      if (expansions >= budget) {
        budgetHit = true;
        return;
      }
      expansions++;
      if (to === start) {
        if (pathIds.length >= 2) raw.push(makeLoop(pathIds, [...pathArcs, arc]));
        continue;
      }
      if (to > start && !onPath.has(to) && pathIds.length < maxLength) {
        const id = ids[to];
        if (id === undefined) continue;
        onPath.add(to);
        pathIds.push(id);
        pathArcs.push(arc);
        dfs(start, to);
        pathArcs.pop();
        pathIds.pop();
        onPath.delete(to);
        if (budgetHit) return;
      }
    }
  }

  for (let s = 0; s < n; s++) {
    if (budgetHit) break;
    const startId = ids[s];
    if (startId === undefined) continue;
    pathIds.length = 0;
    pathArcs.length = 0;
    onPath.clear();
    pathIds.push(startId);
    onPath.add(s);
    dfs(s, s);
  }

  raw.sort((a, b) => a.nodes.length - b.nodes.length || idCompare(a.key, b.key));
  const loops = raw.slice(0, maxLoops);
  const truncated = budgetHit || raw.length > maxLoops;
  return { loops, truncated };
}

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LoopLabelPlacement {
  key: string;
  kind: LoopKind;
  x: number;
  y: number;
  direction: 'cw' | 'ccw' | 'none';
}

export interface PlaceOptions {
  labelRadius?: number;
  minLabelGap?: number;
  nodeMargin?: number;
  obstacles?: readonly NodeRect[];
}

interface Point {
  x: number;
  y: number;
}

const rectCenter = (r: NodeRect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

// Deterministic candidate positions fanning out from the centroid: the centroid
// itself, then concentric rings spaced ~one gap apart with ~gap-spaced points,
// starting due north and sweeping clockwise (screen y-down). Enough rings that a
// dense set of co-located loops declutters instead of stacking on the centroid.
const RING_COUNT = 6;

function candidateOffsets(cx: number, cy: number, minGap: number): Point[] {
  const candidates: Point[] = [{ x: cx, y: cy }];
  const step = Math.max(24, minGap);
  for (let ring = 1; ring <= RING_COUNT; ring++) {
    const dist = ring * step;
    const count = Math.max(4, Math.floor((2 * Math.PI * dist) / step));
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
      candidates.push({ x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist });
    }
  }
  return candidates;
}

function circleHitsRect(c: Point, radius: number, rect: NodeRect): boolean {
  const closestX = Math.max(rect.x, Math.min(c.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(c.y, rect.y + rect.height));
  const dx = c.x - closestX;
  const dy = c.y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

const SHOELACE_EPS = 1e-6;

function loopDirection(centers: readonly Point[]): 'cw' | 'ccw' | 'none' {
  if (centers.length < 3) return 'none';
  let area = 0;
  for (let i = 0; i < centers.length; i++) {
    const p1 = centers[i];
    const p2 = centers[(i + 1) % centers.length];
    if (p1 === undefined || p2 === undefined) continue;
    area += p1.x * p2.y - p2.x * p1.y;
  }
  area /= 2;
  if (Math.abs(area) < SHOELACE_EPS) return 'none';
  // Screen space is y-down, so a positive shoelace sum corresponds to a
  // clockwise-on-screen winding (the opposite of the usual math convention).
  return area > 0 ? 'cw' : 'ccw';
}

/**
 * Place one R/B/? label per loop, anchored just off the top-right corner of the
 * loop's canonical first node (so a badge sits *by* a node of its loop, not at
 * the diagram's shared centre), then nudged out along concentric rings to clear
 * obstacle rects and stay minLabelGap from already-placed labels — falling back
 * to the raw anchor if every candidate is blocked.
 */
export function placeLoopLabels(
  loops: readonly Loop[],
  rects: ReadonlyMap<string, NodeRect>,
  opts?: PlaceOptions,
): LoopLabelPlacement[] {
  const labelRadius = opts?.labelRadius ?? 15;
  const minLabelGap = opts?.minLabelGap ?? 36;
  const nodeMargin = opts?.nodeMargin ?? 8;
  const obstacles = opts?.obstacles ?? [...rects.values()];
  const radius = labelRadius + nodeMargin;
  const gap2 = minLabelGap * minLabelGap;

  const eligible = loops.filter((l) => l.nodes.every((id) => rects.has(id)));
  const ordered = [...eligible].sort((a, b) => a.nodes.length - b.nodes.length || idCompare(a.key, b.key));

  const placed: LoopLabelPlacement[] = [];
  const placedPoints: Point[] = [];

  for (const loop of ordered) {
    const memberRects = loop.nodes.map((id) => rects.get(id)).filter((r): r is NodeRect => r !== undefined);
    const centers = memberRects.map(rectCenter);

    // Anchor by the loop's canonical first node (findLoops roots each loop at its
    // min-id node), just off its top-right corner, so the badge reads as
    // belonging to that node's loop.
    const anchor = memberRects[0];
    if (anchor === undefined) continue;
    const cx = anchor.x + anchor.width + labelRadius + 6;
    const cy = anchor.y - labelRadius - 6;

    const direction = loopDirection(centers);

    let chosen: Point = { x: cx, y: cy };
    for (const cand of candidateOffsets(cx, cy, minLabelGap)) {
      const hitsObstacle = obstacles.some((o) => circleHitsRect(cand, radius, o));
      if (hitsObstacle) continue;
      const tooClose = placedPoints.some((p) => {
        const dx = p.x - cand.x;
        const dy = p.y - cand.y;
        return dx * dx + dy * dy < gap2;
      });
      if (tooClose) continue;
      chosen = cand;
      break;
    }

    placedPoints.push(chosen);
    placed.push({ key: loop.key, kind: loop.kind, x: chosen.x, y: chosen.y, direction });
  }

  return placed;
}

export function absoluteRects(
  nodes: readonly { id: string; position: { x: number; y: number }; parentId?: string; measured?: { width?: number; height?: number } }[],
): Map<string, NodeRect> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const resolving = new Set<string>();

  function resolveOffset(id: string): Point {
    const node = byId.get(id);
    if (node === undefined) return { x: 0, y: 0 };
    if (node.parentId === undefined || resolving.has(id)) return node.position;
    resolving.add(id);
    const parentOffset = resolveOffset(node.parentId);
    resolving.delete(id);
    return { x: node.position.x + parentOffset.x, y: node.position.y + parentOffset.y };
  }

  const result = new Map<string, NodeRect>();
  for (const n of nodes) {
    const width = n.measured?.width;
    const height = n.measured?.height;
    if (width === undefined || height === undefined) continue;
    const abs = resolveOffset(n.id);
    result.set(n.id, { x: abs.x, y: abs.y, width, height });
  }
  return result;
}
