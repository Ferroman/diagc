import { useCallback, useRef, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from 'react';
import type { Connection, Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { isNodeRef, soleRelation, type CompiledView } from '@diagc/core/internal';
import { reconnectSide } from '../edge/floating';
import type { LoopHighlight } from '../loops/loop-highlight';
import type { NoteData } from '../notes/NoteNode';
import { noSelection, soleSelection } from './node-copy';
import { useClickCorrelation } from './useClickCorrelation';
import type { AddLabelAt } from './useFlowEdges';
import type { LabelEdit } from './useFlowNodes';
import type { DiagramViewProps, EditingApi } from './view-types';

export interface CanvasClicksInput {
  props: Pick<DiagramViewProps, 'onSelect' | 'onCompareSelect' | 'onMultiSelect'>;
  editing: boolean;
  edit: EditingApi | undefined;
  reactFlow: ReactFlowInstance;
  compiled: CompiledView;
  enterNode: (id: string) => void;
  setLabelEdit: Dispatch<SetStateAction<LabelEdit | null>>;
  setRfNodes: Dispatch<SetStateAction<Node[]>>;
  /** a node a label request is waiting to select (useEditRequests) */
  selectOnAppearRef: MutableRefObject<string | null>;
  setFixedSideRelation: Dispatch<SetStateAction<string | null>>;
  setAddLabelAt: Dispatch<SetStateAction<AddLabelAt | null>>;
  /** the neighbourhood focus and the loop highlight (useLoopOverlay) */
  setSelectedNode: Dispatch<SetStateAction<string | null>>;
  loopHighlight: LoopHighlight;
}

type ClickHandlers = {
  onNodeClick: (e: MouseEvent, node: Node) => void;
  onNodeDoubleClick: (e: MouseEvent, node: Node) => void;
  onReconnectStart: (e: MouseEvent, edge: Edge, handleType: 'source' | 'target') => void;
  onReconnect: (oldEdge: Edge, conn: Connection) => void;
  onReconnectEnd: () => void;
  onConnect: (conn: Connection) => void;
  onEdgeClick: (e: MouseEvent, edge: Edge) => void;
  onPaneClick: (e: MouseEvent) => void;
  deleteKeyCode: string[] | null;
  onDelete: (deleted: { nodes: Node[]; edges: Edge[] }) => void;
  onSelectionChange: (selection: { nodes: Node[] }) => void;
};

/**
 * What a click on the canvas reports: node, edge and pane clicks, the
 * double-clicks they correlate, reconnect and connect, the selection and the
 * delete key on it. The handlers are React Flow's props, by their own names.
 */
export function useCanvasClicks(input: CanvasClicksInput): ClickHandlers {
  const { props, editing, edit, reactFlow, compiled, enterNode, setLabelEdit } = input;
  const { selectOnAppearRef, setFixedSideRelation, setAddLabelAt, setSelectedNode, loopHighlight } = input;
  // Which end a reconnect drag grabbed ('source'/'target'), captured on start so
  // onReconnect can tell a same-node side change from a move to another node.
  const reconnectEndRef = useRef<'source' | 'target' | null>(null);
  // Double-click-to-enter / double-click-to-add-label are detected from click
  // events (see useClickCorrelation): the correlation protocol, its window
  // predicate, and the pane fall-through guards all live in that one hook so
  // the "exact complement" invariant is enforced in a single place.
  const corr = useClickCorrelation();
  // Open the in-place add-label editor on `edgeId` at the event point. Called from
  // the SECOND click of an edge double-click — detected via click events, NOT the
  // browser's `dblclick` (that only fires reliably for an instant double-click;
  // once the first click remounts the edges layer and the second lands on the
  // pane, a human-timed double-click often never produces a `dblclick`).
  const requestAddLabel = (edgeId: string, e: { clientX: number; clientY: number }) => {
    const fp = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setAddLabelAt({ edgeId, x: fp.x, y: fp.y });
  };

  // Multi-selection report. The prop is read through a ref and deduped by
  // contents: React Flow's SelectionListener has the callback in its effect
  // deps, so an inline host callback would otherwise fire it every render —
  // and a host that stores the array would then re-render forever.
  const onMultiSelectRef = useRef(props.onMultiSelect);
  onMultiSelectRef.current = props.onMultiSelect;
  const lastMultiRef = useRef<string[]>([]);
  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    const ids = nodes.map((n) => n.id);
    const last = lastMultiRef.current;
    if (ids.length === last.length && ids.every((id, i) => id === last[i])) return;
    lastMultiRef.current = ids;
    // A genuine selection change supersedes a label request still waiting for
    // its node to be laid out: the user clicked elsewhere in that window, and
    // the claim must not yank the ring back when the node lands. (The claim's
    // own consumption reaches here too, but only after it has been cleared.)
    selectOnAppearRef.current = null;
    onMultiSelectRef.current?.(ids);
    /* eslint-disable-next-line react-hooks/exhaustive-deps --
       selectOnAppearRef is a stable useRef identity from DiagramView, written through .current */
  }, []);

  const onNodeClick = (e: MouseEvent, node: Node) => {
    setFixedSideRelation(null);
    corr.clearEdgeClick(); // a node click breaks any pending edge-add correlation
    // A note is about an element: clicking it selects THAT (the note is
    // not selectable itself — see toRfNoteNode). The relation branch
    // repeats what onEdgeClick does *here*: the host selection, the fixed-side
    // dots, and clearing React Flow's node selection. What it cannot
    // carry is React Flow's OWN edge selection — that is set inside React
    // Flow's edge click handler, which a node click never runs — so an
    // edge reached through its note gets no selection ring and Backspace
    // stays inert on it; select the line itself to delete it from the keyboard.
    //
    // Gated on the node TYPE, not the id prefix: a model node whose id
    // happens to start with `note:` arrives with box data, and reading
    // `data.target` off it would throw on the click.
    if (node.type === 'note') {
      corr.clearNodeClick();
      selectNoteTarget(input, node);
      return;
    }
    // an external stub stands in for an off-frame node — clicking it drills there
    const rep = compiled.externals?.get(node.id);
    if (rep !== undefined) {
      corr.clearNodeClick();
      enterNode(rep);
      return;
    }
    // ctrl/cmd-click picks this node as a comparison target (dependency
    // analysis). Don't disturb the primary selection or the drill
    // double-click correlation.
    if (!editing && (e.ctrlKey || e.metaKey) && props.onCompareSelect !== undefined) {
      corr.clearNodeClick();
      props.onCompareSelect(node.id);
      return;
    }
    // both modes: focus this node's neighborhood; view mode also filters badges
    setSelectedNode(node.id);
    props.onSelect?.({ kind: 'node', id: node.id });
    // A shift-click grows the multi-selection (React Flow's job) and must
    // never count toward the view-mode drill double-click. Otherwise a
    // second click (detail>=2) on the SAME node within the window is a
    // double-click → enter it; the detail check separates it from a
    // click-then-click-elsewhere, which stays detail 1.
    if (editing || e.shiftKey) corr.clearNodeClick();
    else if (corr.consumeNodeDrill(node.id, e, e.detail)) enterNode(node.id);
    else corr.recordNodeClick(node.id, e);
  };

  const onNodeDoubleClick = (_e: MouseEvent, node: Node) => {
    // edit mode only: rename in place. View-mode enter is handled by the
    // click correlation in onNodeClick (the native node dblclick is unreliable here).
    // A note has no model name to rename — its own double-click opens a
    // threat row instead (NoteNode) — so it is excluded here, or the
    // rename box would open on a `note:` id no node answers to. By type,
    // so a model node called `note:x` still renames.
    if (editing && node.type !== 'note') setLabelEdit({ kind: 'node', id: node.id });
  };

  const onReconnectStart = (_e: MouseEvent, _edge: Edge, handleType: 'source' | 'target') => {
    reconnectEndRef.current = handleType;
  };
  const onReconnect = (oldEdge: Edge, conn: Connection) =>
    reportReconnect(input, reconnectEndRef.current, oldEdge, conn);
  const onReconnectEnd = () => {
    reconnectEndRef.current = null;
  };
  const onConnect = (conn: Connection) => {
    if (conn.source !== null && conn.target !== null)
      edit?.onConnect?.(conn.source, conn.target, conn.sourceHandle, conn.targetHandle);
  };

  const onEdgeClick = (e: MouseEvent, edge: Edge) => {
    const viewEdge = compiled.edges.find((x) => x.id === edge.id);
    // fixed-side dots follow the sole relation (edit mode, single-relation edges)
    const soleRel = viewEdge !== undefined ? soleRelation(viewEdge)?.id : undefined;
    setFixedSideRelation(editing && soleRel !== undefined ? soleRel : null);
    setSelectedNode(null);
    corr.clearNodeClick(); // an edge click breaks any pending node double-click
    props.onSelect?.({
      kind: 'edge',
      id: edge.id,
      constituentIds: viewEdge?.constituents.map((c) => c.id),
    });
    // Double-click-to-add: detect the SECOND click of a double-click from
    // click events (the browser's `dblclick` is unreliable once the first
    // click remounts the edges layer). A second click on the same sole edge
    // within the window opens the in-place add-label editor; otherwise record
    // this as a possible first click.
    if (editing && soleRel !== undefined) {
      if (corr.consumeEdgeAdd(edge.id, e)) requestAddLabel(edge.id, e);
      else corr.recordEdgeClick(edge.id, e);
    } else {
      corr.clearEdgeClick();
    }
  };

  const onPaneClick = (e: MouseEvent) => {
    // An edge double-click's second click often lands on the pane (the first
    // click remounts the edge out from under it). If a fresh same-window edge
    // click is pending, THIS is that second click: open the add-label editor
    // for that edge and don't also spawn a node.
    if (editing) {
      const edgeId = corr.takePaneEdgeAdd(e);
      if (edgeId !== null) {
        requestAddLabel(edgeId, e);
        return;
      }
    }
    // View-mode enter: the second click of a node double-click commonly lands
    // here (the first click's selection remounted the node out from under it),
    // carrying detail>=2. Drill into that node instead of fit-viewing.
    const nodeId = !editing ? corr.takePaneNodeDrill(e, e.detail) : null;
    if (nodeId !== null) {
      enterNode(nodeId);
      return;
    }
    if (e.detail === 2) {
      paneDoubleClick(input, e);
    } else {
      setFixedSideRelation(null);
      corr.clearAll(); // a pane deselect breaks both pending correlations
      setSelectedNode(null);
      props.onSelect?.(null);
      loopHighlight.clear();
    }
  };

  // Enabled only when the host can turn the gesture into model commands;
  // otherwise (view mode, or an edit host without the callback) the key
  // must stay inert rather than fake a deletion.
  const deleteKeyCode = editing && edit?.onDeleteSelection !== undefined ? ['Backspace', 'Delete'] : null;
  const onDelete = (deleted: { nodes: Node[]; edges: Edge[] }) => reportDelete(input, deleted);

  return {
    onNodeClick,
    onNodeDoubleClick,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
    onConnect,
    onEdgeClick,
    onPaneClick,
    deleteKeyCode,
    onDelete,
    onSelectionChange,
  };
}

/** A note's click selects the element it is about: a box, or a flow. */
function selectNoteTarget(input: CanvasClicksInput, node: Node): void {
  const { props, editing, compiled, setRfNodes, setFixedSideRelation, setSelectedNode } = input;
  const target = (node.data as unknown as NoteData).target;
  if (isNodeRef(target)) {
    setSelectedNode(target.node);
    // ...and move React Flow's OWN selection with it. The note is not
    // selectable, so the flag would otherwise stay on whatever box was
    // clicked before — and the ring, the image resizer, the quick-add button
    // and deleteKeyCode/onDelete all render off THAT flag (the same
    // hazard useEditRequests' label-request effect documents). Without this,
    // Backspace would delete the previous box while the panel shows
    // the element this note is about.
    setRfNodes((prev) => soleSelection(prev, target.node));
    props.onSelect?.({ kind: 'node', id: target.node });
    return;
  }
  const ve = compiled.edges.find((x) => soleRelation(x)?.id === target.relation);
  if (ve === undefined) return;
  if (editing) setFixedSideRelation(target.relation);
  setSelectedNode(null);
  // The same hazard, with no box to move to. onEdgeClick is safe
  // for free — React Flow clears the node selection when its own
  // edge selection takes over — but a note click is a NODE click,
  // so nothing clears it for us.
  setRfNodes(noSelection);
  props.onSelect?.({ kind: 'edge', id: ve.id, constituentIds: [target.relation] });
}

/** the relation a reconnect drag moved, with how its dragged end's fixed side changes */
function reportReconnect(
  input: CanvasClicksInput,
  grabbed: 'source' | 'target' | null,
  oldEdge: Edge,
  conn: Connection,
): void {
  const { editing, edit, compiled } = input;
  if (!editing || conn.source === null || conn.target === null) return;
  const viewEdge = compiled.edges.find((x) => x.id === oldEdge.id);
  const relation = viewEdge !== undefined ? soleRelation(viewEdge) : undefined;
  if (relation === undefined) return;
  const endSide = reconnectSide(
    grabbed,
    {
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle,
      targetHandle: conn.targetHandle,
    },
    relation,
  );
  edit?.onReconnect?.(relation.id, conn.source, conn.target, endSide);
}

/** edit mode: a double-click on empty canvas drops a node there; view mode
 * keeps the fit-view convenience (the ⛶ control fits in both modes) */
function paneDoubleClick(input: CanvasClicksInput, e: MouseEvent): void {
  const { editing, edit, reactFlow, setLabelEdit } = input;
  if (editing && edit?.onCreateAt !== undefined) {
    const id = edit.onCreateAt(reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    if (typeof id === 'string') setLabelEdit({ kind: 'node', id });
  } else {
    void reactFlow.fitView({ padding: 0.1, duration: 500 });
  }
}

/** what the delete key removes: the selected nodes, and the relations of the
 * edges selected explicitly */
function reportDelete(input: CanvasClicksInput, { nodes, edges }: { nodes: Node[]; edges: Edge[] }): void {
  const nodeIds = nodes.map((n) => n.id);
  // Only explicitly selected edges translate to relation deletes:
  // edges React Flow cascade-deletes alongside a node are pruned
  // model-side by delete-node already, and a bundled edge maps to
  // every relation it draws for.
  const relationIds = edges
    .filter((e) => e.selected === true)
    .flatMap((e) => input.compiled.edges.find((x) => x.id === e.id)?.constituents.map((c) => c.id) ?? []);
  if (nodeIds.length > 0 || relationIds.length > 0) input.edit?.onDeleteSelection?.({ nodeIds, relationIds });
}
