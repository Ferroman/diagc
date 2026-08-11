import type { CSSProperties } from 'react';
import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react';
import { DiagramEdge, type DiagramEdgeData } from './DiagramEdge';
import { DiagramNode, type DiagramNodeData } from './DiagramNode';

// The single boundary where React Flow v12's typing is widened. v12 types
// nodeTypes/edgeTypes as components taking full NodeProps/EdgeProps while our
// components take narrower props, and the `data` channel is a generic Record
// while we carry our own DiagramNodeData/DiagramEdgeData. All the unsafe
// `as unknown as` casts live here so reviewers can audit the whole boundary in
// one commented location.
export const nodeTypes = { diagram: DiagramNode } as unknown as NodeTypes;
export const edgeTypes = { diagram: DiagramEdge } as unknown as EdgeTypes;

/** what the derived-nodes memo needs to hand React Flow besides the typed data */
export interface RfNodeInput {
  id: string;
  position: { x: number; y: number };
  data: DiagramNodeData;
  parentId?: string;
  /** child drags clamp inside the parent box (membership is edited in the panel) */
  extent?: 'parent';
  style?: CSSProperties;
  zIndex?: number;
}

/** Build a React Flow node, widening our typed data channel at the boundary. */
export function toRfNode(input: RfNodeInput): Node {
  return {
    id: input.id,
    type: 'diagram',
    position: input.position,
    data: input.data as unknown as Record<string, unknown>,
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.extent !== undefined ? { extent: input.extent } : {}),
    ...(input.style !== undefined ? { style: input.style } : {}),
    ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
  };
}

/** what the edges memo needs to hand React Flow besides the typed data */
export interface RfEdgeInput {
  id: string;
  source: string;
  target: string;
  data: DiagramEdgeData;
  reconnectable?: boolean;
}

/** Build a React Flow edge, widening our typed data channel at the boundary. */
export function toRfEdge(input: RfEdgeInput): Edge {
  return {
    id: input.id,
    source: input.source,
    target: input.target,
    type: 'diagram',
    ...(input.reconnectable !== undefined ? { reconnectable: input.reconnectable } : {}),
    data: input.data as unknown as Record<string, unknown>,
  };
}