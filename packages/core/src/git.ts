import type { DiagramModel, DiagramNode, DiagramRelation } from './types';
import { containmentPlaneOf } from './view/hierarchy';

/** The notation id a plane declares to be drawn as a git graph. */
export const GIT_NOTATION = 'git-graph' as const;
/** The three link kinds the layout understands. Any other kind between commits
 * is drawn as a plain edge and never moves a circle. */
export const GIT_KINDS = ['commit', 'branch', 'merge'] as const;
export type GitKind = (typeof GIT_KINDS)[number];
export const isGitKind = (k: string): k is GitKind => (GIT_KINDS as readonly string[]).includes(k);

/** A stage: a named frame drawn across EVERY lane, from one commit's column to
 * another's — "Development", "Release candidates", "Hotfix". It is a node of
 * this type whose span lives in its metadata (`from`, and optionally `to`, each
 * a commit id) rather than in containment: a commit already belongs to its lane,
 * and a stage cuts across lanes. */
export const GIT_STAGE_TYPE = 'git-stage' as const;

export interface GitStage {
  id: string;
  node: DiagramNode;
  /** first and last column the frame covers, inclusive (from ≤ to) */
  fromCol: number;
  toCol: number;
}

/** the commit id a stage names under `key`, if it names one at all */
export function stageCommit(n: DiagramNode, key: 'from' | 'to'): string | undefined {
  const raw = n.metadata?.[key];
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

export interface GitLane {
  id: string;
  node: DiagramNode;
  /** this lane's commits in declaration order */
  commits: DiagramNode[];
}

export interface GitGraph {
  /** `type: 'branch'` nodes in declaration order — top-to-bottom lane order */
  lanes: GitLane[];
  /** commit id → lane id */
  laneOf: Map<string, string>;
  /** commit id → column, every commit including strays */
  columns: Map<string, number>;
  /** `type: 'commit'` nodes no lane contains on this plane */
  strays: DiagramNode[];
  /** relation ids ignored to break cycles; empty for a valid graph */
  cycleEdges: string[];
  /** `type: 'git-stage'` nodes whose span resolves to columns, in declaration
   * order. One that names no known commit is left out (validation reports it). */
  stages: GitStage[];
}

/** `metadata.gap` as a count of empty columns: a non-negative integer, or a
 * string of digits (the studio's generic metadata editor stores strings). */
export function gapOf(n: DiagramNode): number {
  const raw = n.metadata?.['gap'];
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 ? raw : 0;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return 0;
}

/** true when the commit's segment ended in a merge (it has an outgoing `merge`). */
export function mergedAway(model: DiagramModel, commitId: string): boolean {
  return model.relations.some((r) => r.kind === 'merge' && r.from === commitId);
}

/**
 * Lanes, membership and columns for one plane. This is the ONE place that
 * answers "which lane is this commit on" and "which column does it take", so
 * the renderer's layout, the studio's panel and validation cannot disagree.
 * Containment is read the way the view reads it: the plane's own edges, or its
 * donor's when it borrows (`containmentOf`); untagged edges belong to the
 * default (first-declared) plane. Never throws — a cycle is cut, not reported
 * as an error here (validation does that from `cycleEdges`).
 */
export function gitGraph(model: DiagramModel, plane?: string): GitGraph {
  const planes = model.planes ?? [];
  const defaultPlane = planes[0]?.id;
  const active = containmentPlaneOf(model, plane) ?? plane ?? defaultPlane;
  const edges = model.containment.filter((e) => (e.plane ?? defaultPlane) === active);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const index = new Map(model.nodes.map((n, i) => [n.id, i]));
  const declared = (a: DiagramNode, b: DiagramNode): number => index.get(a.id)! - index.get(b.id)!;

  const laneOf = new Map<string, string>();
  const lanes: GitLane[] = [];
  for (const n of model.nodes) {
    if (n.type !== 'branch') continue;
    const members = edges
      .filter((e) => e.parent === n.id)
      .map((e) => byId.get(e.child))
      .filter((c): c is DiagramNode => c !== undefined && c.type === 'commit')
      .sort(declared);
    // Containment is a DAG; a commit two lanes claim belongs to the first one
    // declared, so every commit has exactly one row.
    const own = members.filter((c) => !laneOf.has(c.id));
    for (const c of own) laneOf.set(c.id, n.id);
    lanes.push({ id: n.id, node: n, commits: own });
  }
  const commits = model.nodes.filter((n) => n.type === 'commit');
  const strays = commits.filter((c) => !laneOf.has(c.id));
  const { columns, cycleEdges } = computeColumns(model.relations, commits, byId, index);
  const stages: GitStage[] = [];
  for (const n of model.nodes) {
    if (n.type !== GIT_STAGE_TYPE) continue;
    const from = stageCommit(n, 'from');
    const a = from !== undefined ? columns.get(from) : undefined;
    const b = columns.get(stageCommit(n, 'to') ?? from ?? '');
    if (a === undefined || b === undefined) continue;
    stages.push({ id: n.id, node: n, fromCol: Math.min(a, b), toCol: Math.max(a, b) });
  }
  return { lanes, laneOf, columns, strays, cycleEdges, stages };
}

/** The lane's rightmost commit (max column; ties go to the later declared). */
export function latestCommit(g: GitGraph, laneId: string): DiagramNode | undefined {
  const lane = g.lanes.find((l) => l.id === laneId);
  let best: DiagramNode | undefined;
  for (const c of lane?.commits ?? []) {
    if (best === undefined || (g.columns.get(c.id) ?? 0) >= (g.columns.get(best.id) ?? 0)) best = c;
  }
  return best;
}

/**
 * Longest-path columns over the git links: Kahn's algorithm, ready nodes taken
 * in declaration order so the result is stable under re-serialisation. When
 * nothing is ready but commits remain, the links form a cycle: the
 * earliest-declared remaining commit gives up its incoming links from other
 * remaining commits (recorded in `cycleEdges`) and the walk goes on.
 */
function computeColumns(
  relations: DiagramRelation[],
  commits: DiagramNode[],
  byId: Map<string, DiagramNode>,
  index: Map<string, number>,
): { columns: Map<string, number>; cycleEdges: string[] } {
  const ids = new Set(commits.map((c) => c.id));
  const links = relations.filter((r) => isGitKind(r.kind) && ids.has(r.from) && ids.has(r.to) && r.from !== r.to);
  const incoming = new Map<string, DiagramRelation[]>();
  const outgoing = new Map<string, DiagramRelation[]>();
  const indeg = new Map<string, number>(commits.map((c) => [c.id, 0]));
  for (const l of links) {
    incoming.set(l.to, [...(incoming.get(l.to) ?? []), l]);
    outgoing.set(l.from, [...(outgoing.get(l.from) ?? []), l]);
    indeg.set(l.to, indeg.get(l.to)! + 1);
  }
  const order = [...commits].sort((a, b) => index.get(a.id)! - index.get(b.id)!);
  const remaining = new Set(order.map((c) => c.id));
  const ready = order.filter((c) => indeg.get(c.id) === 0).map((c) => c.id);
  const dropped = new Set<string>();
  const cycleEdges: string[] = [];
  const columns = new Map<string, number>();
  while (remaining.size > 0) {
    if (ready.length === 0) {
      const victim = order.find((c) => remaining.has(c.id))!;
      for (const l of incoming.get(victim.id) ?? []) {
        if (!remaining.has(l.from) || dropped.has(l.id)) continue;
        dropped.add(l.id);
        cycleEdges.push(l.id);
        indeg.set(victim.id, indeg.get(victim.id)! - 1);
      }
      ready.push(victim.id);
    }
    ready.sort((a, b) => index.get(a)! - index.get(b)!);
    const id = ready.shift()!;
    remaining.delete(id);
    let col = 0;
    for (const l of incoming.get(id) ?? []) {
      if (!dropped.has(l.id)) col = Math.max(col, (columns.get(l.from) ?? 0) + 1);
    }
    columns.set(id, col + gapOf(byId.get(id)!));
    for (const l of outgoing.get(id) ?? []) {
      if (dropped.has(l.id)) continue;
      const d = indeg.get(l.to)! - 1;
      indeg.set(l.to, d);
      if (d === 0) ready.push(l.to);
    }
  }
  return { columns, cycleEdges };
}
