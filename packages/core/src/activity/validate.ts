import { report, type Ctx } from '../validate/context';
import { ACTIVITY_FRAME_TYPE, ACTIVITY_LANE_TYPE, ACTIVITY_REGION_TYPE } from './activity';

/**
 * Activity-diagram structure, keyed purely on node types — no plane or
 * notation involvement (activity frames are ordinary vocabulary; several can
 * share a canvas). Deliberately minimal: the studio save API rejects invalid
 * models, so no rule here may make a normal editing sequence unsaveable —
 * loose leaf elements (palette drops not yet homed) are legal.
 */
export function validateActivity(ctx: Ctx): void {
  const { issues, model } = ctx;
  const typeOf = new Map(model.nodes.map((n) => [n.id, n.type]));
  const parentsOf = new Map<string, string[]>();
  for (const e of model.containment) {
    // dangling ids are validateContainment's finding — don't double-report
    if (!ctx.nodeIds.has(e.parent) || !ctx.nodeIds.has(e.child)) continue;
    if (typeOf.get(e.parent) === ACTIVITY_FRAME_TYPE && typeOf.get(e.child) !== ACTIVITY_LANE_TYPE) {
      report(
        issues,
        'activity-frame-children',
        `Activity frame '${e.parent}' may contain only lanes; '${e.child}' is not an activity-lane`,
        e.child,
      );
    }
    const ct = typeOf.get(e.child);
    if (ct === ACTIVITY_LANE_TYPE || ct === ACTIVITY_REGION_TYPE) {
      parentsOf.set(e.child, [...(parentsOf.get(e.child) ?? []), e.parent]);
    }
  }
  for (const n of model.nodes) {
    if (n.type === ACTIVITY_LANE_TYPE) {
      const ps = parentsOf.get(n.id) ?? [];
      if (ps.length === 0) {
        report(issues, 'activity-lane-parent', `Activity lane '${n.id}' must be contained by an activity-frame`, n.id);
      }
      for (const p of ps) {
        if (typeOf.get(p) !== ACTIVITY_FRAME_TYPE) {
          report(issues, 'activity-lane-parent', `Activity lane '${n.id}' has non-frame parent '${p}'`, n.id);
        }
      }
    } else if (n.type === ACTIVITY_REGION_TYPE) {
      // a loose region is legal (mid-edit); only a WRONG parent is a defect
      for (const p of parentsOf.get(n.id) ?? []) {
        if (typeOf.get(p) !== ACTIVITY_LANE_TYPE) {
          report(
            issues,
            'activity-region-parent',
            `Interruptible region '${n.id}' must sit inside a lane; parent '${p}' is not an activity-lane`,
            n.id,
          );
        }
      }
    }
  }
}
