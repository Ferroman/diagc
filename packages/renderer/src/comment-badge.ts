/** comments/links on one element — the shape `buildNodeData` and
 * `buildEdgeData` put on the render data under `annotations`. */
export interface AnnotationCounts {
  comments: number;
  /** always 0 on the edge channel — a relation carries no `links` field, so
   * only a node's badge ever shows the ↗ */
  links: number;
}

export interface CommentBadgeProps {
  /** the comment count, or a link glyph when only links exist */
  text: string;
  title: string;
}

/**
 * What a comment badge says, derived once for the node's corner badge and the
 * edge's chip (the threat-badge.ts arrangement, for the same reason: the two
 * must never disagree). Nothing to say → no badge, unlike the threat badge's
 * `+` — a comment is written in the panel, not on the canvas.
 */
export function commentBadgeProps({ comments, links }: AnnotationCounts): CommentBadgeProps | undefined {
  if (comments === 0 && links === 0) return undefined;
  const parts: string[] = [];
  if (comments > 0) parts.push(`${comments} comment${comments === 1 ? '' : 's'}`);
  if (links > 0) parts.push(`${links} link${links === 1 ? '' : 's'}`);
  return { text: comments > 0 ? String(comments) : '↗', title: parts.join(', ') };
}
