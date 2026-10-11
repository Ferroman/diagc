import { gitGraph, latestCommit, type DiagramModel, type DiagramNode } from '@diagc/core/internal';
import type { QuickAddRecipes } from '../../canvas-editing/quickAddRecipe';
import { appendCommit } from './gitActions';

/**
 * The lane a `+` on `source` appends to: the lane itself, or the commit at a
 * lane's tip. Only the tip, because a second child of one commit on the same
 * lane is a fork — which git draws as a branch, the panel's job — and the
 * layout would stack the two circles in one column (computeColumns has no
 * collision check). A mid-lane or stray commit therefore offers nothing, and
 * so does anything that is neither lane nor commit (a stage frame, a comment).
 * `gitGraph` is the panel's own lane/tip answer, so the two cannot disagree.
 */
function gitLaneToGrow(model: DiagramModel, source: DiagramNode, plane: string | undefined): string | undefined {
  if (source.type === 'branch') return source.id;
  if (source.type !== 'commit') return undefined;
  const g = gitGraph(model, plane);
  const lane = g.laneOf.get(source.id);
  return lane !== undefined && latestCommit(g, lane)?.id === source.id ? lane : undefined;
}

/** A git graph grows at a lane's tip; branching and merging need a target lane
 * the `+` cannot ask for, so they stay in the Git panel. */
export const gitGraphQuickAdd: QuickAddRecipes = ({ model, source, ctx }) => {
  const lane = gitLaneToGrow(model, source, ctx.plane);
  if (lane === undefined) return 'none';
  return { label: 'Add a commit', build: () => ({ beside: false, ...appendCommit(model, ctx.plane, lane) }) };
};
