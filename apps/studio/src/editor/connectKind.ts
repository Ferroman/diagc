import { TM_BOUNDARY_TYPE, TM_FLOW_KIND, TM_NOTATION, type DiagramModel, type NotationId } from '@diagc/core';

/**
 * The relation kind a plain canvas connect gesture creates under `notation`.
 *
 * Only the threat model reads the kind: `strideFor` offers a flow's own STRIDE
 * categories (T · I · D) first for `data-flow` alone, and the tm-flow-boundary
 * rule only inspects `data-flow` relations — so a drag that landed a `sync`
 * would silently opt out of both and have to be re-kinded by hand. Every other
 * notation derives its structure from the topology rather than the kind
 * (fishbone and second-order build their trees from any relation), so they keep
 * the plain `sync` default and existing diagrams draw exactly as before.
 *
 * The exception is a trust boundary at either end. A boundary is containment,
 * never a flow endpoint, so a `data-flow` touching one fails validation
 * (`tm-flow-boundary`) — and an invalid model does not autosave, so the gesture
 * would leave the diagram unsaveable until the author undid it. A boundary is a
 * big dashed box and an easy thing to start a drag from by accident, so the
 * gesture degrades to a plain `sync`: still wrong to draw, but a relation the
 * author can see, re-kind or delete rather than a wedged save.
 */
export function connectKind(
  notation: NotationId | undefined,
  model: DiagramModel | undefined,
  from: string,
  to: string,
): string {
  if (notation !== TM_NOTATION) return 'sync';
  const isBoundary = (id: string) => model?.nodes.find((n) => n.id === id)?.type === TM_BOUNDARY_TYPE;
  return isBoundary(from) || isBoundary(to) ? 'sync' : TM_FLOW_KIND;
}
