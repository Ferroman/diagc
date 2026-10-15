/** what a click handler needs to know about the click */
export interface ClickPoint {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}

/** the browser's answer to "what lies under this point", topmost first */
export type ElementsUnder = (x: number, y: number) => Element[];

const browserElementsUnder = (): ElementsUnder | undefined =>
  typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint.bind(document) : undefined;

/**
 * The node control a click on an edge landed over, if any.
 *
 * React Flow stacks an edge between nested nodes above the groups around them
 * (an edge takes its endpoints' z-index, and an open group sits below its own
 * children), and an edge's hit band is 20px wide, so a line crossing a group's
 * header takes the click meant for the fold chip under it — and the box cannot
 * be folded, nor a folded one opened when a line crosses its corner. The canvas
 * asks the browser what lies under the point and hands the click to the first
 * control of a node it finds there: a chip (fold, enter, disclose), a badge,
 * the `+`. A node's plain body is not taken: a click on a line over a box is
 * still a click on the line.
 */
export function controlUnderEdge(
  click: ClickPoint,
  under: ElementsUnder | undefined = browserElementsUnder(),
): HTMLElement | null {
  if (under === undefined) return null;
  const { target } = click;
  if (!(target instanceof Element) || target.closest('.react-flow__edge') === null) return null;
  for (const el of under(click.clientX, click.clientY)) {
    if (!(el instanceof HTMLElement) || el.closest('.react-flow__node') === null) continue;
    const control = el.closest('button, a');
    if (control instanceof HTMLElement) return control;
  }
  return null;
}

/** The canvas's capture-phase click: a click on an edge over a node control
 * goes to the control, and the edge never sees it. Says whether it did. */
export function forwardEdgeClick(e: ClickPoint & { stopPropagation(): void; preventDefault(): void }): boolean {
  const control = controlUnderEdge(e);
  if (control === null) return false;
  e.stopPropagation();
  e.preventDefault();
  control.click();
  return true;
}
