import { ACTIVITY_FRAME_TYPE, ACTIVITY_LANE_TYPE, isActivityChrome, type DiagramNode } from '@diagc/core/internal';
import type { QuickAddSide } from '@diagc/renderer';
import { createNodeAt, placeTags } from '../canvas-editing/create-node';
import { parentIn, type QuickAddRecipe, type QuickAddSource } from '../canvas-editing/quickAddRecipe';

/** A new band in the lane's frame, slotted next to it. */
function laneBeside(
  { model, source, ctx }: QuickAddSource,
  frame: string,
  side: QuickAddSide | undefined,
): QuickAddRecipe {
  const above = side === 'before';
  return {
    label: above ? 'Add a lane above' : 'Add a lane below',
    build: () => {
      // lanes stack in declaration order (arrangeActivityFrames), so the
      // containment slot IS the position — no set-position to write
      const place = createNodeAt(model, {
        kind: 'lane',
        plane: ctx.plane,
        borrowsContainment: ctx.borrowsContainment,
        parentId: frame,
      });
      const node: DiagramNode = { id: place.id, name: '', type: ACTIVITY_LANE_TYPE, ...placeTags(place, ctx.penLayer) };
      const slot = above ? { before: source.id } : { after: source.id };
      return {
        id: place.id,
        beside: false,
        command: { type: 'batch', commands: [{ type: 'add-node', node, parent: { ...place.parent!, ...slot } }] },
      };
    },
  };
}

/**
 * The activity's rules, asked before any notation's: they are keyed by node
 * type, and activity chrome sits on any notation's plane. A lane is a band of
 * its frame, and only a lane actually in a frame has a sibling band (Tab adds
 * below). The rest of the chrome (a frame, a region) never carries a `+`, and
 * `+` and Tab are one action, so it offers nothing to Tab either. Undefined
 * leaves the source to the notation.
 */
export function activityQuickAdd(
  src: QuickAddSource,
  side: QuickAddSide | undefined,
): QuickAddRecipe | 'none' | undefined {
  const { model, source, ctx } = src;
  if (source.type === ACTIVITY_LANE_TYPE) {
    const frame = parentIn(model, ctx.plane, source.id);
    if (frame === undefined || model.nodes.find((n) => n.id === frame)?.type !== ACTIVITY_FRAME_TYPE) return 'none';
    return laneBeside(src, frame, side);
  }
  return isActivityChrome(source.type) ? 'none' : undefined;
}
