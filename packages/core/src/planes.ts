import { CommandError } from './command-error';
import type { ContainmentEdge, DiagramModel, DiagramPlane } from './types';

// Which plane a containment edge is on, and which plane's containment a view reads.
// An untagged edge is on the default plane, the first one declared. A plane with
// `containmentOf` draws another plane's containment instead of its own.

/** The default plane: the first one declared; undefined for a model without planes. */
export function defaultPlaneOf(model: DiagramModel): string | undefined {
  return (model.planes ?? [])[0]?.id;
}

/** Which plane's containment a view of `planeId` reads: the plane's own, or its
 * donor's when it borrows (`containmentOf`, one hop; chains are a validation
 * error). Omitted = the default plane. Undefined for an unknown id or a model
 * without planes. */
export function containmentPlaneOf(model: DiagramModel, planeId?: string): string | undefined {
  const planes = model.planes ?? [];
  const plane = planeId !== undefined ? planes.find((p) => p.id === planeId) : planes[0];
  return plane?.containmentOf ?? plane?.id;
}

/** Whether `edge` is on the plane `key`. An edge that names the default plane is on
 * it just like an untagged one: the builder names a plan's own plane on its
 * containment even when that plane is first, so the plan need not be declared first. */
export function isOnPlane(edge: ContainmentEdge, key: string | undefined, model: DiagramModel): boolean {
  return (edge.plane ?? defaultPlaneOf(model)) === key;
}

/** The containment edges on the plane `key`, in declaration order, which is sibling order. */
export function containmentOn(model: DiagramModel, key: string | undefined): ContainmentEdge[] {
  return model.containment.filter((e) => isOnPlane(e, key, model));
}

/**
 * A plane argument in the form a new containment edge is written in: an absent
 * plane stays absent, a borrowing plane resolves to its donor, and the default
 * plane collapses to undefined, so new edges on it are written untagged. Throws on
 * an unknown plane.
 *
 * Edges already in the model may still name the default plane, so compare them
 * against this result with isOnPlane, never `e.plane === canon`.
 */
export function canonicalPlane(model: DiagramModel, plane?: string): string | undefined {
  if (plane === undefined) return undefined;
  const planes = model.planes ?? [];
  const p = planes.find((x) => x.id === plane);
  if (p === undefined) throw new CommandError(`Unknown plane '${plane}'`);
  const resolved = p.containmentOf ?? p.id;
  return resolved === planes[0]?.id ? undefined : resolved;
}

/** The key a plane's entries are filed under in the layout overlay and the drawings
 * sidecar: the plane whose containment it reads, so a borrowing plane shares its
 * donor's positions. `'default'` for a model without planes. */
export function layoutPlaneKey(model: DiagramModel, plane?: string): string {
  return containmentPlaneOf(model, plane) ?? 'default';
}

/** Where `notation` is drawn: the first plane whose notation it is (the plane's own
 * `notation`, else the model's); `{}` for a model without planes whose notation it
 * is; undefined when nothing draws it. A notation's validation rules read that one
 * plane. */
export function notationPlane(model: DiagramModel, notation: string): { plane?: DiagramPlane } | undefined {
  const planes = model.planes ?? [];
  const plane = planes.find((p) => (p.notation ?? model.notation) === notation);
  if (plane !== undefined) return { plane };
  return planes.length === 0 && model.notation === notation ? {} : undefined;
}
