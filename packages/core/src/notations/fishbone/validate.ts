import { notationPlane } from '../../planes';
import { report, reportContained, type Ctx } from '../../validate/context';
import {
  FB_CATEGORY_TYPE,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  FISHBONE_NOTATION,
  fishboneParents,
  fishboneTree,
  isFishboneNode,
} from './fishbone';

/**
 * Fishbone conventions, applied wherever RENDERING would activate the profile —
 * the same plane pick as validateGit. The tree derivation never throws and
 * simply leaves a malformed node off the fish; here each such node gets ONE
 * issue naming why, in this order: its own parent has the wrong type for it
 * (`fb-misplaced`); it hangs on a sub-cause (`fb-too-deep`); its chain never
 * reaches the effect (`fb-unattached`). A cause under a misplaced category is
 * therefore unattached, and the category is the misplaced one.
 *
 * `fb-unattached` is a warning, not an error: a cause dropped from the library
 * is unattached until it is connected, the renderer already parks it in the
 * stray row under the fish, and an error there made the diagram unsavable
 * mid-edit (and unopenable once on disk).
 */
export function validateFishbone(ctx: Ctx): void {
  const { issues, warnings, m } = ctx;
  const where = notationPlane(m, FISHBONE_NOTATION);
  if (where === undefined) return;
  const { plane } = where;

  const fb = m.nodes.filter(isFishboneNode);
  // An empty diagram — or one holding only a stray comment — is where every
  // fishbone diagram starts, and the studio never opens a model that already
  // has issues: the head is only wanted once there is something to hang on it.
  if (fb.length === 0) return;
  const effects = fb.filter((n) => n.type === FB_EFFECT_TYPE);
  if (effects.length === 0) {
    report(
      issues,
      'fb-no-effect',
      'A fishbone diagram needs an effect (a node of type fb-effect) at its head',
      plane?.id ?? m.id,
    );
  }
  for (const extra of effects.slice(1)) {
    report(issues, 'fb-many-effects', `'${extra.id}' is a second effect; a fishbone diagram has one head`, extra.id);
  }

  // The same parent pick fishboneTree makes — shared, so the rule can't drift between the two.
  const typeOf = new Map(fb.map((n) => [n.id, n.type]));
  const parentOf = fishboneParents(m);
  const tree = fishboneTree(m);
  const onFish = new Set<string>(tree.effect !== undefined ? [tree.effect] : []);
  const subIds = new Set<string>();
  for (const c of tree.categories) {
    onFish.add(c.id);
    for (const cause of c.causes) {
      onFish.add(cause.id);
      for (const s of cause.subs) {
        onFish.add(s);
        subIds.add(s);
      }
    }
  }
  for (const n of fb) {
    const parent = parentOf.get(n.id);
    if (n.type === FB_EFFECT_TYPE) {
      if (n.id === tree.effect && parent !== undefined) {
        report(
          issues,
          'fb-misplaced',
          `'${n.id}' is the effect and hangs on '${parent}'; the effect is the head, nothing explains it`,
          n.id,
        );
      }
      continue;
    }
    if (onFish.has(n.id)) continue;
    const parentType = parent !== undefined ? typeOf.get(parent) : undefined;
    if (n.type === FB_CATEGORY_TYPE && parent !== undefined && parentType !== FB_EFFECT_TYPE) {
      report(issues, 'fb-misplaced', `Category '${n.id}' hangs on '${parent}'; a category hangs on the effect`, n.id);
    } else if (n.type === FB_CAUSE_TYPE && parentType === FB_EFFECT_TYPE) {
      report(
        issues,
        'fb-misplaced',
        `Cause '${n.id}' hangs on the effect; a cause hangs on a category or on another cause`,
        n.id,
      );
    } else if (n.type === FB_CAUSE_TYPE && parent !== undefined && subIds.has(parent)) {
      report(
        issues,
        'fb-too-deep',
        `'${n.id}' hangs on the sub-cause '${parent}'; three levels below the effect is the limit`,
        n.id,
      );
    } else {
      report(warnings, 'fb-unattached', `'${n.id}' does not reach the effect`, n.id);
    }
  }
  // The fish and a group want the same rectangle.
  const fbIds = new Set(fb.map((n) => n.id));
  reportContained(
    ctx,
    plane,
    fbIds,
    'fb-contained',
    (child, parent) => `'${child}' sits inside '${parent}'; nothing on a fishbone diagram can be grouped`,
  );
}
