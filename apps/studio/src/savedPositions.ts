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

/**
 * Switch a plane's manual-layout flag, optionally pinning a snapshot of every
 * node's current position at the same time — the view-mode `Freeze layout`
 * chip. This IS the deliberate act `withSavedPositions` refuses to take.
 *
 * What the flag means: the renderer never reads it (elk runs on every frame;
 * saved positions simply win over its output). It tells the studio to stop
 * offering the plane to the algorithm and to pin nodes it creates — so a node
 * added to the source later still gets an automatic position until it is moved.
 *
 * `snapshot` non-null: merge those positions into the plane and set the flag.
 * `null`: clear the flag and leave every position alone (the same non-destructive
 * "back to automatic" the edit toolbar's toggle performs). An emptied `manual`
 * map is dropped, mirroring `set-plane-layout` in core.
 */
export function withPlaneManual(
  layout: LayoutOverlay | undefined,
  model: DiagramModel,
  plane: string | undefined,
  snapshot: Record<string, { x: number; y: number }> | null,
): LayoutOverlay {
  const key = layoutPlaneKey(model, plane);
  const base: LayoutOverlay = layout ?? { version: 1, planes: {} };
  const { manual: current = {}, ...rest } = base;
  if (snapshot === null) {
    const { [key]: _drop, ...kept } = current;
    return Object.keys(kept).length > 0 ? { ...rest, manual: kept } : rest;
  }
  return {
    ...rest,
    planes: { ...base.planes, [key]: { ...base.planes[key], ...snapshot } },
    manual: { ...current, [key]: true },
  };
}
