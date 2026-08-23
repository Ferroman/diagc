import { BUILTIN_NOTATIONS, type DiagramPlane, type NotationId } from '@diagramming/core';

/**
 * The visual language of the view being shown. No plane picked means the
 * default view, whose containment IS the first plane's — so it takes that
 * plane's notation too, as the published page does. An unknown id falls back
 * to the default look instead of erroring.
 */
export function activeNotation(planes: readonly DiagramPlane[], activePlane: string | undefined): NotationId | undefined {
  const plane = activePlane !== undefined ? planes.find((p) => p.id === activePlane) : planes[0];
  const id = plane?.notation;
  return id !== undefined && (BUILTIN_NOTATIONS as readonly string[]).includes(id) ? (id as NotationId) : undefined;
}
