/** A drop-target candidate's absolute box, in flow coordinates — what
 * DiagramView builds from `reactFlow.getInternalNode(id)?.internals` for
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
  point: { x: number; y: number },
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
