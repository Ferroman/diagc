/* React Flow stacking orders shared by the notation profiles and the canvas.
   Its own module, free of React: notations.ts imports it, and a package that
   type-checks notations.ts without JSX must not reach the canvas's .tsx. */

/** React Flow's stacking order for a notation's edges drawn over its boxes
 * (NotationProfile.edge.zIndex). React Flow stacks a child node at its
 * parent's z + 1 when the parent's is not below its own, so a box nested in
 * open containers climbs one level per container, and a node wins a tie with
 * an edge: this clears any nesting a diagram has, and stays under a selected
 * node (1000) and the label layer (999). */
export const ABOVE_BOXES_Z = 100;
/** a note's: one above the lifted edges, so a line never crosses a note */
export const NOTE_Z = ABOVE_BOXES_Z + 1;
