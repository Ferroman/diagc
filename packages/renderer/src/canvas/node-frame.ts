import { GIT_STAGE_TYPE, isActivityChrome, type ViewNode } from '@diagc/core/internal';
import { FORCED_SIZE_SHAPES, LAYOUT_SIZED_TYPES } from '../layout/box-size';
import type { NodeGeometry } from '../layout/layout';
import type { NotationProfile } from '../notations';
import type { Registry, TypeStyle } from '../registry';
import type { RfNodeInput } from './adapter';

export interface NodeFrameContext {
  editing: boolean;
  profile: NotationProfile;
  typeRegistry: Registry<TypeStyle>;
  /** the ids the notation's layout fixed in place (LayoutResult.fixed) */
  fixed: ReadonlySet<string>;
}

/** How React Flow frames one box: whether it drags, how it keeps to its parent, how it is sized. */
export type NodeFrame = Pick<RfNodeInput, 'draggable' | 'className' | 'expandParent' | 'extent' | 'style' | 'zIndex'>;

/** The frame of the box `n` draws, laid out at `geo` inside `parent` (undefined at the top). */
export function nodeFrameProps(
  n: ViewNode,
  geo: NodeGeometry,
  parent: string | undefined,
  ctx: NodeFrameContext,
): NodeFrame {
  const dragLocked = ctx.fixed.has(n.id) && ctx.profile.node?.draggableWhenFixed?.(n.node) !== true;
  return {
    // A node the notation fixed (a fishbone's) takes no drag in either
    // mode — not even the pixel of jitter in a click, which React Flow
    // counts as one and which would save a position at the spot the node
    // already stood on: invisible until the fish next changed shape and
    // left the node behind with its lines floating. Still selectable —
    // which needs `nopan` back: React Flow drops it from a non-draggable
    // node, a press on one then pans the canvas, and a pan of one pixel
    // swallows the click. Edit mode only: in view mode every node pans
    // that way, and the effect spans the whole spine.
    //
    // A notation may except a node whose drag still means something (a
    // plan zone's or event's displacement is read as days): it drags,
    // and `fixed` still keeps the overlay from ever storing a position
    // for it.
    draggable: dragLocked ? false : undefined,
    className: dragLocked && ctx.editing ? 'nopan' : undefined,
    ...parentHold(n, parent, ctx),
    ...frameSize(n, geo, ctx),
  };
}

/**
 * Membership is edited in the node panel, not by dragging away, so a child
 * never leaves its box — the box gives way instead, live while dragging (React
 * Flow's expandParent) and for good once dropped (the fit pass in
 * useViewLayout). Both modes: an Alt-drag in view mode would otherwise carry the child
 * straight out through the wall. A notation that owns the arrangement sizes its
 * own rows, so there the old edit-mode clamp stays.
 *
 * ...unless the node is one this drag may DROP into a different parent
 * (useNodeDragging's dropTargetFor, onDropInto): a plan's plain node or actor,
 * already nested in a zone, still counts as droppable, and both
 * `extent: 'parent'` and `expandParent` would stop it ever reaching a
 * neighbouring zone — the clamp reads it as a reparent attempt to resist, the
 * drop feature reads the same gesture as the point. No notation today combines
 * a droppable node with `expandParent` (only the plan sets
 * `dropTarget`/`canDrop`, and the plan owns its layout, so it only ever reaches
 * the `extent` branch) — the `expandParent` omission is here anyway so a future
 * notation that did combine them would not grow the wrong box mid-drag toward a
 * sibling's.
 */
function parentHold(n: ViewNode, parent: string | undefined, ctx: NodeFrameContext): NodeFrame {
  if (parent === undefined) return {};
  if (ctx.profile.node?.dropTarget !== undefined && ctx.profile.node?.canDrop?.(n.node) === true) return {};
  if (ctx.profile.layout === undefined) return { expandParent: true };
  return ctx.editing ? { extent: 'parent' as const } : {};
}

function frameSize(n: ViewNode, geo: NodeGeometry, ctx: NodeFrameContext): NodeFrame {
  if (n.state === 'expanded') return { style: { width: geo.width, height: geo.height }, zIndex: -1 };
  // a stage frame is sized by the git layout and sits BEHIND the lanes it spans
  if (n.node.type === GIT_STAGE_TYPE) return { style: { width: geo.width, height: geo.height }, zIndex: -2 };
  if ((n.node.image !== undefined || n.node.shape !== undefined) && n.state === 'leaf')
    return { style: { width: geo.width, height: geo.height } };
  if (n.state === 'leaf' && n.node.type !== undefined && layoutSized(n.node.type, ctx))
    return { style: { width: geo.width, height: geo.height } };
  // An ordinary box keeps its CSS sizing, but never narrower than the box elk
  // laid out (box-size.ts estimates it): routes and gaps are computed against
  // that box, so a narrower drawn one leaves an orthogonal arrow starting in
  // mid-air beside it. A FLOOR, not a width — a label the estimate undershot
  // still grows the box rather than wrapping inside it. Only where elk placed
  // the node from such an estimate: a notation's own layout spaces its boxes off
  // LEAF_SIZE, and a CLD text node is deliberately free of the box minimum.
  if (ctx.profile.layout === undefined && !(ctx.profile.node?.typelessAsText === true && n.node.type === undefined))
    return { style: { minWidth: geo.width } };
  return {};
}

/**
 * A circle leaf (e.g. a git commit) has no CSS-natural size the way an
 * ordinary box does — .dg-circle-node zeroes out the base node's
 * min-width/padding and is sized entirely by its RF wrapper (width/height:
 * 100%). Without an explicit inline size, that wrapper collapses to its
 * border-only intrinsic size, so the layout's diameter must be applied
 * explicitly, same as image/shape leaves. Ordinary boxes and CLD text nodes
 * must NOT go through this branch — forcing sizes there would change their
 * existing CSS-driven sizing. …and a fishbone leaf, whose layout sizes it (see
 * LAYOUT_SIZED_TYPES). An EMPTY git lane is the activity-chrome case again: no
 * commits, so compiled 'leaf', while .dg-lane is width/height:100% of its
 * wrapper — without gitLayout's band size it is 0×0 and React Flow never shows
 * it (a node stays `visibility: hidden` until it measures). Keyed on the
 * notation, not the type: a branch-typed leaf anywhere else is an ordinary box.
 */
function layoutSized(type: string, ctx: NodeFrameContext): boolean {
  return (
    FORCED_SIZE_SHAPES.has(ctx.typeRegistry.resolve(type).shape) ||
    isActivityChrome(type) ||
    LAYOUT_SIZED_TYPES.has(type) ||
    ctx.profile.node?.isLane?.(type) === true
  );
}
