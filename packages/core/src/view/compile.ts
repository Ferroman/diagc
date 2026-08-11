import type { DiagramModel } from '../types';
import { buildHierarchy } from './hierarchy';
import { computeLod } from './lod';
import { buildViewTree } from './tree';
import { resolveEdges } from './edges';
import { scopeToRoot } from './scope';
import type { CompiledView, ViewportState } from './types';

/** which plane's containment edges a view of `planeId` uses (resolves containmentOf) */
export function resolveContainmentPlane(m: DiagramModel, planeId?: string): string | undefined {
  const planes = m.planes ?? [];
  const plane = planeId !== undefined ? planes.find((p) => p.id === planeId) : planes[0];
  return plane?.containmentOf ?? plane?.id;
}

export function compileView(m: DiagramModel, viewport: ViewportState): CompiledView {
  const planes = m.planes ?? [];
  const plane = viewport.plane !== undefined ? planes.find((p) => p.id === viewport.plane) : planes[0];
  const activeLayerSet = new Set([...(viewport.activeLayers ?? []), ...(plane?.layers ?? [])]);
  const activeLayers = [...activeLayerSet];
  const hierarchy = buildHierarchy(m, resolveContainmentPlane(m, viewport.plane), activeLayerSet);

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
