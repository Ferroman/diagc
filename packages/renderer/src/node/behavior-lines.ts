import { formatTransition, type DiagramNode } from '@diagc/core/internal';

/** A state's behaviours as the lines its compartment lists, `trigger [guard] / effect`. The one
 * place they are formatted, so the drawn node and the size the layout reserves for it agree. */
export const behaviorLines = (node: Pick<DiagramNode, 'behaviors'>): string[] =>
  (node.behaviors ?? []).map((b) => formatTransition(b));

/** The divider between a state's name and its behaviours, with its margins (styles.css .dg-sm-divider). */
export const STATE_DIVIDER_HEIGHT = 9;
/** one behaviour line: styles.css .dg-sm-behaviors, 11px at a line height of 1.4 */
const BEHAVIOR_LINE_HEIGHT = 15.4;

/** One behaviour character at 11px, leaning wide. The box takes the layout's width as
 * a floor (node-frame.ts), so an estimate past the drawn line only leaves room on its
 * right, while one short of it lets the line push the box past where its arrows meet it. */
const BEHAVIOR_CHAR = 6;
/** a box's padding and border across: styles.css .dg-node, 10px a side and 1px of border */
const BOX_SIDES = 22;

/** The width a state's longest behaviour line takes in its box, padding included: the
 * lines never wrap (.dg-sm-behavior), so the box grows to it. 0 for a state with none. */
export function behaviorWidth(node: Pick<DiagramNode, 'behaviors'>): number {
  const rows = behaviorLines(node).flatMap((line) => line.split('\n'));
  if (rows.length === 0) return 0;
  return Math.round(Math.max(...rows.map((r) => [...r].length)) * BEHAVIOR_CHAR + BOX_SIDES);
}

/** The height the behaviours compartment takes, under a leaf state's name or an open
 * composite's header: the divider and a row a line, 0 for a state with none. An open
 * composite's top padding grows by it (containerPad), so the substates start below the list. */
export function behaviorCompartmentHeight(node: Pick<DiagramNode, 'behaviors'>): number {
  const lines = behaviorLines(node).flatMap((line) => line.split('\n'));
  return lines.length === 0 ? 0 : Math.ceil(STATE_DIVIDER_HEIGHT + lines.length * BEHAVIOR_LINE_HEIGHT);
}
