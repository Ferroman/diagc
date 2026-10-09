import type { DiagramNode } from '../../types';
import { isIsoDate } from '../../dates';
import { notationPlane } from '../../planes';
import { report, type Ctx } from '../../validate/context';
import { PLAN_NOTATION, atOf, dayOf, isPlanEvent, isPlanRole, isPlanZone, planGraph, spanOf } from './plan';

/**
 * Plan conventions. Dates are checked wherever they are (a plan-zone on any
 * notation is still a zone, like a threat on any element); nesting is checked
 * against the plan plane's containment when a plane declares the notation,
 * else the default plane's. Only `plan-role-target` is notation-gated, the
 * same plane pick as validateThreatModel — outside a plan, `owns` is just a
 * relation kind somebody chose.
 */
export function validatePlan(ctx: Ctx): void {
  const { m } = ctx;
  checkDates(ctx);
  const where = notationPlane(m, PLAN_NOTATION);
  const byId = new Map(m.nodes.map((n) => [n.id, n] as const));
  // `planGraph` is a full `buildHierarchy`, and this function runs on EVERY
  // model — validateGit and validateFishbone return before their derivations,
  // but this one cannot, because dates are checked whatever the notation. So
  // the graph is paid for only where there is something to nest; the date
  // check above and the role-target check below never touch it.
  if (m.nodes.some((n) => isPlanZone(n) || isPlanEvent(n))) checkNesting(ctx, where?.plane?.id, byId);
  if (where === undefined) return;
  checkRoleTargets(ctx, byId);
}

/** a zone has a real start and end, in order; an event a real `at` */
function checkDates(ctx: Ctx): void {
  const { issues, m } = ctx;
  const dateOr = (n: DiagramNode, key: 'start' | 'end' | 'at'): number | undefined => {
    const raw = n.metadata?.[key];
    if (raw === undefined) {
      report(issues, 'plan-missing', `'${n.id}' (${n.type}) has no '${key}' date`, n.id);
      return undefined;
    }
    if (!isIsoDate(raw)) {
      report(
        issues,
        'plan-date',
        `'${n.id}': '${key}' must be a real YYYY-MM-DD date, got ${JSON.stringify(raw)}`,
        n.id,
      );
      return undefined;
    }
    return dayOf(raw);
  };
  for (const n of m.nodes) {
    if (isPlanZone(n)) {
      const start = dateOr(n, 'start');
      const end = dateOr(n, 'end');
      if (start !== undefined && end !== undefined && end < start) {
        report(
          issues,
          'plan-span',
          `'${n.id}': end ${String(n.metadata?.end)} is before start ${String(n.metadata?.start)}`,
          n.id,
        );
      }
    } else if (isPlanEvent(n)) {
      dateOr(n, 'at');
    }
  }
}

/** a contained zone or event lies within its zone's span, on the plan's containment */
function checkNesting(ctx: Ctx, plane: string | undefined, byId: ReadonlyMap<string, DiagramNode>): void {
  const { issues, m } = ctx;
  const g = planGraph(m, plane);
  for (const [child, parentId] of g.parent) {
    const outer = spanOf(byId.get(parentId)!);
    const node = byId.get(child)!;
    if (outer === undefined) continue;
    const inner = spanOf(node) ?? (atOf(node) !== undefined ? { start: atOf(node)!, end: atOf(node)! } : undefined);
    if (inner === undefined) continue;
    if (inner.start < outer.start || inner.end > outer.end) {
      report(
        issues,
        'plan-nested',
        `'${child}' lies outside its zone '${parentId}' (${String(byId.get(parentId)!.metadata?.start)} … ${String(byId.get(parentId)!.metadata?.end)})`,
        child,
      );
    }
  }
}

/** under the plan notation, a role relation points at a zone */
function checkRoleTargets(ctx: Ctx, byId: ReadonlyMap<string, DiagramNode>): void {
  const { issues, m } = ctx;
  for (const r of m.relations) {
    if (!isPlanRole(r.kind)) continue;
    if (!ctx.nodeIds.has(r.from) || !ctx.nodeIds.has(r.to)) continue; // dangling ends are validateRelations' finding
    const target = byId.get(r.to);
    if (target !== undefined && !isPlanZone(target)) {
      report(
        issues,
        'plan-role-target',
        `Relation '${r.id}' (${r.kind}) must point at a plan-zone; '${r.to}' is ${target.type ?? 'untyped'}`,
        r.id,
      );
    }
  }
}
