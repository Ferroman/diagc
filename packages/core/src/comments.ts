import type { ThreatTarget } from './threat-model';
import type { Comment, DiagramModel } from './types';

/** Which element a comment command or a bubble refers to. The same two-way key
 * threats use (`threatTargetKey` files both under `LayoutOverlay.notes`): an
 * element has ONE bubble, whatever it holds. */
export type ElementTarget = ThreatTarget;

/** The element's comment list — `[]` when it carries none, undefined when there
 * is no such element (the two are different answers; see threatsOf). */
export function commentsOf(m: DiagramModel, t: ElementTarget): readonly Comment[] | undefined {
  const el = 'node' in t ? m.nodes.find((n) => n.id === t.node) : m.relations.find((r) => r.id === t.relation);
  return el === undefined ? undefined : (el.comments ?? []);
}

/** First free `c<n>` — scoped to the element, like threat ids. */
export function nextCommentId(comments: readonly Comment[]): string {
  const taken = new Set(comments.map((c) => c.id));
  let n = 1;
  while (taken.has(`c${n}`)) n += 1;
  return `c${n}`;
}
