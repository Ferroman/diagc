import { formatTransition, type DiagramNode } from '@diagc/core/internal';

/** A state's behaviours as the lines its compartment lists, `trigger [guard] / effect`. The one
 * place they are formatted, so the drawn node and the size the layout reserves for it agree. */
export const behaviorLines = (node: Pick<DiagramNode, 'behaviors'>): string[] =>
  (node.behaviors ?? []).map((b) => formatTransition(b));
