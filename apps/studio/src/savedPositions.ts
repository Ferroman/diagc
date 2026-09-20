import {
  layoutPlaneKey,
  withEdgeLabelPlacements,
  withUnfolded,
  type DiagramModel,
  type EdgeLabelPlacement,
  type LayoutOverlay,
} from '@diagc/core';

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
 * `unfolded` (the containers open on screen right now) is saved with them and
 * REPLACES the plane's list: a hand-placed interior only shows while its
 * container is open, so positions saved without it reopen as a fully folded
 * diagram that looks like the save did nothing. Omitted ⇒ the list is left
 * alone.
 *
 * `labels` are the edge labels slid along their edges in view mode; they merge
 * into the plane's `edgeLabels` the way `moved` merges into its positions.
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
  unfolded?: readonly string[],
  labels: Readonly<Record<string, Readonly<Record<string, EdgeLabelPlacement>>>> = {},
): LayoutOverlay {
  const key = layoutPlaneKey(model, plane);
  const base: LayoutOverlay = layout ?? { version: 1, planes: {} };
  // a save of nothing but folds or labels must not leave an empty position bucket behind
  const positioned: LayoutOverlay =
    Object.keys(moved).length === 0 ? base : { ...base, planes: { ...base.planes, [key]: { ...base.planes[key], ...moved } } };
  const placed = withEdgeLabelPlacements(positioned, key, labels);
  return unfolded === undefined ? placed : withUnfolded(placed, key, unfolded);
}

/** the containers a pins map holds open, as the sorted list the overlay saves */
export const unfoldedOf = (pins: Record<string, 'expanded' | 'collapsed'>): string[] =>
  Object.entries(pins)
    .filter(([, state]) => state === 'expanded')
    .map(([id]) => id)
    .sort();

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
 * `snapshot` non-null: merge those positions into the plane and set the flag;
 * `unfolded` rides along exactly as in `withSavedPositions` (a frozen picture
 * includes which boxes were open in it).
 * `null`: clear the flag and leave every position alone (the same non-destructive
 * "back to automatic" the edit toolbar's toggle performs). An emptied `manual`
 * map is dropped, mirroring `set-plane-layout` in core.
 */
export function withPlaneManual(
  layout: LayoutOverlay | undefined,
  model: DiagramModel,
  plane: string | undefined,
  snapshot: Record<string, { x: number; y: number }> | null,
  unfolded?: readonly string[],
  labels: Readonly<Record<string, Readonly<Record<string, EdgeLabelPlacement>>>> = {},
): LayoutOverlay {
  const key = layoutPlaneKey(model, plane);
  const base: LayoutOverlay = layout ?? { version: 1, planes: {} };
  const { manual: current = {}, ...rest } = base;
  if (snapshot === null) {
    const { [key]: _drop, ...kept } = current;
    return Object.keys(kept).length > 0 ? { ...rest, manual: kept } : rest;
  }
  const frozen: LayoutOverlay = withEdgeLabelPlacements(
    {
      ...rest,
      planes: { ...base.planes, [key]: { ...base.planes[key], ...snapshot } },
      manual: { ...current, [key]: true },
    },
    key,
    labels,
  );
  return unfolded === undefined ? frozen : withUnfolded(frozen, key, unfolded);
}
