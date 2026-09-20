import { gitGraph, latestCommit, nextCommitId, type DiagramModel, type EditorCommand } from '@diagc/core';

/**
 * A commit appended to `laneId` — node, containment and the link from the
 * lane's tip — as ONE batch, so it is one undo step and the model never passes
 * through a state validation refuses (a commit outside a lane, a link to a node
 * that is not there yet). The first commit on an empty lane has no link. Shared
 * by the Git panel's "Add commit" and the canvas `+`, so a commit is named,
 * contained and linked the same whichever created it.
 *
 * `plane` is the active plane; the base view (undefined) files the containment
 * under the default plane, which is where a git plane always is (the builder
 * makes it the first-declared one).
 */
export function appendCommit(
  model: DiagramModel,
  plane: string | undefined,
  laneId: string,
  opts: { tag?: string; gap?: number } = {},
): { command: EditorCommand; id: string } {
  const id = nextCommitId(model, laneId);
  const latest = latestCommit(gitGraph(model, plane), laneId);
  const planeId = plane ?? model.planes[0]?.id;
  const gap = opts.gap ?? 0;
  return {
    id,
    command: {
      type: 'batch',
      commands: [
        {
          type: 'add-node',
          node: { id, name: opts.tag ?? '', type: 'commit', ...(gap > 0 ? { metadata: { gap } } : {}) },
          parent: { id: laneId, ...(planeId !== undefined ? { plane: planeId } : {}) },
        },
        ...(latest !== undefined ? [{ type: 'add-relation' as const, from: latest.id, to: id, opts: { kind: 'commit' } }] : []),
      ],
    },
  };
}
