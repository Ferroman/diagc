import type { Node } from '@xyflow/react';

// Identity-preserving patches to React Flow's copy of the nodes: a node whose
// flag already reads right keeps its identity, so a patch re-renders only the
// boxes it changes.

/** `id` becomes the sole selection on React Flow's copy of the nodes. Every node
 * whose flag already reads right keeps its identity, so this costs one re-render
 * of at most two boxes. */
export const soleSelection = (nodes: Node[], id: string): Node[] =>
  nodes.map((n) => ((n.selected === true) === (n.id === id) ? n : { ...n, selected: n.id === id }));

/** nothing is selected on React Flow's copy; already-clear nodes keep their identity */
export const noSelection = (nodes: Node[]): Node[] =>
  nodes.map((n) => (n.selected === true ? { ...n, selected: false } : n));

/** `id` (or none) carries `data.dropTarget: true` on React Flow's copy — the
 * drag-over outline a notation's drop target draws (DiagramNode's
 * data-drop-target). Same identity-preserving shape as soleSelection above,
 * but on `data`: unlike `selected` it is not a field React Flow itself knows,
 * so DiagramNode reads it off the node data channel like any other notation
 * hook. */
export const withDropTarget = (nodes: Node[], id: string | undefined): Node[] =>
  nodes.map((n) => {
    const has = (n.data as { dropTarget?: boolean }).dropTarget === true;
    const want = n.id === id;
    return has === want ? n : { ...n, data: { ...n.data, dropTarget: want } };
  });
