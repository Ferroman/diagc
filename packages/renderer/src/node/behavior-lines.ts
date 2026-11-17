import { formatTransition, type DiagramNode } from '@diagc/core/internal';

/** A state's behaviours as the lines its compartment lists, `trigger [guard] / effect`. The one
 * place they are formatted, so the drawn node and the size the layout reserves for it agree. */
export const behaviorLines = (node: Pick<DiagramNode, 'behaviors'>): string[] =>
  (node.behaviors ?? []).map((b) => formatTransition(b));

/** The divider between a state's name and its behaviours, with its margins (styles.css .dg-sm-divider). */
export const STATE_DIVIDER_HEIGHT = 9;
/** one behaviour line: styles.css .dg-sm-behaviors, 11px at a line height of 1.4 */
const BEHAVIOR_LINE_HEIGHT = 15.4;

/** the behaviours' font size: styles.css .dg-sm-behaviors */
export const BEHAVIOR_PX = 11;

/** A state's behaviours as the rows they are drawn on: a line each, never wrapped
 * (.dg-sm-behavior), and a line break in one starts another row. */
export const behaviorRows = (node: Pick<DiagramNode, 'behaviors'>): string[] =>
  behaviorLines(node).flatMap((line) => line.split('\n'));

/** The height the behaviours compartment takes, under a leaf state's name or an open
 * composite's header: the divider and a row a line, 0 for a state with none. An open
 * composite's top padding grows by it (containerPad), so the substates start below the list. */
export function behaviorCompartmentHeight(node: Pick<DiagramNode, 'behaviors'>): number {
  const lines = behaviorRows(node);
  return lines.length === 0 ? 0 : Math.ceil(STATE_DIVIDER_HEIGHT + lines.length * BEHAVIOR_LINE_HEIGHT);
}
