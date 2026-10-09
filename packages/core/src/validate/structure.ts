import { BUILTIN_NOTATIONS, type DiagramModel } from '../types';
import { childrenOf } from '../children';
import { defaultPlaneOf } from '../planes';
import { report, type Ctx } from './context';

/** Duplicate layer ids, and `layerRules` that name a layer nobody declared (a
 * rule is the one place a layer can be referenced without a node or relation
 * carrying it, so it is checked here, right after the layers are known). */
export function validateLayers(ctx: Ctx): void {
  const { model, issues, layerIds } = ctx;
  for (const l of model.layers) {
    if (layerIds.has(l.id)) report(issues, 'duplicate-layer', `Duplicate layer id '${l.id}'`, l.id);
    layerIds.add(l.id);
  }
  (model.layerRules ?? []).forEach((rule, i) => {
    if (!layerIds.has(rule.layer)) {
      report(issues, 'unknown-layer', `layerRules[${i}] references unknown layer '${rule.layer}'`);
    }
  });
}

/** Plane declarations: duplicate ids, notation, containmentOf borrowing (unknown
 * target or chained borrow), and per-plane layer presets referencing a layer. */
export function validatePlanes(ctx: Ctx): void {
  const { issues, planeIds, layerIds, planes } = ctx;
  for (const p of planes) {
    if (planeIds.has(p.id)) report(issues, 'duplicate-plane', `Duplicate plane id '${p.id}'`, p.id);
    planeIds.add(p.id);
  }
  for (const p of planes) {
    if (
      p.notation !== undefined &&
      (typeof p.notation !== 'string' || !(BUILTIN_NOTATIONS as readonly string[]).includes(p.notation))
    ) {
      report(issues, 'unknown-notation', `Plane '${p.id}' has unknown notation '${String(p.notation)}'`, p.id);
    }
    if (p.containmentOf !== undefined) {
      const target = planes.find((t) => t.id === p.containmentOf);
      if (target === undefined) {
        report(
          issues,
          'unknown-plane',
          `Plane '${p.id}' borrows containment from unknown plane '${p.containmentOf}'`,
          p.id,
        );
      } else if (target.containmentOf !== undefined) {
        report(
          issues,
          'invalid-plane',
          `Plane '${p.id}' borrows containment from '${p.containmentOf}', which itself borrows — chains are not allowed`,
          p.id,
        );
      }
    }
    for (const layer of p.layers ?? []) {
      if (!layerIds.has(layer)) {
        report(issues, 'unknown-layer', `Plane '${p.id}' references unknown layer '${layer}'`, p.id);
      }
    }
  }
}

/** plane.hides and plane.hidesTree must reference existing, shared nodes. */
export function validatePlaneHides(ctx: Ctx): void {
  const { model, issues, nodeIds, planes } = ctx;
  const scopedPlaneOf = new Map(model.nodes.map((n) => [n.id, n.plane]));
  for (const p of planes) {
    for (const id of [...(p.hides ?? []), ...(p.hidesTree ?? [])]) {
      if (!nodeIds.has(id)) {
        report(issues, 'unknown-hidden-node', `Plane '${p.id}' hides unknown node '${id}'`, p.id);
      } else if (scopedPlaneOf.get(id) !== undefined) {
        report(
          issues,
          'redundant-hide',
          `Plane '${p.id}' hides node '${id}', which is already scoped to a plane`,
          p.id,
        );
      }
    }
  }
}

/** Containment edges: endpoints must exist; a plane-tagged edge must reference a
 * declared plane (and there must be planes at all). */
export function validateContainment(ctx: Ctx): void {
  const { model, issues, nodeIds, planeIds, planes } = ctx;
  for (const e of model.containment) {
    for (const end of [e.parent, e.child]) {
      if (!nodeIds.has(end)) {
        report(issues, 'dangling-endpoint', `Containment references unknown node '${end}'`, end);
      }
    }
    if (e.plane !== undefined) {
      if (planes.length === 0) {
        report(
          issues,
          'unknown-plane',
          `Containment '${e.parent}'>'${e.child}' is tagged with plane '${e.plane}' but no planes are declared`,
          e.plane,
        );
      } else if (!planeIds.has(e.plane)) {
        report(
          issues,
          'unknown-plane',
          `Containment '${e.parent}'>'${e.child}' references unknown plane '${e.plane}'`,
          e.plane,
        );
      }
    }
  }
}

/** Containment cycles are checked per plane — an edge pair spanning two planes
 * is legal. Emits one `containment-cycle` issue per offending plane. */
export function validateCycles(ctx: Ctx): void {
  const { model, issues } = ctx;
  const byPlane = new Map<string | undefined, DiagramModel['containment']>();
  for (const e of model.containment) {
    const key = e.plane ?? defaultPlaneOf(model);
    byPlane.set(key, [...(byPlane.get(key) ?? []), e]);
  }
  for (const [plane, edges] of byPlane) {
    const cycle = findContainmentCycle(edges);
    if (cycle) {
      report(
        issues,
        'containment-cycle',
        `Containment cycle${plane !== undefined ? ` in plane '${plane}'` : ''}: ${cycle.join(' -> ')}`,
        cycle[0],
      );
    }
  }
}

function findContainmentCycle(edges: DiagramModel['containment']): string[] | null {
  const children = childrenOf(edges);
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const c of children.get(id) ?? []) {
      const found = dfs(c);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  }

  for (const parent of children.keys()) {
    const found = dfs(parent);
    if (found) return found;
  }
  return null;
}
