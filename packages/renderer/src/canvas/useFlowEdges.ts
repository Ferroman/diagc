import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Edge, EdgeChange } from '@xyflow/react';
import { soleRelation, type CompiledView } from '@diagc/core/internal';
import type { StylePreset } from '../sketch/stylePresets';
import { toRfEdge } from './adapter';
import { buildEdgeDataCached, type EdgeDataContext } from './build-data';
import { diffEdgeStatus, withDiffClass } from './diff-marks';
import type { Notation } from './useNotation';
import type { ViewLayout } from './useViewLayout';
import type { ViewModeMoves } from './useViewModeMoves';
import type { DiagramViewProps, EditingApi } from './view-types';

/** where an edge double-click asked for a new label (flow coordinates) */
export type AddLabelAt = { edgeId: string; x: number; y: number };

export interface FlowEdgesInput {
  props: Pick<DiagramViewProps, 'model' | 'plane' | 'notation' | 'diffMarks' | 'onViewLabelMovesChange'>;
  editing: boolean;
  edit: EditingApi | undefined;
  notation: Pick<Notation, 'profile' | 'kindRegistry'>;
  preset: StylePreset;
  compiled: CompiledView;
  layout: Pick<ViewLayout, 'placedGeometry' | 'routing' | 'routes' | 'laidAt' | 'labelSpots'>;
  /** the label placements drawn, and a slide in view mode */
  moves: Pick<ViewModeMoves, 'labelMoves' | 'moveViewLabel'>;
}

export interface FlowEdges {
  /** the edges React Flow draws, with its own selection stamped on */
  rfEdges: Edge[];
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** the sole relation whose fixed-side dots show (edit mode) */
  setFixedSideRelation: Dispatch<SetStateAction<string | null>>;
  /** open the in-place add-label editor on an edge */
  setAddLabelAt: Dispatch<SetStateAction<AddLabelAt | null>>;
}

/** The edges React Flow draws: each edge's data, its selection, and the edge state a click sets. */
export function useFlowEdges(input: FlowEdgesInput): FlowEdges {
  const { props, editing, edit, preset, compiled } = input;
  const { profile, kindRegistry } = input.notation;
  const { labelMoves, moveViewLabel } = input.moves;
  const { placedGeometry, routing, routes, laidAt, labelSpots } = input.layout;
  // The sole-relation id of the edge currently showing fixed-side dots. Keyed
  // by the stable *relation* id, not the view-edge id (which changes whenever a
  // side is fixed or freed — fixed sides are baked into the aggregation key), so
  // the dots survive it instead of vanishing with the old id.
  const [fixedSideRelation, setFixedSideRelation] = useState<string | null>(null);
  const [addLabelAt, setAddLabelAt] = useState<AddLabelAt | null>(null);

  // Notation colour hooks: a node/edge takes its lane's (or otherwise the
  // notation's) colour where it sets none itself. Absent notation = absent map,
  // so an unrelated diagram's build-data pass never sees an `edgeColors` field.
  // (`nodeColors` is useNotation's: the legend keys with it too.)
  const edgeColors = useMemo(() => {
    const colorOf = profile.edge?.colorOf;
    if (colorOf === undefined) return undefined;
    const m = new Map<string, string>();
    for (const e of compiled.edges) {
      const c = colorOf(e, props.model, props.plane);
      if (c !== undefined) m.set(e.id, c);
    }
    return m;
  }, [profile, compiled, props.model, props.plane]);

  // The per-edge data channel inputs, as one object the cached builder keys
  // its identity on (see build-data.ts) — same stability contract as the node
  // ctx (useFlowNodes), stable callbacks included.
  const clearAddLabel = useCallback(() => setAddLabelAt(null), []);
  const edgeDataCtx = useMemo<EdgeDataContext>(
    () => ({
      kindRegistry,
      editing,
      onAddEdgeLabel: edit?.onAddEdgeLabel,
      onEditEdgeLabel: edit?.onEditEdgeLabel,
      onMoveEdgeLabel: edit?.onMoveEdgeLabel,
      onSetEdgeSide: edit?.onSetEdgeSide,
      onAddThreat: edit?.onAddThreat,
      fixedSideRelation,
      pendingAdd: addLabelAt,
      onPendingAddConsumed: clearAddLabel,
      stylePreset: preset.rough !== undefined ? preset : undefined,
      notation: props.notation,
      routing,
      routes,
      laidAt,
      labelSpots,
      labelMoves,
      // Movable only where the move can go somewhere: a host that listens for
      // it (the studio's Save positions chip). The published page and the PNG
      // export pass no listener, so their labels stay put.
      onViewMoveEdgeLabel: !editing && props.onViewLabelMovesChange !== undefined ? moveViewLabel : undefined,
      edgeColors,
    }),
    [
      kindRegistry,
      editing,
      edit?.onAddEdgeLabel,
      edit?.onEditEdgeLabel,
      edit?.onMoveEdgeLabel,
      edit?.onSetEdgeSide,
      edit?.onAddThreat,
      fixedSideRelation,
      addLabelAt,
      clearAddLabel,
      preset,
      props.notation,
      routing,
      routes,
      laidAt,
      labelSpots,
      labelMoves,
      props.onViewLabelMovesChange,
      moveViewLabel,
      edgeColors,
    ],
  );

  const { diffMarks } = props;
  const edges = useMemo((): Edge[] => {
    if (placedGeometry === null) return [];
    return compiled.edges.map((e) => {
      const data = buildEdgeDataCached(e, edgeDataCtx);
      const relation = soleRelation(e);
      const diffClass = withDiffClass(
        undefined,
        diffMarks !== undefined ? diffEdgeStatus(e.constituents, diffMarks) : undefined,
      );
      return toRfEdge({
        id: e.id,
        source: e.from,
        target: e.to,
        data,
        reconnectable: editing && relation !== undefined,
        className: diffClass,
      });
    });
  }, [compiled, placedGeometry, edgeDataCtx, editing, diffMarks]);

  // Edge selection is React Flow's own, but the edges are controlled: its
  // select changes reach the canvas only through this set. Without it no edge
  // ever reads `selected`, and the delete key (which acts on the selected
  // elements) silently skips every clicked link. Kept apart from `edges` so a
  // click restamps one flag instead of rebuilding every edge's data.
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  const rfEdges = useMemo(
    () =>
      selectedEdgeIds.size === 0 ? edges : edges.map((e) => (selectedEdgeIds.has(e.id) ? { ...e, selected: true } : e)),
    [edges, selectedEdgeIds],
  );
  const onEdgesChange = (changes: EdgeChange[]) => {
    const selects = changes.filter((c) => c.type === 'select');
    if (selects.length === 0) return;
    setSelectedEdgeIds((prev) => {
      const next = new Set(prev);
      for (const c of selects) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
  };

  return { rfEdges, onEdgesChange, setFixedSideRelation, setAddLabelAt };
}
