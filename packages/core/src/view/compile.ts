import type { DiagramModel, DiagramPlane } from '../types';
import { buildHierarchy, containmentPlaneOf } from './hierarchy';
import { computeLod } from './lod';
import { buildViewTree } from './tree';
import { resolveEdges } from './edges';
import { scopeToRoot } from './scope';
import type { CompiledView, ViewportState } from './types';

/** which plane's containment edges a view of `planeId` uses (resolves containmentOf).
 *  Kept here as the name the layout overlay is keyed by (see `layoutPlaneKey`);
 *  the resolution itself lives with the hierarchy, which also needs it. */
export function resolveContainmentPlane(m: DiagramModel, planeId?: string): string | undefined {
  return containmentPlaneOf(m, planeId);
}

/**
 * The layers a host's own layer switch should START from: the plane's presets,
 * with the plane resolved exactly as `compileView` resolves it (an absent id = the
 * first-declared plane). Returns a fresh array, so host state never aliases the
 * model's own `layers`.
 *
 * A host that shows layer toggles must seed with this — on load and on every
 * plane change — and pass its state as `ViewportState.activeLayers` from then on.
 * Seeding is what keeps "presets are the default" and "the user can turn a preset
 * off" from being contradictory: the default arrives once, as state, instead of
 * being re-applied underneath the user on every compile.
 */
export function presetLayers(planes: readonly DiagramPlane[], plane?: string): string[] {
  const p = plane !== undefined ? planes.find((x) => x.id === plane) : planes[0];
  return [...(p?.layers ?? [])];
}

export function compileView(m: DiagramModel, viewport: ViewportState): CompiledView {
  const planes = m.planes ?? [];
  const plane = viewport.plane !== undefined ? planes.find((p) => p.id === viewport.plane) : planes[0];
  // A plane's `layers` are the DEFAULT, not a floor: `activeLayers` undefined
  // means the host has no opinion, so the plane's presets apply; an array — even
  // an empty one — is the host's own choice and replaces them. Unioning the two
  // (what this did until the layer switch existed) made a preset layer
  // impossible to turn off, so a host with toggles seeds its state from
  // `plane.layers` and owns it from then on.
  const activeLayers = viewport.activeLayers ?? plane?.layers ?? [];
  const activeLayerSet = new Set(activeLayers);
  // The plane being viewed, not its containment donor: buildHierarchy resolves
  // `containmentOf` itself, and needs the viewed plane to read its `hides`.
  const hierarchy = buildHierarchy(m, viewport.plane, activeLayerSet);

  // Isolated drill view: swap in a model scoped to root's interior (+ external
  // stubs), then run the standard pipeline over it so LOD, promotion and edge
  // aggregation all work unchanged.
  if (viewport.root !== undefined && hierarchy.childrenOf.has(viewport.root)) {
    const scoped = scopeToRoot(m, hierarchy, viewport.root);
    const sh = buildHierarchy(scoped.model, undefined, activeLayerSet);
    const lod = computeLod({ hierarchy: sh, focus: viewport.focus, pins: viewport.pins });
    const tree = buildViewTree(scoped.model, sh, lod);
    for (const [stubId, rep] of scoped.externals) {
      const vn = tree.byId.get(stubId);
      if (vn !== undefined) vn.external = rep;
    }
    const edges = resolveEdges(scoped.model, tree, activeLayers, plane?.baseRelations ?? true);
    const layoutEdges = resolveEdges(scoped.model, tree, scoped.model.layers.map((l) => l.id), true);
    return { roots: tree.roots, edges, layoutEdges, lod, externals: scoped.externals };
  }

  const lod = computeLod({ hierarchy, focus: viewport.focus, pins: viewport.pins });
  const tree = buildViewTree(m, hierarchy, lod);
  const edges = resolveEdges(m, tree, activeLayers, plane?.baseRelations ?? true);
  const layoutEdges = resolveEdges(m, tree, m.layers.map((l) => l.id), true);
  return { roots: tree.roots, edges, layoutEdges, lod };
}
