import { layoutPlaneKey, type DiagramModel, type LayoutOverlay } from '@diagramming/core';

/**
 * Fold a viewer's hand-placed positions into the diagram's layout overlay, ready
 * to POST to `/api/layouts/<name>`.
 *
 * Why this is safe for a diagram compiled from TypeScript: coordinates were
 * never part of the model. `compileFile` writes only the artifact under
 * `.diagrams/.artifacts/` and never touches `<name>.layout.json`, so a save here
 * survives every later re-generation — which is the whole reason meaning and
 * coordinates live in separate files.
 *
 * The overlay is merged, never rebuilt: it also carries `settings`, `sizes`,
 * `manual` and `export`, and a save that dropped a hand-written algorithm choice
 * to record two box positions would be a poor trade.
 *
 * Deliberately does NOT set `manual` for the plane. That switch turns automatic
 * layout off wholesale, which would leave any node added to the source later with
 * no position at all; `overlayPositions` already makes these coordinates win for
 * the nodes that have them while elk keeps arranging the rest.
 */
export function withSavedPositions(
  layout: LayoutOverlay | undefined,
  model: DiagramModel,
  plane: string | undefined,
  moved: Record<string, { x: number; y: number }>,
): LayoutOverlay {
  const key = layoutPlaneKey(model, plane);
  const base: LayoutOverlay = layout ?? { version: 1, planes: {} };
  return {
    ...base,
    planes: { ...base.planes, [key]: { ...base.planes[key], ...moved } },
  };
}
