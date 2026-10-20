import type { DiagramModel, DiagramNode, DiagramRelation } from '../../types';
import { containmentOn, containmentPlaneOf } from '../../planes';
import { nextFreeId } from '../../util';

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

/** A commit's `metadata.gap` as a count of empty columns: a non-negative integer,
 * or a string of digits (the studio's generic metadata editor stores strings).
 * Undefined for anything else, which validation reports as `git-gap`. */
export function parseGap(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 ? raw : undefined;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return undefined;
}

/** The commit's gap; 0 when it has none or a malformed one. */
export function gapOf(node: DiagramNode): number {
  return parseGap(node.metadata?.['gap']) ?? 0;
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
  const edges = containmentOn(model, containmentPlaneOf(model, plane) ?? plane);
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

/** `${lane}-${n}` with the smallest n not yet taken — the DSL's naming, kept
 * unique even after deletions. Shared by the Git panel and the canvas `+` so
 * a commit is named the same whichever created it. */
export function nextCommitId(model: DiagramModel, laneId: string): string {
  return nextFreeId(`${laneId}-`, new Set(model.nodes.map((n) => n.id)));
}

/** The lane's rightmost commit (max column; ties go to the later declared). */
export function latestCommit(graph: GitGraph, laneId: string): DiagramNode | undefined {
  const lane = graph.lanes.find((l) => l.id === laneId);
  let best: DiagramNode | undefined;
  for (const c of lane?.commits ?? []) {
    if (best === undefined || (graph.columns.get(c.id) ?? 0) >= (graph.columns.get(best.id) ?? 0)) best = c;
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

/** A commit's tag as column placement sees it, in the drawing's own unit. */
export interface ColumnTag {
  col: number;
  /** what it hangs on, a lane or a spare row: tags on different rows never meet */
  row: string;
  /** how far it reaches left and right of its column's centre */
  left: number;
  right: number;
}

/** A stage frame as column placement sees it. */
export interface ColumnFrame {
  id: string;
  fromCol: number;
  toCol: number;
  /** the least width it needs: its title's */
  width: number;
}

/** What takes room in a git graph's columns, in the drawing's own unit: pixels on
 * the page, cells in the terminal. */
export interface ColumnRoom {
  /** the last column to place */
  maxCol: number;
  /** column 0's centre when nothing pushes it */
  first: number;
  /** neighbouring columns' distance when nothing needs more; a frame is as many
   * pitches wide as it spans columns */
  pitch: number;
  /** the least room between two tags on one row */
  gap: number;
  tags: readonly ColumnTag[];
  frames: readonly ColumnFrame[];
}

export interface ColumnPlaces {
  /** column → its centre */
  x: number[];
  /** column → how far a frame ending there reaches past its half pitch */
  growRight: number[];
  /** frame id → how far it reaches past its outer columns' half pitches, each side */
  growth: Map<string, number>;
}

/**
 * Where each column of a git graph stands, for the page and the terminal alike. A
 * column sits a pitch after the one before it, or further when what is drawn there
 * needs the room: a tag clears the previous tag on its row by `gap` and starts no
 * further left than zero, and a frame narrower than its title grows evenly on both
 * sides, so it stays centred on its commits and pushes its neighbours away. Every
 * constraint looks left, so one pass settles them all.
 */
export function placeColumns(room: ColumnRoom): ColumnPlaces {
  const { maxCol, pitch, gap } = room;
  const growLeft = new Array<number>(maxCol + 1).fill(0);
  const growRight = new Array<number>(maxCol + 1).fill(0);
  const growth = new Map<string, number>();
  for (const f of room.frames) {
    const grow = Math.max(0, f.width - (f.toCol - f.fromCol + 1) * pitch) / 2;
    growth.set(f.id, grow);
    growLeft[f.fromCol] = Math.max(growLeft[f.fromCol]!, grow);
    growRight[f.toCol] = Math.max(growRight[f.toCol]!, grow);
  }
  const tagsAt = new Map<number, ColumnTag[]>();
  for (const t of room.tags) tagsAt.set(t.col, [...(tagsAt.get(t.col) ?? []), t]);
  const x: number[] = [];
  const tagEnd = new Map<string, number>(); // row → right edge of its rightmost tag so far
  for (let col = 0; col <= maxCol; col++) {
    let at = (col === 0 ? room.first : x[col - 1]! + pitch + growRight[col - 1]!) + growLeft[col]!;
    const here = tagsAt.get(col) ?? [];
    for (const t of here) at = Math.max(at, t.left, (tagEnd.get(t.row) ?? -Infinity) + gap + t.left);
    x.push(at);
    for (const t of here) tagEnd.set(t.row, Math.max(tagEnd.get(t.row) ?? -Infinity, at + t.right));
  }
  return { x, growRight, growth };
}
