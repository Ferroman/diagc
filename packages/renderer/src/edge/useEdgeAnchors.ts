import { useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react';
import type { Column, Point } from '@diagc/core/internal';
import { anchorToRow, type TableEndpointRect } from '../node/table-ports';
import type { DiagramEdgeData } from './DiagramEdge';
import { getEdgeParams, type EdgeParams } from './floating';

/** The ids and handle coordinates React Flow passes an edge. */
export type EdgeHandles = Pick<
  EdgeProps,
  'source' | 'target' | 'sourceX' | 'sourceY' | 'targetX' | 'targetY' | 'sourcePosition' | 'targetPosition'
>;

/** One end's node, and its box as the canvas holds it (a table's with its columns). */
export interface EndBox {
  node: InternalNode;
  rect: TableEndpointRect;
}

/** Where an edge leaves and meets its nodes. */
export interface EdgeAnchors {
  /** The floating ends: the border points facing the other node (any side, like
   * a whiteboard tool), or the fixed side where the relation names one. */
  ends: EdgeParams;
  /** Where the line is drawn from and to: the floating ends, held to a table
   * row where the relation names a column. */
  from: Point;
  to: Point;
  /** Both nodes are measured. Until then (first frame, jsdom) `ends` are the
   * handle-based coordinates React Flow passed. */
  measured: boolean;
  source: EndBox | undefined;
  target: EndBox | undefined;
}

export function useEdgeAnchors(handles: EdgeHandles, data: DiagramEdgeData | undefined): EdgeAnchors {
  const sourceNode = useInternalNode(handles.source);
  const targetNode = useInternalNode(handles.target);
  const measured = (sourceNode?.measured?.width ?? 0) > 0 && (targetNode?.measured?.width ?? 0) > 0;
  const rel = data?.relStyle;
  const ends =
    measured && sourceNode !== undefined && targetNode !== undefined
      ? getEdgeParams(sourceNode, targetNode, { sourceSide: rel?.fromSide, targetSide: rel?.toSide })
      : {
          sx: handles.sourceX,
          sy: handles.sourceY,
          tx: handles.targetX,
          ty: handles.targetY,
          sourcePos: handles.sourcePosition,
          targetPos: handles.targetPosition,
        };
  const floating = { ends, measured, source: endBox(sourceNode), target: endBox(targetNode) };
  return { ...floating, ...rowAnchored(floating, data) };
}

function endBox(node: InternalNode | undefined): EndBox | undefined {
  if (node === undefined) return undefined;
  return {
    node,
    rect: {
      x: node.internals.positionAbsolute.x,
      y: node.internals.positionAbsolute.y,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
      columns: (node.data as { columns?: Column[] }).columns,
    },
  };
}

// Row-port anchoring: for FK edges into/out of db-table nodes, hold the y of
// each end to the referenced column's row (x stays on the facing left/right
// border — anchorToRow is a no-op for top/bottom faces or an unknown column,
// so non-table ends float as if no column were named). The target falls back
// to its primary key, but only on an edge that names a column at either end.
function rowAnchored(
  anchors: Omit<EdgeAnchors, 'from' | 'to'>,
  data: DiagramEdgeData | undefined,
): Pick<EdgeAnchors, 'from' | 'to'> {
  const { ends, measured, source, target } = anchors;
  let from: Point = { x: ends.sx, y: ends.sy };
  let to: Point = { x: ends.tx, y: ends.ty };
  if (measured && data?.fromColumn !== undefined && source?.rect.columns !== undefined) {
    const a = anchorToRow({ x: ends.sx, y: ends.sy, pos: ends.sourcePos }, source.rect, data.fromColumn);
    from = { x: a.x, y: a.y };
  }
  const targetColumn = data?.toColumn ?? target?.rect.columns?.find((c) => c.pk === true)?.name;
  if (
    measured &&
    targetColumn !== undefined &&
    target?.rect.columns !== undefined &&
    (data?.fromColumn !== undefined || data?.toColumn !== undefined)
  ) {
    const a = anchorToRow({ x: ends.tx, y: ends.ty, pos: ends.targetPos }, target.rect, targetColumn);
    to = { x: a.x, y: a.y };
  }
  return { from, to };
}
