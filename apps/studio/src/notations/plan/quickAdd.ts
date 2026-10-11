import {
  PLAN_EVENT_TYPE,
  PLAN_ZONE_TYPE,
  atOf,
  isPlanEvent,
  isPlanZone,
  isoOf,
  spanOf,
  type DiagramNode,
} from '@diagc/core/internal';
import { createNodeAt, placeTags } from '../../canvas-editing/create-node';
import {
  addConnected,
  lookOf,
  parentIn,
  type QuickAddRecipes,
  type QuickAddSource,
} from '../../canvas-editing/quickAddRecipe';

/** The dates of the source's successor: a zone's next runs as long and starts
 * the day after, an event's is a week later, both clamped into the parent. */
function nextDates(src: QuickAddSource, outerId: string | undefined): Record<string, string> {
  const { model, source } = src;
  const outer = outerId !== undefined ? spanOf(model.nodes.find((n) => n.id === outerId)!) : undefined;
  if (isPlanZone(source)) {
    const s = spanOf(source)!; // planQuickAdd only offers a successor for a usable span
    const len = s.end - s.start + 1;
    const start = outer !== undefined ? Math.min(s.end + 1, outer.end) : s.end + 1;
    const end = outer !== undefined ? Math.min(start + len - 1, outer.end) : start + len - 1;
    return { start: isoOf(start), end: isoOf(end) };
  }
  const next = atOf(source)! + 7; // planQuickAdd only offers a successor for a usable `at`
  return { at: isoOf(outer !== undefined ? Math.min(next, outer.end) : next) };
}

/**
 * A zone or event grows its own successor rather than an undated sibling that
 * would fail `plan-missing` on save. A zone or event with no usable dates
 * offers nothing: the successor is read from them and has no other anchor.
 * Anything else on a plan plane (a person, a borrowed container) gets the
 * generic sibling.
 */
export const planQuickAdd: QuickAddRecipes = (src) => {
  const { model, source, ctx } = src;
  const zone = isPlanZone(source);
  if (!zone && !isPlanEvent(source)) return undefined;
  if (zone ? spanOf(source) === undefined : atOf(source) === undefined) return 'none';
  return {
    label: zone ? 'Add the next zone' : 'Add the next event',
    build: () => {
      // The successor's parent is the source's own — a nested zone's next
      // zone/event stays inside the same outer zone, a root's stays a root.
      const parentId = parentIn(model, ctx.plane, source.id);
      const metadata = nextDates(src, parentId);
      const place = createNodeAt(model, {
        kind: zone ? 'zone' : 'event',
        plane: ctx.plane,
        borrowsContainment: ctx.borrowsContainment,
        parentId,
      });
      // A successor copies the source's look, the same channels a sibling
      // does — a row of tinted zones stays tinted.
      const node: DiagramNode = {
        id: place.id,
        name: '',
        type: zone ? PLAN_ZONE_TYPE : PLAN_EVENT_TYPE,
        ...lookOf(source),
        metadata,
        ...placeTags(place, ctx.penLayer),
      };
      return {
        id: place.id,
        // the source's row: date-locked x is ignored for a root zone/event,
        // but the y is what keeps the successor beside it rather than under
        // the roster; a nested successor is arranged by the layout anyway.
        beside: true,
        command: addConnected(src, node, place, src.kindTo(place.id)),
      };
    },
  };
};
