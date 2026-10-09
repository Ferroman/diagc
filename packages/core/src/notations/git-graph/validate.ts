import { notationPlane } from '../../planes';
import { report, type Ctx } from '../../validate/context';
import { GIT_NOTATION, GIT_STAGE_TYPE, gitGraph, isGitKind, stageCommit } from './git-graph';

/**
 * Git-graph conventions, applied wherever RENDERING would activate the git
 * profile — the same resolution `activeNotation` (view/compile.ts) uses: a
 * plane's own `notation` wins, otherwise the model-level `notation` applies.
 * That includes the zero-plane case (a model-level 'git-graph' with no planes
 * at all validates the whole, planeless model the way `gitLayout` draws it).
 * The layout never throws on a malformed graph — it cuts cycles and parks
 * strays — but an author should hear about it, so each convention is an issue
 * here. Rules read the FIRST plane whose EFFECTIVE notation is git; several
 * git planes per model is deferred.
 */
export function validateGit(ctx: Ctx): void {
  const { issues, m } = ctx;
  const where = notationPlane(m, GIT_NOTATION);
  if (where === undefined) return;
  const { plane } = where;
  const g = gitGraph(m, plane?.id);
  const typeOf = new Map(m.nodes.map((n) => [n.id, n.type]));
  const isCommit = (id: string): boolean => typeOf.get(id) === 'commit';
  const parents = new Map<string, { commit: number; branch: number }>();
  for (const r of m.relations) {
    if (!isGitKind(r.kind)) continue;
    // dangling endpoints are validateRelations' finding — don't double-report
    if (!ctx.nodeIds.has(r.from) || !ctx.nodeIds.has(r.to)) continue;
    if (!isCommit(r.from) || !isCommit(r.to)) {
      report(issues, 'git-link-endpoints', `Relation '${r.id}' (${r.kind}) must join two commit nodes`, r.id);
      continue;
    }
    const a = g.laneOf.get(r.from);
    const b = g.laneOf.get(r.to);
    if (a === undefined || b === undefined) continue; // reported per commit below
    const sameLane = a === b;
    if (r.kind === 'commit' && !sameLane) {
      report(issues, 'git-commit-lane', `Relation '${r.id}' (commit) must stay within one lane`, r.id);
      continue; // an out-of-lane link isn't a valid parent edge — don't also flag it as a git-parents conflict
    }
    if (r.kind !== 'commit' && sameLane) {
      report(issues, 'git-commit-lane', `Relation '${r.id}' (${r.kind}) must join commits of different lanes`, r.id);
      continue; // ditto
    }
    if (r.kind !== 'merge') {
      const p = parents.get(r.to) ?? { commit: 0, branch: 0 };
      p[r.kind] += 1;
      parents.set(r.to, p);
    }
  }
  for (const [id, p] of parents) {
    if (p.commit > 1) report(issues, 'git-parents', `Commit '${id}' has more than one incoming commit link`, id);
    if (p.branch > 1) report(issues, 'git-parents', `Commit '${id}' has more than one incoming branch link`, id);
  }
  const cut = g.cycleEdges[0];
  if (cut !== undefined) report(issues, 'git-cycle', `Git links form a cycle (cut at relation '${cut}')`, cut);
  for (const s of g.strays) {
    report(
      issues,
      'git-commit-outside-lane',
      `Commit '${s.id}' is not contained by a branch${plane !== undefined ? ` on plane '${plane.id}'` : ''}`,
      s.id,
    );
  }
  for (const n of m.nodes) {
    if (n.type !== GIT_STAGE_TYPE) continue;
    const from = stageCommit(n, 'from');
    if (from === undefined) {
      report(issues, 'git-stage-span', `Stage '${n.id}' names no 'from' commit in its metadata`, n.id);
      continue;
    }
    for (const id of [from, stageCommit(n, 'to')]) {
      if (id !== undefined && !isCommit(id))
        report(issues, 'git-stage-span', `Stage '${n.id}' spans '${id}', which is not a commit`, n.id);
    }
  }
  for (const n of m.nodes) {
    if (n.type !== 'commit') continue;
    const raw = n.metadata?.['gap'];
    if (raw === undefined) continue;
    const ok =
      (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) || (typeof raw === 'string' && /^\d+$/.test(raw));
    if (!ok) report(issues, 'git-gap', `Commit '${n.id}' has invalid gap '${String(raw)}'`, n.id);
  }
}
