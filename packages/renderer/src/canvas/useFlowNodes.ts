import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { Node } from '@xyflow/react';
import type { CompiledView, ViewNode } from '@diagc/core/internal';
import type { IconRegistry } from '@diagc/icons';
import type { DiagramNodeData } from '../node/DiagramNode';
import type { StylePreset } from '../sketch/stylePresets';
import type { TypeHues } from './type-hues';
import { toRfNode } from './adapter';
import { buildNodeDataCached, type NodeDataContext } from './build-data';
import { diffNodeClasses, withDiffClass } from './diff-marks';
import { nodeFrameProps } from './node-frame';
import type { Notation } from './useNotation';
import type { ViewLayout } from './useViewLayout';
import type { DiagramViewProps, EditingApi } from './view-types';

/** the node name or edge label open for typing in place */
export type LabelEdit = { kind: 'node' | 'edge'; id: string };

export interface FlowNodesInput {
  props: Pick<
    DiagramViewProps,
    'model' | 'notation' | 'onOpenLink' | 'onToggleExpand' | 'assetBase' | 'libraryBase' | 'diffMarks'
  >;
  editing: boolean;
  edit: EditingApi | undefined;
  notation: Pick<Notation, 'profile' | 'typeRegistry' | 'nodeColors' | 'nodeChips'>;
  icons: IconRegistry;
  preset: StylePreset;
  /** the preset's colouring of the model, when it has a palette */
  hues: TypeHues | undefined;
  compiled: CompiledView;
  layout: Pick<ViewLayout, 'arrangedGeometry' | 'fixed'>;
  hiddenCounts: NodeDataContext['hiddenCounts'];
  metaKeys: NodeDataContext['metaKeys'];
  labelEdit: LabelEdit | null;
  setLabelEdit: Dispatch<SetStateAction<LabelEdit | null>>;
  enterNode: (id: string) => void;
  noteNodes: Node[];
}

export interface FlowNodes {
  /** the boxes, in view-tree order (no notes) */
  derivedNodes: Node[];
  /** the boxes, then the notes: what React Flow's copy is resynced from */
  allNodes: Node[];
  /** `allNodes`, kept current every render for the drag stop's snap-back */
  allNodesRef: MutableRefObject<Node[]>;
  /** React Flow's own copy of the nodes (see below) */
  rfNodes: Node[];
  setRfNodes: Dispatch<SetStateAction<Node[]>>;
  rfNodesRef: MutableRefObject<Node[]>;
}

/** The nodes React Flow draws: each box's data and frame, the notes after them, and React Flow's copy. */
export function useFlowNodes(input: FlowNodesInput): FlowNodes {
  const { props, editing, edit, compiled, labelEdit, preset, setLabelEdit } = input;
  const { profile, typeRegistry, nodeColors, nodeChips } = input.notation;
  const { arrangedGeometry, fixed } = input.layout;
  // The per-node data channel inputs, as one object the cached builder keys
  // its identity on (see build-data.ts): while every field is referentially
  // unchanged, the cached data objects are reused instead of rebuilt. So the
  // callbacks placed in it are stable: a fresh arrow per memo run would rebuild
  // every node's data whenever an input the builder does not compare changed.
  const endLabelEdit = useCallback(() => setLabelEdit(null), [setLabelEdit]);
  const nodeDataCtx = useMemo<NodeDataContext>(
    () => ({
      metaKeys: input.metaKeys,
      hiddenCounts: input.hiddenCounts,
      typeRegistry,
      icons: input.icons,
      typeColors: props.model.typeColors,
      onOpenLink: props.onOpenLink,
      onToggleExpand: props.onToggleExpand,
      onEnterNode: input.enterNode,
      editing,
      labelEditingId: labelEdit?.kind === 'node' ? labelEdit.id : undefined,
      endLabelEdit,
      onRenameNode: edit?.onRenameNode,
      onSetNodeRich: edit?.onSetNodeRich,
      assetBase: props.assetBase,
      libraryBase: props.libraryBase,
      onResize: edit?.onResize,
      onSetTableColumns: edit?.onSetTableColumns,
      quickAdd: edit?.quickAdd,
      onSetRole: edit?.onSetRole,
      onAddThreat: edit?.onAddThreat,
      stylePreset: preset.rough !== undefined ? preset : undefined,
      notation: props.notation,
      nodeColors,
      hues: input.hues,
      nodeChips,
      resizable: profile.node?.resizable,
    }),
    [
      input.metaKeys,
      input.hiddenCounts,
      typeRegistry,
      input.icons,
      props.model.typeColors,
      props.onOpenLink,
      props.onToggleExpand,
      input.enterNode,
      editing,
      labelEdit,
      endLabelEdit,
      edit?.onRenameNode,
      edit?.onSetNodeRich,
      props.assetBase,
      props.libraryBase,
      edit?.onResize,
      edit?.onSetTableColumns,
      edit?.quickAdd,
      edit?.onSetRole,
      edit?.onAddThreat,
      preset,
      props.notation,
      nodeColors,
      input.hues,
      nodeChips,
      profile,
    ],
  );

  const derivedNodes = useMemo((): Node[] => {
    if (arrangedGeometry === null) return [];
    const out: Node[] = [];
    const frameCtx = { editing, profile, typeRegistry, fixed };
    const walk = (n: ViewNode, parent?: string) => {
      const geo = arrangedGeometry.get(n.id);
      if (geo === undefined) return;
      const data = buildNodeDataCached(n, nodeDataCtx);
      out.push(
        toRfNode({
          id: n.id,
          position: { x: geo.x, y: geo.y },
          data,
          parentId: parent,
          ...nodeFrameProps(n, geo, parent, frameCtx),
        }),
      );
      n.children.forEach((c) => walk(c, n.id));
    };
    compiled.roots.forEach((r) => walk(r));
    return out;
  }, [compiled, arrangedGeometry, nodeDataCtx, editing, typeRegistry, profile, fixed]);

  // Boxes first, notes after: React Flow resolves `parentId` against the nodes
  // it has already seen, so a note must never precede the box it rides on.
  //
  // A diff picture's marks ride on React Flow's wrapper class, so every node
  // shape gets them without each node body knowing. `inside` only on a
  // folded box: an open one shows the changed child itself.
  const { diffMarks, model } = props;
  const diffClasses = useMemo(
    () => (diffMarks !== undefined ? diffNodeClasses(model, diffMarks) : null),
    [diffMarks, model],
  );
  const { noteNodes } = input;
  const allNodes = useMemo(() => {
    const boxes =
      diffClasses === null
        ? derivedNodes
        : derivedNodes.map((n) => {
            const status = diffClasses.get(n.id);
            if (
              status === undefined ||
              (status === 'inside' && (n.data as unknown as DiagramNodeData).state === 'expanded')
            )
              return n;
            const className = withDiffClass(n.className, status);
            return className !== undefined ? { ...n, className } : n;
          });
    return noteNodes.length === 0 ? boxes : [...boxes, ...noteNodes];
  }, [derivedNodes, noteNodes, diffClasses]);
  // Render-phase ref (the arrangedRef/rfNodesRef pattern): a snap-back reset
  // (useNodeDragging's onNodeDragStop) needs each node's LAID position — the same source
  // useNodeResync reads when it copies allNodes into rfNodes — read
  // synchronously at drop time, not a render later.
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;

  // React Flow owns a copy of the nodes and we apply its changes (drag positions,
  // measured dimensions, selection) with applyNodeChanges — the v12-recommended
  // shape. Fully controlled nodes re-create every node object per drag frame,
  // re-rendering all nodes and flickering under drag. useNodeResync refreshes
  // the copy from allNodes.
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const rfNodesRef = useRef<Node[]>([]);
  rfNodesRef.current = rfNodes;

  return { derivedNodes, allNodes, allNodesRef, rfNodes, setRfNodes, rfNodesRef };
}
