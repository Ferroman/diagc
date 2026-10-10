import type { CSSProperties } from 'react';
import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react';
import { DiagramEdge, type DiagramEdgeData } from '../edge/DiagramEdge';
import { DiagramNode, type DiagramNodeData } from '../node/DiagramNode';
import { NoteNode, type NoteData } from '../notes/NoteNode';
import { defined, type Point } from '@diagc/core/internal';

// The single boundary where React Flow v12's typing is widened. v12 types
// nodeTypes/edgeTypes as components taking full NodeProps/EdgeProps while our
// components take narrower props, and the `data` channel is a generic Record
// while we carry our own DiagramNodeData/DiagramEdgeData. All the unsafe
// `as unknown as` casts live here so reviewers can audit the whole boundary in
// one commented location. The objects built here belong to React Flow, which
// keeps them and merges its own changes in, so an unset field is left out
// rather than set to undefined.
export const nodeTypes = { diagram: DiagramNode, note: NoteNode } as unknown as NodeTypes;
export const edgeTypes = { diagram: DiagramEdge } as unknown as EdgeTypes;

/** what the derived-nodes memo needs to hand React Flow besides the typed data */
export interface RfNodeInput {
  id: string;
  position: Point;
  data: DiagramNodeData;
  parentId?: string;
  /** child drags clamp inside the parent box (membership is edited in the panel) */
  extent?: 'parent';
  /** the parent grows around this node while it is dragged, instead of the
   * drag being clamped inside (`extent`) or carrying the node out */
  expandParent?: boolean;
  style?: CSSProperties;
  zIndex?: number;
  /** `false` takes the node out of every move (drag, nudge, align) whatever the
   * canvas-wide `nodesDraggable` says; absent = the canvas decides */
  draggable?: false;
  /** extra class on React Flow's node wrapper (its `nopan` opt-in, see toRfNode's caller) */
  className?: string;
}

/** Build a React Flow node, widening our typed data channel at the boundary. */
export function toRfNode({ data, ...props }: RfNodeInput): Node {
  return { ...defined(props), type: 'diagram', data: data as unknown as Record<string, unknown> };
}

/** a note's React Flow node (see NoteNode) — the same widening as toRfNode */
export interface RfNoteInput {
  id: string;
  position: Point;
  data: NoteData;
  parentId?: string;
  draggable: boolean;
}
export function toRfNoteNode({ data, ...props }: RfNoteInput): Node {
  return {
    ...defined(props),
    type: 'note',
    data: data as unknown as Record<string, unknown>,
    selectable: false,
    // above the boxes it annotates, below nothing that matters
    zIndex: 2,
  };
}

/** what the edges memo needs to hand React Flow besides the typed data */
export interface RfEdgeInput {
  id: string;
  source: string;
  target: string;
  data: DiagramEdgeData;
  reconnectable?: boolean;
  /** extra class on React Flow's edge wrapper (a diff mark) */
  className?: string;
}

/** Build a React Flow edge, widening our typed data channel at the boundary. */
export function toRfEdge({ data, ...props }: RfEdgeInput): Edge {
  return { ...defined(props), type: 'diagram', data: data as unknown as Record<string, unknown> };
}
