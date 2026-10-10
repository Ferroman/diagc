import type { NodeChange } from '@xyflow/react';

const isExpansionResize = (c: NodeChange): boolean =>
  c.type === 'dimensions' && c.setAttributes === true && c.resizing === undefined;

/**
 * Keep React Flow's `expandParent` to the drag it is wanted for.
 *
 * A child with `expandParent` grows its container while it is dragged — the
 * behaviour we want. But React Flow runs the same check every time a child is
 * (re)MEASURED, and answers a child that does not fit by PINNING the parent's
 * width/height as node attributes (which outrank the `style` size the layout
 * hands over) and, when the child pokes out left/up, by moving the parent and
 * re-expressing its other children. Outside a drag that is never right here:
 *
 *  - after an unfold the parent is still gliding up from its folded size when
 *    its children are first measured, so it gets pinned a few px short and stays
 *    there until the next resync;
 *  - a container's size and origin are the layout's and the fit pass's business
 *    (fit-containers.ts). Applying React Flow's version on top moves boxes the
 *    next derive moves straight back, which measures them again — a resize loop.
 *
 * So outside a drag, a batch that carries such an expansion loses it: the pinned
 * size AND the position changes that came with it (a measurement never moves a
 * node otherwise, so every position change in that batch is the expansion's).
 * A resize carries `resizing` and passes untouched.
 */
export function withoutMeasuredExpansion(changes: NodeChange[], dragging: boolean): NodeChange[] {
  if (dragging || !changes.some(isExpansionResize)) return changes;
  return changes.filter((c) => !isExpansionResize(c) && c.type !== 'position');
}
