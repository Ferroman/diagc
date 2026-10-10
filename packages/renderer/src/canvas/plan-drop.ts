import type { Node } from '@xyflow/react';
import type { Point } from '@diagc/core/internal';

/** A drop-target candidate's absolute box, in flow coordinates — what
 * useNodeDragging builds from `reactFlow.getInternalNode(id)?.internals` for
 * every node the active notation names a target (`profile.node.dropTarget`). */
export interface DropRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The deepest (smallest-area) rect that contains `point`, ignoring anything in
 * `exclude` — so a nested drop target wins over its containing ancestor even
 * though the ancestor's rect also covers the point (a zone inside a zone).
 * Pure so the hit test is provable without a pointer gesture: React Flow's
 * drag is one jsdom cannot drive (see DiagramView.test.tsx).
 */
export function dropTargetAt(
  point: Point,
  rects: readonly DropRect[],
  exclude: ReadonlySet<string>,
): string | undefined {
  let best: DropRect | undefined;
  for (const r of rects) {
    if (exclude.has(r.id)) continue;
    if (point.x < r.x || point.x > r.x + r.w || point.y < r.y || point.y > r.y + r.h) continue;
    if (best === undefined || r.w * r.h < best.w * best.h) best = r;
  }
  return best?.id;
}

/**
 * What a dragged box may not be dropped into: itself, its containment
 * descendants and its current parent, all read off React Flow's OWN parentId
 * chain — the same source commitMoves' own helper (savedPositions,
 * fit-containers.ts) walks for a node's ancestor chain, so a folded or
 * borrowed hierarchy never disagrees with what is drawn — and whatever the
 * notation says it is `related` to already.
 *
 * The outline is a promise: it says "let go here and something happens".
 * `related` is the notation's own statement of what this node is already
 * connected to without a drawn edge (for a plan actor: the zones it already
 * holds a role on, planRelated) — the studio's `assign` returns undefined for
 * exactly that pair, so offering the outline there would be a promise the
 * drop breaks silently.
 */
export function dropExclusions(nodes: readonly Node[], draggedId: string, related: readonly string[]): Set<string> {
  const exclude = new Set<string>([draggedId]);
  const parentId = nodes.find((n) => n.id === draggedId)?.parentId;
  if (parentId !== undefined) exclude.add(parentId);
  const childrenOfRf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId === undefined) continue;
    childrenOfRf.set(n.parentId, [...(childrenOfRf.get(n.parentId) ?? []), n.id]);
  }
  const queue = [...(childrenOfRf.get(draggedId) ?? [])];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    if (exclude.has(id)) continue;
    exclude.add(id);
    queue.push(...(childrenOfRf.get(id) ?? []));
  }
  for (const id of related) exclude.add(id);
  return exclude;
}
