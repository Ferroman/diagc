import { findElement, type ElementRef } from './elements';
import type { Comment, DiagramModel } from './types';
import { nextFreeId } from './util';

/** The element's comment list — `[]` when it carries none, undefined when there
 * is no such element (the two are different answers; see threatsOf). */
export function commentsOf(model: DiagramModel, t: ElementRef): readonly Comment[] | undefined {
  const el = findElement(model, t);
  return el === undefined ? undefined : (el.comments ?? []);
}

/**
 * Whether an element gets a note: threats, comments or links. The renderer
 * draws notes from this and layout pruning keeps note entries by it — the two
 * must never disagree, or an edit silently drops a note's saved place.
 * Structurally typed rather than
 * taking `DiagramNode | DiagramRelation`, so a relation (which carries no
 * `links`) answers the same question without a second predicate.
 */
export function hasNoteContent(el: {
  threats?: readonly unknown[];
  comments?: readonly unknown[];
  links?: readonly unknown[];
}): boolean {
  return (el.threats?.length ?? 0) > 0 || (el.comments?.length ?? 0) > 0 || (el.links?.length ?? 0) > 0;
}

/** First free `c<n>` — scoped to the element, like threat ids. */
export function nextCommentId(comments: readonly Comment[]): string {
  return nextFreeId('c', new Set(comments.map((c) => c.id)));
}
