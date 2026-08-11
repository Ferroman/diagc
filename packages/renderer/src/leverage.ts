// Pure structural "leverage point" analysis for a causal-loop variable.
// No React/xyflow — plain signed-digraph math over the same LoopEdgeInput[] the
// loop overlay uses (so highlighted ids match what the canvas draws). Given a
// target variable it reports: the feedback loops it sits in, the upstream
// drivers that reach it (with net polarity), and the hubs that recur across its
// loops. Structural only — a CLD has no numbers, so no simulation.

import { combinePolarities, findLoops, type LoopEdgeInput, type LoopKind, type Polarity } from './loops';

/** net effect of a driver on the target along its shortest path(s) */
export type LeverageSign = '+' | '-' | 'mixed' | 'unknown';

export interface LeverageLoopRef {
  key: string;
  kind: LoopKind;
  /** number of variables in the loop */
  length: number;
  nodes: string[];
  edgeIds: string[];
}

export interface LeverageDriver {
  id: string;
  /** shortest hop count from this driver to the target */
  distance: number;
  sign: LeverageSign;
  /** how many of the target's loops this driver also belongs to */
  loopCount: number;
  /** one representative shortest path driver→target, for canvas highlighting */
  path: { nodes: string[]; edgeIds: string[] };
}

export interface LeverageHub {
  id: string;
  /** how many of the target's loops contain this variable */
  loopCount: number;
  /** net effect of this variable on the target along its shortest signed path */
  sign: LeverageSign;
}

export interface LeverageReport {
  target: string;
  loops: LeverageLoopRef[];
  drivers: LeverageDriver[];
  hubs: LeverageHub[];
}

// A collapsed arc between an ordered node pair (parallel edges merged); polarity
// is defined iff every contributing edge agrees, else undefined (unknown) — the
// same rule the loop overlay uses (see combinePolarities).
interface Arc {
  from: string;
  to: string;
  polarity: Polarity | undefined;
  edgeIds: string[];
}

function collapse(edges: readonly LoopEdgeInput[]): Arc[] {
  const map = new Map<string, Arc>();
  for (const e of edges) {
    const key = `${e.from}\0${e.to}`;
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, { from: e.from, to: e.to, polarity: e.polarity, edgeIds: [e.id] });
      continue;
    }
    existing.edgeIds.push(e.id);
    existing.polarity = combinePolarities([existing.polarity, e.polarity]);
  }
  return [...map.values()];
}

// A sign carried along a path: a concrete polarity, or 'unknown' once any
// unpolarized link is crossed.
type PathSign = Polarity | 'unknown';

/** polarity(edge) ⊗ downstream sign */
function combine(pol: Polarity | undefined, s: PathSign): PathSign {
  if (pol === undefined || s === 'unknown') return 'unknown';
  return pol === '+' ? s : s === '+' ? '-' : '+';
}

/** reduce the set of shortest-path signs reaching the target into a verdict */
function verdict(signs: ReadonlySet<PathSign>): LeverageSign {
  const hasPlus = signs.has('+');
  const hasMinus = signs.has('-');
  if (hasPlus && hasMinus) return 'mixed';
  if (signs.has('unknown')) return 'unknown';
  return hasPlus ? '+' : '-';
}

interface SignedReach {
  /** shortest hop count from each node to the BFS target (target itself: 0) */
  dist: Map<string, number>;
  /** the set of net signs along shortest paths from each node to the target */
  signs: Map<string, Set<PathSign>>;
  /** rebuild a representative shortest path from `from` to the target */
  pathTo: (from: string) => { nodes: string[]; edgeIds: string[] };
}

/**
 * Reverse BFS from `target` over collapsed arcs: for every node that can reach
 * `target`, its shortest distance, the set of net signs accumulated along the
 * shortest path(s), and a path reconstructor. The target is seeded at dist 0
 * with sign {'+'} (a variable's effect on itself is the identity).
 */
function reverseSignedBFS(arcs: readonly Arc[], target: string): SignedReach {
  const preds = new Map<string, Arc[]>();
  for (const arc of arcs) {
    const list = preds.get(arc.to);
    if (list === undefined) preds.set(arc.to, [arc]);
    else list.push(arc);
  }

  const dist = new Map<string, number>([[target, 0]]);
  const signs = new Map<string, Set<PathSign>>([[target, new Set<PathSign>(['+'])]]);
  const nextHop = new Map<string, { node: string; edgeIds: string[] }>();
  let frontier = [target];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      const d = dist.get(node)!;
      const downstream = signs.get(node)!;
      for (const arc of preds.get(node) ?? []) {
        const p = arc.from;
        if (p === target) continue; // the target is not its own driver
        const cand = d + 1;
        const best = dist.get(p);
        const contributed = new Set<PathSign>();
        for (const s of downstream) contributed.add(combine(arc.polarity, s));
        if (best === undefined || cand < best) {
          dist.set(p, cand);
          signs.set(p, contributed);
          nextHop.set(p, { node, edgeIds: arc.edgeIds });
          next.push(p);
        } else if (cand === best) {
          const set = signs.get(p)!;
          for (const s of contributed) set.add(s);
        }
      }
    }
    frontier = next;
  }

  const pathTo = (from: string): { nodes: string[]; edgeIds: string[] } => {
    const nodes = [from];
    const edgeIds: string[] = [];
    let cur = from;
    while (cur !== target) {
      const hop = nextHop.get(cur);
      if (hop === undefined) break;
      edgeIds.push(...hop.edgeIds);
      nodes.push(hop.node);
      cur = hop.node;
    }
    return { nodes, edgeIds };
  };

  return { dist, signs, pathTo };
}

export function analyzeLeverage(edges: readonly LoopEdgeInput[], target: string): LeverageReport {
  const arcs = collapse(edges);

  // Loops the target sits in, shortest-first.
  const loops: LeverageLoopRef[] = findLoops(edges)
    .loops.filter((l) => l.nodes.includes(target))
    .map((l) => ({ key: l.key, kind: l.kind, length: l.nodes.length, nodes: l.nodes, edgeIds: l.edgeIds }))
    .sort((a, b) => a.length - b.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // How many of the target's loops each variable belongs to.
  const loopCount = new Map<string, number>();
  for (const l of loops) for (const n of l.nodes) loopCount.set(n, (loopCount.get(n) ?? 0) + 1);

  const { dist, signs, pathTo } = reverseSignedBFS(arcs, target);

  const drivers: LeverageDriver[] = [...dist.keys()]
    .filter((id) => id !== target)
    .map((id) => ({
      id,
      distance: dist.get(id)!,
      sign: verdict(signs.get(id)!),
      loopCount: loopCount.get(id) ?? 0,
      path: pathTo(id),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.loopCount - a.loopCount ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const hubs: LeverageHub[] = [...loopCount.entries()]
    .filter(([id]) => id !== target)
    .map(([id, count]) => ({
      id,
      loopCount: count,
      sign: signs.has(id) ? verdict(signs.get(id)!) : 'unknown',
    }))
    .sort((a, b) => b.loopCount - a.loopCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { target, loops, drivers, hubs };
}

/** one direction of a two-variable dependency (from → to) */
export interface DependencyDirection {
  exists: boolean;
  /** net effect of `from` on `to` along the shortest signed path */
  sign: LeverageSign;
  /** shortest hop count; 0 when there is no path */
  distance: number;
  /** representative shortest path from → to, for canvas highlighting */
  path: { nodes: string[]; edgeIds: string[] };
}

export interface DependencyReport {
  from: string;
  to: string;
  /** from → to */
  forward: DependencyDirection;
  /** to → from */
  backward: DependencyDirection;
  /** the loop's kind when both directions exist, else null */
  loop: LoopKind | null;
}

function directionOf(arcs: readonly Arc[], from: string, to: string): DependencyDirection {
  if (from === to) return { exists: false, sign: 'unknown', distance: 0, path: { nodes: [], edgeIds: [] } };
  const { dist, signs, pathTo } = reverseSignedBFS(arcs, to);
  if (!dist.has(from)) return { exists: false, sign: 'unknown', distance: 0, path: { nodes: [], edgeIds: [] } };
  return { exists: true, sign: verdict(signs.get(from)!), distance: dist.get(from)!, path: pathTo(from) };
}

/** the closed loop's kind from its two half-path signs (even negatives = R) */
function loopKindFrom(a: LeverageSign, b: LeverageSign): LoopKind {
  if (a === 'mixed' || b === 'mixed' || a === 'unknown' || b === 'unknown') return 'unknown';
  const negatives = (a === '-' ? 1 : 0) + (b === '-' ? 1 : 0);
  return negatives % 2 === 0 ? 'R' : 'B';
}

/**
 * Causal dependency between two variables: the signed shortest path each way and,
 * when both exist, the kind of the feedback loop the two shortest paths close.
 * Structural only (a CLD has no numbers).
 */
export function analyzeDependency(
  edges: readonly LoopEdgeInput[],
  from: string,
  to: string,
): DependencyReport {
  const arcs = collapse(edges);
  const forward = directionOf(arcs, from, to);
  const backward = directionOf(arcs, to, from);
  const loop = forward.exists && backward.exists ? loopKindFrom(forward.sign, backward.sign) : null;
  return { from, to, forward, backward, loop };
}
