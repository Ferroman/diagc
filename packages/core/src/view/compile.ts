import { BUILTIN_NOTATIONS, type DiagramModel, type DiagramPlane, type NotationId } from '../types';
import { viewedPlane } from '../planes';
import { buildHierarchy } from './hierarchy';
import { computeLod } from './lod';
import { buildViewTree } from './tree';
import { resolveEdges } from './edges';
import { scopeToRoot } from './scope';
import { visibleColumns } from '../columns';
import type { CompiledView, ViewNode, ViewportState } from './types';

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
  return [...(viewedPlane(planes, plane)?.layers ?? [])];
}

/**
 * The visual language of the view being shown: the resolved plane's `notation`
 * (an absent id = the first-declared plane, matching `compileView`). An
 * unrecognized id falls back to the default look (`undefined`) instead of
 * erroring — both the studio and the published viewer resolve it this way, so
 * an editable diagram and its published page always agree. `fallback` is the
 * model-level notation, used when the resolved plane declares none.
 */
export function activeNotation(
  planes: readonly DiagramPlane[],
  plane?: string,
  fallback?: string,
): NotationId | undefined {
  const id = viewedPlane(planes, plane)?.notation ?? fallback;
  return id !== undefined && (BUILTIN_NOTATIONS as readonly string[]).includes(id) ? (id as NotationId) : undefined;
}

export function compileView(model: DiagramModel, viewport: ViewportState): CompiledView {
  const plane = viewedPlane(model.planes ?? [], viewport.plane);
  // A plane's `layers` are the DEFAULT, not a floor: `activeLayers` undefined
  // means the host has no opinion, so the plane's presets apply; an array — even
  // an empty one — is the host's own choice and replaces them. Unioning the two
  // would make a preset layer impossible to turn off, so a host with toggles
  // seeds its state from `plane.layers` and owns it from then on.
  const activeLayers = viewport.activeLayers ?? plane?.layers ?? [];
  const activeLayerSet = new Set(activeLayers);
  // The plane being viewed, not its containment donor: buildHierarchy resolves
  // `containmentOf` itself, and needs the viewed plane to read its `hides`.
  const hierarchy = buildHierarchy(model, viewport.plane, activeLayerSet);

  // Isolated drill view: swap in a model scoped to root's interior (+ external
  // stubs), then run the standard pipeline over it so LOD, promotion and edge
  // aggregation all work unchanged.
  if (viewport.root !== undefined && hierarchy.childrenOf.has(viewport.root)) {
    const scoped = scopeToRoot(model, hierarchy, viewport.root);
    const sh = buildHierarchy(scoped.model, undefined, activeLayerSet);
    const lod = computeLod({ hierarchy: sh, focus: viewport.focus, pins: viewport.pins });
    const tree = buildViewTree(scoped.model, sh, lod);
    filterColumns(tree.byId.values(), activeLayerSet);
    for (const [stubId, rep] of scoped.externals) {
      const vn = tree.byId.get(stubId);
      if (vn !== undefined) vn.external = rep;
    }
    const edges = resolveEdges(scoped.model, tree, activeLayers, plane?.baseRelations ?? true);
    const layoutEdges = resolveEdges(
      scoped.model,
      tree,
      scoped.model.layers.map((l) => l.id),
      true,
    );
    return { roots: tree.roots, edges, layoutEdges, lod, externals: scoped.externals };
  }

  const lod = computeLod({ hierarchy, focus: viewport.focus, pins: viewport.pins });
  const tree = buildViewTree(model, hierarchy, lod);
  filterColumns(tree.byId.values(), activeLayerSet);
  const edges = resolveEdges(model, tree, activeLayers, plane?.baseRelations ?? true);
  const layoutEdges = resolveEdges(
    model,
    tree,
    model.layers.map((l) => l.id),
    true,
  );
  return { roots: tree.roots, edges, layoutEdges, lod };
}

/** Drops the rows of inactive column layers. Rows never take part in edge
 * resolution (a row is an anchor on its table, not a node), so this is purely
 * what the table draws, and how tall it is. */
function filterColumns(nodes: Iterable<ViewNode>, activeLayers: ReadonlySet<string>): void {
  for (const vn of nodes) {
    const all = vn.node.columns;
    if (all === undefined) continue;
    const shown = visibleColumns(all, activeLayers);
    if (shown !== all) vn.columns = shown;
  }
}
