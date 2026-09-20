import { useMemo } from 'react';
import { useNodes, ViewportPortal } from '@xyflow/react';
import { latestCommit, mergedAway, type DiagramModel } from '@diagc/core';
import { GIT_LAYOUT, gitGraphCached, gitNodeColors } from './git-layout';
import { absoluteRects } from './loops';

export interface GitLanesOverlayProps {
  model: DiagramModel;
  plane: string | undefined;
}

/** px between the circle's edge and the start of the tail */
const TAIL_START = 4;

/**
 * The run of lane line from each lane's rightmost commit to its label box —
 * the part of the reference no relation draws. Omitted when that commit was
 * merged away (Hotfix), when the lane is empty, or when nothing of it is on
 * screen. Reads rendered positions via the store like LoopLabelLayer, so it
 * follows drags and manual positions, and must be mounted inside <ReactFlow>.
 */
export function GitLanesOverlay({ model, plane }: GitLanesOverlayProps) {
  const nodes = useNodes();
  const rects = useMemo(() => absoluteRects(nodes), [nodes]);
  const tails = useMemo(() => {
    const g = gitGraphCached(model, plane);
    const colors = gitNodeColors(model, plane);
    const { MARGIN, LABEL_W } = GIT_LAYOUT;
    const out: { id: string; x1: number; x2: number; y: number; color: string | undefined }[] = [];
    for (const lane of g.lanes) {
      const last = latestCommit(g, lane.id);
      const band = rects.get(lane.id);
      if (last === undefined || band === undefined || mergedAway(model, last.id)) continue;
      const c = rects.get(last.id);
      if (c === undefined) continue;
      const x1 = c.x + c.width + TAIL_START;
      const x2 = band.x + band.width - MARGIN - LABEL_W;
      if (x2 <= x1) continue;
      out.push({ id: lane.id, x1, x2, y: c.y + c.height / 2, color: colors.get(lane.id) });
    }
    return out;
  }, [model, plane, rects]);
  return (
    <ViewportPortal>
      <svg className="dg-git-lanes" aria-hidden="true">
        {tails.map((t) => (
          <line key={t.id} className="dg-git-tail" x1={t.x1} y1={t.y} x2={t.x2} y2={t.y} stroke={t.color ?? 'var(--dg-edge)'} />
        ))}
      </svg>
    </ViewportPortal>
  );
}
