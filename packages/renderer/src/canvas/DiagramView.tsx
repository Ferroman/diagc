import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  ControlButton,
  Controls,
  getViewportForBounds,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  compileView,
  countAnchored,
  DEFAULT_STROKE_WIDTH,
  GIT_STAGE_TYPE,
  isActivityChrome,
  isNodeRef,
  layoutPlaneKey,
  soleRelation,
  type DiagramNode,
  type EdgeLabelPlacement,
  type EdgeLabelSide,
  type Point,
  type Stroke,
  type ViewNode,
} from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import { FORCED_SIZE_SHAPES, LAYOUT_SIZED_TYPES } from '../layout/box-size';
import { Breadcrumbs } from './Breadcrumbs';
import { overhangBounds, unionBounds } from './content-bounds';
import {
  buildEdgeDataCached,
  buildNodeDataCached,
  type EdgeDataContext,
  type EdgeLabelMoves,
  type NodeDataContext,
} from './build-data';
import { edgeTypes, nodeTypes, toRfEdge, toRfNode } from './adapter';
import { strokesBounds } from '../drawings/drawings';
import { captureCanvas, exportFrame } from './export-image';
import type { NoteData } from '../notes/NoteNode';
import { isNoteId } from '../notes/derive-note-nodes';
import { NoteStateContext } from '../notes/note-state';
import { DrawingsLayer } from '../drawings/DrawingsLayer';
import { reconnectSide } from '../edge/floating';
import { GitLanesOverlay } from '../overlays/GitLanesOverlay';
import { alignBoxes, distributeBoxes, dropDescendants, type Delta } from './arrange';
import type { Box } from './box';
import { GuidesLayer } from './GuidesLayer';
import { SelectionToolbar } from './SelectionToolbar';
import { Legend } from '../legend/Legend';
import { LoopLabelLayer } from '../loops/LoopLabelLayer';
import { LoopHighlightContext } from '../loops/loop-highlight';
import { notationProfile } from '../notations';
import { OrderBandsOverlay } from '../overlays/OrderBandsOverlay';
import { createKindRegistry, createTypeRegistry } from '../registry';
import { stylePreset } from '../sketch/stylePresets';
import { TimeAxisOverlay } from '../overlays/TimeAxisOverlay';
import { useCanvasGestures } from '../drawings/useCanvasGestures';
import { useClickCorrelation } from './useClickCorrelation';
import { useDrillNavigation } from './useDrillNavigation';
import { useLegendState } from '../legend/useLegendState';
import { useLoopOverlay } from '../loops/useLoopOverlay';
import { NUDGE_STEP, useNudge, type Positions } from './useNudge';
import { useViewLayout } from './useViewLayout';
import { useEditRequests } from './useEditRequests';
import { useCommitMoves } from './useCommitMoves';
import { useNodeDragging } from './useNodeDragging';
import { noSelection, soleSelection } from './node-copy';
import { useNoteNodes } from './useNoteNodes';
import { useNoteSession } from './useNoteSession';
import { LaserLayer } from '../drawings/LaserLayer';
import type { DiagramNodeData } from '../node/DiagramNode';
import { diffEdgeStatus, diffNodeClasses, withDiffClass } from './diff-marks';
import '../styles.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';

import {
  DEFAULT_ON_NODE_META_KEYS,
  LIBRARY_ENTRY_DND_TYPE,
  type CanvasCommands,
  type CanvasKeyHint,
  type DiagramViewProps,
} from './view-types';

// Zoom limits, shared by the <ReactFlow> element and the getViewportForBounds
// call in `fitView` below — the same numbers have to bound both, or a fit could
// compute a zoom the canvas then clamps and land off-frame.
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 4;

const imageFilesOf = (list: FileList | null | undefined): File[] =>
  [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

/** the node a palette drop landed on, or undefined when it fell on open canvas.
 * Cross-layer coupling: the host-side drop handler reads the renderer's DOM
 * internals (the `.react-flow__node` root + its `data-id`) to resolve the
 * nesting target — kept in one named helper so the coupling is explicit. */
const droppedOnNodeId = (e: { clientX: number; clientY: number }): string | undefined =>
  document.elementFromPoint(e.clientX, e.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') ?? undefined;

function Inner(props: DiagramViewProps) {
  const reactFlow = useReactFlow();
  // The edit-mode callbacks travel as one optional object (see EditingApi); the
  // affordance gate `editing` below derives from `mode` alone, so a read-only
  // host without an `edit` object disables every mutation path structurally.
  const edit = props.edit;
  const preset = useMemo(() => stylePreset(props.styleId), [props.styleId]);
  const profile = useMemo(() => notationProfile(props.notation), [props.notation]);
  const typeRegistry = useMemo(
    () => props.typeRegistry ?? createTypeRegistry(profile.typeStyles),
    [props.typeRegistry, profile],
  );
  const kindRegistry = useMemo(
    () => props.kindRegistry ?? createKindRegistry(profile.kindStyles),
    [props.kindRegistry, profile],
  );
  const icons = useMemo(() => props.icons ?? createIconRegistry(), [props.icons]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // In-place label editing target (edit mode double-click): a node's name or a
  // single-relation edge's label.
  const [labelEdit, setLabelEdit] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const editing = props.mode === 'edit';
  const notes = useNoteSession(editing, props.model.id);
  const { setNoteEdit, setNoteOverrides } = notes;
  const visibleRef = useRef<string[]>([]);
  // Which end a reconnect drag grabbed ('source'/'target'), captured on start so
  // onReconnect can tell a same-node side change from a move to another node.
  const reconnectEndRef = useRef<'source' | 'target' | null>(null);
  // The sole-relation id of the edge currently showing fixed-side dots. Keyed
  // by the stable *relation* id, not the view-edge id (which changes whenever a
  // side is fixed or freed — fixed sides are baked into the aggregation key), so
  // the dots survive it instead of vanishing with the old id.
  const [fixedSideRelation, setFixedSideRelation] = useState<string | null>(null);
  // Double-click-to-enter / double-click-to-add-label are detected from click
  // events (see useClickCorrelation): the correlation protocol, its window
  // predicate, and the pane fall-through guards all live in that one hook so
  // the "exact complement" invariant is enforced in a single place.
  const corr = useClickCorrelation();
  const [addLabelAt, setAddLabelAt] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  // Open the in-place add-label editor on `edgeId` at the event point. Called from
  // the SECOND click of an edge double-click — detected via click events, NOT the
  // browser's `dblclick` (that only fires reliably for an instant double-click;
  // once the first click remounts the edges layer and the second lands on the
  // pane, a human-timed double-click often never produces a `dblclick`).
  const requestAddLabel = (edgeId: string, e: { clientX: number; clientY: number }) => {
    const fp = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setAddLabelAt({ edgeId, x: fp.x, y: fp.y });
  };
  // A notation container that is always expanded (e.g. a git lane) is a row, not
  // a box with an inside — the guard enterNode applies before drilling (see
  // useDrillNavigation). Lives here because it closes over the registries.
  const isAlwaysExpanded = useCallback(
    (id: string) => {
      const node = props.model.nodes.find((n) => n.id === id);
      return (
        node !== undefined &&
        (profile.node?.alwaysExpanded?.(node) === true ||
          (node.type !== undefined && typeRegistry.resolve(node.type).alwaysExpanded === true))
      );
    },
    [props.model.nodes, profile, typeRegistry],
  );
  // The drill trail plus the render-phase navigation sync (new model / plane
  // switch / model edit / host-driven path). It adjusts state DURING render, so
  // it has to run before anything that reads focus/drillRoot/enteredPath —
  // notably the compileView memo below.
  const nav = useDrillNavigation({
    model: props.model,
    plane: props.plane,
    enteredPathProp: props.enteredPath,
    onEnteredPathChange: props.onEnteredPathChange,
    visibleRef,
    // a fresh arrow each render is fine: the hook only calls this from the
    // plane-switch branch, it never depends on its identity. Both open editors
    // go: each is keyed to something the new plane may not draw at all (a node,
    // a note), and a field left open would reopen on the way back —
    // and the session's note toggles, which were about elements this plane
    // may not draw.
    onPlaneSwitch: () => {
      setLabelEdit(null);
      setNoteEdit(null);
      setNoteOverrides(new Map());
    },
    isAlwaysExpanded,
  });
  const { enteredPath, drillRoot, focus, enterNode, exitTo, pendingRootFitRef } = nav;

  // A requested node that React Flow's copy does not hold yet, waiting for the
  // resync below to hand it the selection (see useEditRequests).
  const selectOnAppearRef = useRef<string | null>(null);

  const nameOf = useMemo(() => new Map(props.model.nodes.map((n) => [n.id, n.name])), [props.model]);

  // The active plane's strokes. Keyed like layout.planes, so a borrowing plane
  // shares its donor's bucket exactly as it shares positions.
  const strokes = useMemo(
    () => props.drawings?.planes[layoutPlaneKey(props.model, props.plane)] ?? [],
    [props.drawings, props.model, props.plane],
  );
  // Render-phase ref (same pattern as useDrillNavigation's enteredPathRef): the layoutApiRef effect
  // below keeps deps of just [layoutApiRef, reactFlow], so it reads the ink
  // through a ref rather than re-installing the api object on every stroke.
  const strokesRef = useRef<readonly Stroke[]>([]);
  strokesRef.current = strokes;
  // Tracing-paper switch: viewer state, on by default (an author drew it to be
  // seen), reset per diagram like pins. Never saved.
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  useEffect(() => {
    setDrawingsVisible(true);
  }, [props.model.id]);
  const chromeless = props.chrome === false;
  const { pen: penSettings } = props;
  const gestures = useCanvasGestures({
    editing,
    tool: props.tool,
    drillRoot,
    chromeless,
    builtinKeys: props.builtinKeys !== false,
    modelId: props.model.id,
    pen: props.pen,
    onAddStroke: edit?.onAddStroke,
    toFlow: reactFlow.screenToFlowPosition,
  });
  const { laserOn, setLaserOn, penActive, eraserActive, gestureCaptured, pen, laser, gestureHandlers } = gestures;

  // A notation may declare containers that never fold (git lanes are rows, not
  // boxes with an inside): they are pinned expanded over whatever the host's
  // pins say. The host's own pins still feed the chips, so nothing else changes.
  const effectivePins = useMemo(() => {
    const always = profile.node?.alwaysExpanded;
    const typeAlways = (n: DiagramNode) => n.type !== undefined && typeRegistry.resolve(n.type).alwaysExpanded === true;
    const pinned = props.model.nodes.filter((n) => always?.(n) === true || typeAlways(n));
    if (pinned.length === 0) return props.pins; // referential stability: nothing to add
    const pins: Record<string, 'expanded' | 'collapsed'> = { ...(props.pins ?? {}) };
    for (const n of pinned) pins[n.id] = 'expanded';
    return pins;
  }, [profile, props.pins, props.model.nodes, typeRegistry]);

  const compiled = useMemo(() => {
    const raw = compileView(props.model, {
      // drilled → `root` drives visibility; otherwise `focus` (pins + the plane
      // sheet-flip). Identical for view and edit — only affordances differ.
      focus: drillRoot !== undefined ? undefined : focus,
      pins: effectivePins,
      activeLayers: props.activeLayers,
      plane: props.plane,
      root: drillRoot,
    });
    // A notation may keep some relation kinds off the canvas (plan roles become
    // chips). Only the DRAWN set is filtered: layoutEdges keep every relation,
    // the same rule that keeps a layer toggle from moving a box.
    const hidden = profile.edge?.hidden;
    if (hidden === undefined || !raw.edges.some((e) => hidden(e.kind))) return raw;
    return { ...raw, edges: raw.edges.filter((e) => !hidden(e.kind)) };
  }, [props.model, props.plane, focus, drillRoot, effectivePins, props.activeLayers, profile]);
  // Render-phase ref, same pattern as strokesRef below: the layoutApiRef effect's
  // snapshotPositions (further down) needs compiled.externals to drop stub ids,
  // but that effect only re-runs on [layoutApiRef, reactFlow] — so it reads
  // `compiled` through a ref kept current every render instead of depending on it.
  const compiledRef = useRef(compiled);
  compiledRef.current = compiled;

  // remember what is on screen — the plane-switch mapping reads this
  useEffect(() => {
    const ids: string[] = [];
    const walk = (n: ViewNode) => {
      ids.push(n.id);
      n.children.forEach(walk);
    };
    compiled.roots.forEach(walk);
    visibleRef.current = ids;
  }, [compiled]);

  // Up here rather than beside `edgeColors`, because the legend needs it too: a
  // trust boundary's swatch is red for the same reason its box is.
  const nodeColors = useMemo(
    () => profile.node?.colorOf?.(props.model, props.plane),
    [profile, props.model, props.plane],
  );
  // Small chips in a node's badge row (the plan's role chips), derived the same
  // way as nodeColors: id-keyed, one derivation per model/plane.
  const nodeChips = useMemo(() => profile.node?.chips?.(props.model, props.plane), [profile, props.model, props.plane]);

  const legend = useLegendState({
    model: props.model,
    plane: props.plane,
    compiled,
    drillRoot,
    activeLayers: props.activeLayers,
    typeRegistry,
    kindRegistry,
    canToggleLayers: props.onToggleLayer !== undefined,
    strokes,
    drawingsVisible,
    nodeColors,
  });
  const { legendConfig, showLegend, setShowLegend, setLegendSize, legendRowList, legendReserveRef } = legend;

  // Alt-held enables ephemeral node dragging in view mode. A blur listener
  // releases a stuck Alt (e.g. after Alt+Tab).
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    const clear = () => setAltHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // Ephemeral view-mode drag positions for the active plane; cleared on a plane
  // switch, model reload, or edit-mode toggle (edit persists positions via the
  // saved overlay, so a returning view must start from that, not a stale drag).
  const [viewPositions, setViewPositions] = useState<Record<string, Point>>({});
  useEffect(() => {
    setViewPositions({});
  }, [props.model, props.plane, editing]);
  // Edge labels slid in view mode (Alt+drag a label): the same throwaway class
  // of state as the box drags above, reset by the same events and offered to
  // the host the same way (relation id → label id → placement).
  const [viewLabelMoves, setViewLabelMoves] = useState<EdgeLabelMoves>({});
  useEffect(() => {
    setViewLabelMoves({});
  }, [props.model, props.plane, editing]);
  const { onViewLabelMovesChange } = props;
  useEffect(() => {
    onViewLabelMovesChange?.(viewLabelMoves);
  }, [viewLabelMoves, onViewLabelMovesChange]);
  const moveViewLabel = useCallback(
    (relationId: string, labelId: string, t: number, side: EdgeLabelSide) =>
      setViewLabelMoves((m) => ({
        ...m,
        [relationId]: { ...m[relationId], [labelId]: side === 'center' ? { t } : { t, side } },
      })),
    [],
  );
  // What is drawn: the saved placements for this plane (a viewer may set those
  // aside together with the saved positions), with this session's moves on top.
  // Editing reads only the saved ones — there a label drag edits the document.
  const labelMoves = useMemo((): EdgeLabelMoves | undefined => {
    const saved =
      !editing && props.ignoreSavedPositions === true
        ? undefined
        : props.layout?.edgeLabels?.[layoutPlaneKey(props.model, props.plane)];
    if (editing || Object.keys(viewLabelMoves).length === 0) return saved;
    const merged: Record<string, Record<string, EdgeLabelPlacement>> = { ...saved };
    for (const [relationId, labels] of Object.entries(viewLabelMoves))
      merged[relationId] = { ...merged[relationId], ...labels };
    return merged;
  }, [editing, props.ignoreSavedPositions, props.layout, props.model, props.plane, viewLabelMoves]);

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
  }, []);
  // Surface them upward so a host can offer to persist them. Driven off the state
  // rather than the drag handler, so the resets above are reported too — a host
  // that kept showing a "save" affordance after a plane switch would be offering
  // to write positions the viewer can no longer see.
  const { onViewPositionsChange } = props;
  useEffect(() => {
    onViewPositionsChange?.(viewPositions);
  }, [viewPositions, onViewPositionsChange]);

  // Both feed the node data below AND the layout's box-size estimate (a folded
  // container's count badge and a node's meta badges take real width), so they
  // are derived ahead of the geometry pipeline.
  const hiddenCounts = useMemo(() => countAnchored(props.model, compiled), [props.model, compiled]);
  const metaKeys = props.onNodeMetaKeys ?? DEFAULT_ON_NODE_META_KEYS;

  // The geometry pipeline (size hints → elk/notation layout → overlay-applied
  // and band-arranged geometry): see useViewLayout.
  const viewLayout = useViewLayout({
    model: props.model,
    plane: props.plane,
    layout: props.layout,
    compiled,
    profile,
    typeRegistry,
    metaKeys,
    hiddenCounts,
    editing,
    ignoreSavedPositions: props.ignoreSavedPositions,
    viewPositions,
  });
  const {
    geometryRef,
    routes,
    placedGeometry,
    arrangedGeometry,
    containerShifts,
    routing,
    laidAt,
    labelSpots,
    fixed,
    settledFor,
    flowDirection,
  } = viewLayout;
  // Render-phase ref, same pattern and reason as compiledRef above: commitMoves
  // (further down) needs the ARRANGED geometry to compute a move's displacement,
  // but its dependency list is hand-managed and must not grow with every
  // re-layout, so it reads arrangedGeometry through a ref kept current every
  // render instead.
  const arrangedRef = useRef(arrangedGeometry);
  arrangedRef.current = arrangedGeometry;

  // Where each open container's origin sits BEFORE the fit pass shifted it, in
  // absolute flow coordinates — the frame a child's saved position is relative
  // to (see fit-containers.ts). Summed root-first, the same order commitMoves
  // sums the on-screen chain, so with no shift the two are the same float and
  // a saved position is exactly the on-screen one.
  const containerBases = useMemo(() => {
    const bases = new Map<string, Point>();
    if (arrangedGeometry === null) return bases;
    const walk = (n: ViewNode, ox: number, oy: number) => {
      const g = arrangedGeometry.get(n.id);
      if (g === undefined) return;
      const x = ox + g.x;
      const y = oy + g.y;
      if (n.children.length === 0) return;
      const shift = containerShifts.get(n.id);
      bases.set(n.id, { x: x - (shift?.dx ?? 0), y: y - (shift?.dy ?? 0) });
      n.children.forEach((c) => walk(c, x, y));
    };
    compiled.roots.forEach((r) => walk(r, 0, 0));
    return bases;
  }, [compiled, arrangedGeometry, containerShifts]);
  // Render-phase refs (the strokesRef pattern): commitMoves reads them at
  // gesture time and must not change identity with every re-layout.
  const containerBasesRef = useRef(containerBases);
  containerBasesRef.current = containerBases;
  const containerShiftsRef = useRef(containerShifts);
  containerShiftsRef.current = containerShifts;

  // A drill (enter/exit) or a different diagram swaps the whole scene, so once
  // it re-layouts, fit the new view: a glide into a level of the same diagram, a
  // jump to where a first open would land for another one (see RootFit).
  //
  // "Once it re-layouts" is `settledFor`, not `arrangedGeometry !== null`: the
  // last arrangement is kept while the next is computed, so the render that
  // swaps the scene already holds a non-null one — the OLD scene's. Where the
  // two share ids (a drill always does; so does a diagram and the copy that was
  // added to) that is a complete-looking, already-measured set of boxes, React
  // Flow resolves the fit against it on the spot, and the real arrangement then
  // lands under a camera framing the wrong thing.
  useEffect(() => {
    const fit = pendingRootFitRef.current;
    if (fit === null || arrangedGeometry === null || settledFor !== compiled) return;
    pendingRootFitRef.current = null;
    void reactFlow.fitView(fit === 'glide' ? { padding: 0.15, duration: 500 } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingRootFitRef is a stable useRef identity (owned by useDrillNavigation) read through .current
  }, [compiled, arrangedGeometry, settledFor, reactFlow]);

  // Paste lands at the viewport center; pastes aimed at form fields stay theirs.
  const onImageFiles = edit?.onImageFiles;
  useEffect(() => {
    if (!editing || onImageFiles === undefined) return;
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const files = imageFilesOf(e.clipboardData?.files);
      if (files.length === 0) return;
      e.preventDefault();
      const rect = wrapperRef.current?.getBoundingClientRect();
      const position =
        rect !== undefined
          ? reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : undefined;
      onImageFiles(files, position);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editing, onImageFiles, reactFlow]);

  // Notation colour hooks: a node/edge takes its lane's (or otherwise the
  // notation's) colour where it sets none itself. Absent notation = absent map,
  // so an unrelated diagram's build-data pass never sees a `nodeColors` field.
  // (`nodeColors` itself is computed above the legend, which keys with it.)
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

  // The per-node data channel inputs, as one object the cached builder keys
  // its identity on (see build-data.ts): while every field is referentially
  // unchanged, the cached data objects are reused instead of rebuilt.
  const nodeDataCtx = useMemo<NodeDataContext>(
    () => ({
      metaKeys,
      hiddenCounts,
      typeRegistry,
      icons,
      typeColors: props.model.typeColors,
      onOpenLink: props.onOpenLink,
      onToggleExpand: props.onToggleExpand,
      onEnterNode: enterNode,
      editing,
      labelEditingId: labelEdit?.kind === 'node' ? labelEdit.id : undefined,
      endLabelEdit: () => setLabelEdit(null),
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
      nodeChips,
      resizable: profile.node?.resizable,
    }),
    [
      metaKeys,
      hiddenCounts,
      typeRegistry,
      icons,
      props.model.typeColors,
      props.onOpenLink,
      props.onToggleExpand,
      enterNode,
      editing,
      labelEdit,
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
      nodeChips,
      profile,
    ],
  );

  const derivedNodes = useMemo((): Node[] => {
    if (arrangedGeometry === null) return [];
    const out: Node[] = [];
    const walk = (n: ViewNode, parent?: string) => {
      const geo = arrangedGeometry.get(n.id);
      if (geo === undefined) return;
      const data = buildNodeDataCached(n, nodeDataCtx);
      const dragLocked = fixed.has(n.id) && profile.node?.draggableWhenFixed?.(n.node) !== true;
      out.push(
        toRfNode({
          id: n.id,
          position: { x: geo.x, y: geo.y },
          data,
          parentId: parent,
          // A node the notation fixed (a fishbone's) takes no drag in either
          // mode — not even the pixel of jitter in a click, which React Flow
          // counts as one and which used to save a position at the spot the node
          // already stood on: invisible until the fish next changed shape and
          // left the node behind with its lines floating. Still selectable —
          // which needs `nopan` back: React Flow drops it from a non-draggable
          // node, a press on one then pans the canvas, and a pan of one pixel
          // swallows the click. Edit mode only: in view mode every node pans
          // that way, and the effect spans the whole spine.
          //
          // A notation may except a node whose drag still means something (a
          // plan zone's or event's displacement is read as days): it drags,
          // and `fixed` still keeps the overlay from ever storing a position
          // for it.
          draggable: dragLocked ? false : undefined,
          className: dragLocked && editing ? 'nopan' : undefined,
          // Membership is edited in the node panel, not by dragging away, so a
          // child never leaves its box — the box gives way instead, live while
          // dragging (React Flow's expandParent) and for good once dropped (the
          // fit pass in useViewLayout). Both modes: an Alt-drag in view mode
          // used to carry the child straight out through the wall. A notation
          // that owns the arrangement sizes its own rows, so there the old
          // edit-mode clamp stays.
          //
          // ...unless the node is one this drag may DROP into a different
          // parent (dropTargetFor/onDropInto): a plan's plain node or actor,
          // already nested in a zone, still counts as droppable, and both
          // `extent: 'parent'` and `expandParent` would stop it ever reaching
          // a neighbouring zone — the clamp reads it as a reparent attempt to
          // resist, the drop feature reads the same gesture as the point. No
          // notation today combines a droppable node with `expandParent`
          // (only the plan sets `dropTarget`/`canDrop`, and the plan owns its
          // layout, so it only ever reaches the `extent` branch below) — the
          // `expandParent` omission is here anyway so a future notation that
          // did combine them would not grow the wrong box mid-drag toward a
          // sibling's.
          ...(parent === undefined ||
          (profile.node?.dropTarget !== undefined && profile.node?.canDrop?.(n.node) === true)
            ? {}
            : profile.layout === undefined
              ? { expandParent: true }
              : editing
                ? { extent: 'parent' as const }
                : {}),
          ...(n.state === 'expanded'
            ? { style: { width: geo.width, height: geo.height }, zIndex: -1 }
            : n.node.type === GIT_STAGE_TYPE
              ? // a stage frame is sized by the git layout and sits BEHIND the lanes it spans
                { style: { width: geo.width, height: geo.height }, zIndex: -2 }
              : (n.node.image !== undefined || n.node.shape !== undefined) && n.state === 'leaf'
                ? { style: { width: geo.width, height: geo.height } }
                : // A circle leaf (e.g. a git commit) has no CSS-natural size the way
                  // an ordinary box does — .dg-circle-node zeroes out the base node's
                  // min-width/padding and is sized entirely by its RF wrapper
                  // (width/height: 100%). Without an explicit inline size here, that
                  // wrapper collapses to its border-only intrinsic size, so the
                  // layout's diameter must be applied explicitly, same as image/shape
                  // leaves above. Ordinary boxes and CLD text nodes must NOT go
                  // through this branch — forcing sizes there would change their
                  // existing CSS-driven sizing. …and a fishbone leaf, whose layout
                  // sizes it (see LAYOUT_SIZED_TYPES). An EMPTY git lane is the
                  // activity-chrome case again: no commits, so compiled 'leaf',
                  // while .dg-lane is width/height:100% of its wrapper — without
                  // gitLayout's band size it is 0×0 and React Flow never shows it
                  // (a node stays `visibility: hidden` until it measures). Keyed on
                  // the notation, not the type: a branch-typed leaf anywhere else
                  // is an ordinary box.
                  n.state === 'leaf' &&
                    n.node.type !== undefined &&
                    (FORCED_SIZE_SHAPES.has(typeRegistry.resolve(n.node.type).shape) ||
                      isActivityChrome(n.node.type) ||
                      LAYOUT_SIZED_TYPES.has(n.node.type) ||
                      profile.node?.isLane?.(n.node.type) === true)
                  ? { style: { width: geo.width, height: geo.height } }
                  : // An ordinary box keeps its CSS sizing, but never narrower than
                    // the box elk laid out (box-size.ts estimates it): routes and
                    // gaps are computed against that box, so a narrower drawn one
                    // leaves an orthogonal arrow starting in mid-air beside it.
                    // A FLOOR, not a width — a label the estimate undershot still
                    // grows the box rather than wrapping inside it. Only where
                    // elk placed the node from such an estimate: a notation's own
                    // layout spaces its boxes off LEAF_SIZE, and a CLD text node is
                    // deliberately free of the box minimum.
                    profile.layout === undefined &&
                      !(profile.node?.typelessAsText === true && n.node.type === undefined)
                    ? { style: { minWidth: geo.width } }
                    : {}),
        }),
      );
      n.children.forEach((c) => walk(c, n.id));
    };
    compiled.roots.forEach((r) => walk(r));
    return out;
  }, [compiled, arrangedGeometry, nodeDataCtx, editing, typeRegistry, profile, fixed]);

  const { noteState, noteNodes } = useNoteNodes({
    model: props.model,
    plane: props.plane,
    notes: props.notes,
    layout: props.layout,
    session: notes,
    editing,
    edit,
    onOpenLink: props.onOpenLink,
    compiled,
    arrangedGeometry,
    profile,
    nameOf,
    typeRegistry,
  });
  // Boxes first, notes after: React Flow resolves `parentId` against the nodes
  // it has already seen, so a note must never precede the box it rides on.
  //
  // A diff picture's marks ride on React Flow's wrapper class, so every node
  // shape gets them without each node body knowing. `inside` only on a
  // folded box: an open one shows the changed child itself.
  const diffMarks = props.diffMarks;
  const diffClasses = useMemo(
    () => (diffMarks !== undefined ? diffNodeClasses(props.model, diffMarks) : null),
    [diffMarks, props.model],
  );
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
  // (onNodeDragStop below) needs each node's LAID position — the same source
  // the resync effect further down reads when it copies allNodes into rfNodes
  // — read synchronously at drop time, not a render later.
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;

  // React Flow owns a copy of the nodes and we apply its changes (drag positions,
  // measured dimensions, selection) with applyNodeChanges — the v12-recommended
  // shape. Fully controlled nodes (the previous design) re-created every node
  // object per drag frame, re-rendering all nodes and flickering under drag.
  // useLayoutEffect so a derived-node change never paints a stale frame first.
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const rfNodesRef = useRef<Node[]>([]);
  rfNodesRef.current = rfNodes;
  useEditRequests({
    editing,
    edit,
    derivedNodes,
    setLabelEdit,
    setNoteEdit,
    setRfNodes,
    selectOnAppearRef,
  });
  const commitMoves = useCommitMoves({
    editing,
    edit,
    rfNodesRef,
    containerBasesRef,
    containerShiftsRef,
    arrangedRef,
    setViewPositions,
  });
  // Arrow keys (see useNudge). The step follows the snap grid when one is on,
  // so a nudge lands on the same grid a drag would.
  const nudge = useNudge({
    enabled: !chromeless && !gestureCaptured,
    step: props.snapGrid ?? NUDGE_STEP,
    nodesRef: rfNodesRef,
    applyMoves: (moves) =>
      setRfNodes((nds) =>
        applyNodeChanges(
          Object.entries(moves).map(([id, position]) => ({ type: 'position' as const, id, position })),
          nds,
        ),
      ),
    commit: commitMoves,
  });
  const drag = useNodeDragging({
    editing,
    edit,
    model: props.model,
    plane: props.plane,
    profile,
    reactFlow,
    rfNodesRef,
    setRfNodes,
    allNodesRef,
    arrangedRef,
    flushNudge: nudge.flush,
    commitMoves,
  });
  // What align/distribute act on: the selection minus the nodes nothing may move
  // (see `draggable` above). They are neither moved nor lined up against, so
  // two fish nodes are no selection to arrange and the toolbar stays away.
  const selectedIds = useMemo(
    () => rfNodes.filter((n) => n.selected === true && n.draggable !== false).map((n) => n.id),
    [rfNodes],
  );
  // Arrange buttons need somewhere for the result to land: edit mode has the
  // host's command pipeline; view mode only the host's Save positions offer,
  // so the published viewer (which passes neither) never shows them.
  const canArrange = !chromeless && !gestureCaptured && (editing || props.onViewPositionsChange !== undefined);
  const arrangeSelection = (fn: (boxes: Box[]) => Record<string, Delta>) => {
    nudge.flush(); // a pending keyboard burst must land before this batch
    const byId = new Map(rfNodesRef.current.map((n) => [n.id, n] as const));
    const ids = dropDescendants(selectedIds, (id) => byId.get(id)?.parentId);
    const boxes: Box[] = [];
    for (const id of ids) {
      const n = byId.get(id);
      const abs = reactFlow.getInternalNode(id)?.internals.positionAbsolute;
      const w = n?.measured?.width;
      const h = n?.measured?.height;
      if (n === undefined || abs === undefined || w === undefined || h === undefined) continue;
      boxes.push({ id, x: abs.x, y: abs.y, w, h });
    }
    const positions: Positions = {};
    for (const [id, d] of Object.entries(fn(boxes))) {
      const n = byId.get(id)!;
      positions[id] = { x: n.position.x + d.dx, y: n.position.y + d.dy };
    }
    if (Object.keys(positions).length === 0) return;
    // Move at once: the commit re-derives the same positions a frame later,
    // but only if the host's onNodesMoved is synchronous — React 18 then
    // batches that re-derivation with this setRfNodes into one render. An
    // async host would let the resync useLayoutEffect run in between and
    // briefly snap the boxes back to their pre-arrange positions.
    setRfNodes((nds) =>
      applyNodeChanges(
        Object.entries(positions).map(([id, position]) => ({ type: 'position' as const, id, position })),
        nds,
      ),
    );
    commitMoves(positions);
  };
  // Resync must not wipe flags React Flow owns on its copy — selection drives
  // the image-node resizer, and a selection click itself re-renders the app,
  // recomputing derivedNodes in the same tick.
  useLayoutEffect(() => {
    // ...except a claim left by a label request whose node had not been laid out
    // yet (see that effect above): the first resync that carries the node hands
    // it the selection, so the ring and the quick-add button land on the box the caret
    // is in. Read before the updater so the ref is cleared exactly once.
    // The claim is still checked against the BOXES: a label request always names
    // a model node, and a note is never one of them.
    const claim = selectOnAppearRef.current;
    const claimed = claim !== null && derivedNodes.some((n) => n.id === claim) ? claim : null;
    if (claimed !== null) selectOnAppearRef.current = null;
    setRfNodes((prev) => {
      const selected =
        claimed !== null ? new Set([claimed]) : new Set(prev.filter((n) => n.selected === true).map((n) => n.id));
      // A nudge not yet committed must not be undone by a resync in its idle
      // window: keep the pending position, exactly as the selection is kept.
      const pending = nudge.pendingRef.current;
      if (selected.size === 0 && Object.keys(pending).length === 0) return allNodes;
      return allNodes.map((n) => {
        const p = pending[n.id];
        const s = selected.has(n.id);
        if (!s && p === undefined) return n;
        return { ...n, ...(s ? { selected: true } : {}), ...(p !== undefined ? { position: p } : {}) };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nudge.pendingRef is a stable useRef identity read through .current; derivedNodes is left out because allNodes is derived from it and changes with it (depending on both would only run this twice)
  }, [allNodes]);

  // Populate the host's imperative layout ref (auto-layout toggle). Functions
  // read refs so the api object stays stable while always returning current data.
  useEffect(() => {
    const ref = props.layoutApiRef;
    if (ref === undefined) return;
    ref.current = {
      // External stubs (compiled.externals) are placeholders for an off-frame
      // node while drilled — not real nodes in the model — so writing their
      // `__ext__:` ids into the layout overlay would corrupt it for every
      // other view of the same plane. Drop them from the snapshot. Notes
      // go the same way: a note's place is an offset in `layout.notes`, so a
      // freeze that wrote its `note:` id into `layout.planes` would save a
      // phantom box there for good.
      snapshotPositions: () =>
        Object.fromEntries(
          rfNodesRef.current
            .filter((n) => !(compiledRef.current.externals?.has(n.id) ?? false) && !isNoteId(n.id))
            .map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
        ),
      autoPositions: () =>
        geometryRef.current === null
          ? {}
          : Object.fromEntries([...geometryRef.current].map(([id, g]) => [id, { x: g.x, y: g.y }])),
      viewportCenter: () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        return rect === undefined
          ? undefined
          : reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      },
      nodeBounds: (id) => {
        const n = reactFlow.getInternalNode(id);
        if (n === undefined) return undefined;
        return { ...n.internals.positionAbsolute, width: n.measured.width ?? 0, height: n.measured.height ?? 0 };
      },
      contentBounds: () => {
        const nodes = reactFlow.getNodes();
        const nodeBounds = nodes.length === 0 ? undefined : reactFlow.getNodesBounds(nodes);
        // Union: neither a scribble outside the boxes nor anything drawn past
        // them — a bowed edge, a loop badge, an icon's caption (see
        // overhangBounds) — may be cropped from the PNG.
        return unionBounds([
          nodeBounds,
          strokesBounds(strokesRef.current),
          overhangBounds(wrapperRef.current, (p) => reactFlow.screenToFlowPosition(p, { snapToGrid: false })),
        ]);
      },
      fitView: (padding = 0.06) => {
        const pad =
          typeof padding === 'number'
            ? padding
            : Object.fromEntries(Object.entries(padding).map(([k, v]) => [k, `${v}px`]));
        // Fit the CONTENT box (nodes ∪ strokes), not React Flow's node-only
        // fitView. Same getViewportForBounds underneath, over bounds taken from
        // the same node lookup fitView reads (the instance getNodesBounds, which
        // resolves a child's parent-relative position to an absolute one), so a
        // stroke-less diagram lands on the viewport fitView would have chosen.
        const bounds = ref.current?.contentBounds();
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (bounds !== undefined && rect !== undefined && rect.width > 0 && rect.height > 0) {
          void reactFlow.setViewport(getViewportForBounds(bounds, rect.width, rect.height, MIN_ZOOM, MAX_ZOOM, pad));
          return;
        }
        void reactFlow.fitView({ padding: pad });
      },
      legendReserve: () => legendReserveRef.current,
      exportPng: async (opts) => {
        const el = wrapperRef.current?.querySelector<HTMLElement>('.react-flow');
        const bounds = ref.current?.contentBounds();
        if (el === null || el === undefined || bounds === undefined) return null;
        const frame = exportFrame(bounds, opts);
        const before = reactFlow.getViewport();
        // Move the content to 1:1 inside a frame cut to its size, let the
        // viewport-driven layers (drawings, canvas overlays) catch up, then clone.
        await reactFlow.setViewport(frame.viewport);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        try {
          return await captureCanvas(el, frame);
        } finally {
          void reactFlow.setViewport(before);
        }
      },
    };
    return () => {
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- legendReserveRef and geometryRef come from hooks, so the rule cannot see they are stable useRef identities read through .current (rfNodesRef/strokesRef are local refs the rule already exempts)
  }, [props.layoutApiRef, reactFlow]);

  // The per-edge data channel inputs, as one object the cached builder keys
  // its identity on (see build-data.ts) — same stability contract as the node
  // ctx above.
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
      onPendingAddConsumed: () => setAddLabelAt(null),
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

  const loops = useLoopOverlay({
    profile,
    compiled,
    model: props.model,
    plane: props.plane,
    externalHighlight: props.externalHighlight,
    onCldEdges: props.onCldEdges,
  });
  const {
    cld,
    loopEdges,
    showLoops,
    setShowLoops,
    selectedNode,
    setSelectedNode,
    focusConnected,
    setFocusConnected,
    loopHighlight,
  } = loops;

  // The host's keyboard (see DiagramViewProps.canvasCommandsRef). Rebuilt and
  // re-assigned on every commit rather than read through refs like the layout
  // api: every entry closes over this render's state (is there a legend? how
  // many boxes are selected?), and an assignment per render is cheaper than
  // mirroring ten values into refs to keep one object stable.
  const canvasCommands: CanvasCommands = {
    toggleLaser: () => {
      setLaserOn((v) => !v);
      return true;
    },
    toggleDim: () => {
      setFocusConnected((v) => !v);
      return true;
    },
    toggleLegend: () => {
      if (legendRowList.length === 0) return false;
      setShowLegend((v) => !v);
      return true;
    },
    toggleDrawings: () => {
      if (strokes.length === 0 || drillRoot !== undefined) return false;
      setDrawingsVisible((v) => !v);
      return true;
    },
    toggleLoops: () => {
      if (!cld) return false;
      // same order as the button: hiding removes the badges you'd click to un-highlight
      if (showLoops) loopHighlight.clear();
      setShowLoops((v) => !v);
      return true;
    },
    zoomIn: () => {
      void reactFlow.zoomIn();
      return true;
    },
    zoomOut: () => {
      void reactFlow.zoomOut();
      return true;
    },
    fitView: () => {
      const api = props.layoutApiRef?.current;
      if (api !== undefined && api !== null) api.fitView();
      else void reactFlow.fitView();
      return true;
    },
    // The counts are SelectionToolbar's own: it shows itself from two boxes and
    // enables Distribute from three.
    align: (mode) => {
      if (!canArrange || selectedIds.length < 2) return false;
      arrangeSelection((boxes) => alignBoxes(boxes, mode));
      return true;
    },
    distribute: (axis) => {
      if (!canArrange || selectedIds.length < 3) return false;
      arrangeSelection((boxes) => distributeBoxes(boxes, axis));
      return true;
    },
  };
  useEffect(() => {
    const ref = props.canvasCommandsRef;
    if (ref === undefined) return;
    ref.current = canvasCommands;
    return () => {
      ref.current = null;
    };
  });
  const keyHint = (k: CanvasKeyHint): string => {
    const h = props.keyHints?.[k] ?? (k === 'laser' && props.builtinKeys !== false ? 'L' : undefined);
    return h !== undefined && h !== '' ? ` (${h})` : '';
  };

  return (
    <LoopHighlightContext.Provider value={loopHighlight}>
      {/* the badges inside read this to know whether their note is
        open and how to flip it — one provider around the whole canvas, the
        LoopHighlightContext precedent */}
      <NoteStateContext.Provider value={noteState}>
        <div
          ref={wrapperRef}
          className={`dg-canvas${props.chrome === false ? ' dg-no-chrome' : ''}${editing ? ' dg-mode-edit' : ''}${!editing && altHeld ? ' dg-alt-move' : ''}${drag.dragging ? ' dg-dragging' : ''}${
            preset.id !== 'clean' ? ` dg-style-${preset.id}` : ''
          }${preset.rough !== undefined ? ' dg-style-rough' : ''}${preset.fontFamily !== undefined ? ' dg-style-font' : ''}${
            profile.className !== undefined ? ' ' + profile.className : ''
          }${penActive ? ' dg-tool-pen' : ''}${eraserActive ? ' dg-tool-eraser' : ''}${laserOn ? ' dg-tool-laser' : ''}`}
          style={
            {
              width: '100%',
              height: '100%',
              '--dg-style-font': preset.fontFamily,
              ...(preset.cssVars ?? {}),
            } as CSSProperties
          }
          onDragOver={(e) => {
            if (!editing) return;
            const hasEntry =
              edit?.onDropLibraryEntry !== undefined && e.dataTransfer.types.includes(LIBRARY_ENTRY_DND_TYPE);
            if (edit?.onImageFiles !== undefined || hasEntry) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!editing) return;
            // A library entry dragged from the palette places that entry at the drop
            // point — checked before the image path since both share this handler.
            const entryId =
              edit?.onDropLibraryEntry !== undefined && typeof e.dataTransfer?.getData === 'function'
                ? e.dataTransfer.getData(LIBRARY_ENTRY_DND_TYPE)
                : '';
            if (entryId !== undefined && entryId !== '') {
              e.preventDefault();
              // A drop that landed on a note is a drop on open canvas: a
              // `note:` id names no model node, and the host writes this straight
              // through as a containment parent.
              const hit = droppedOnNodeId(e);
              const targetNodeId = hit !== undefined && isNoteId(hit) ? undefined : hit;
              edit?.onDropLibraryEntry?.(
                entryId,
                reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                targetNodeId,
              );
              return;
            }
            if (edit?.onImageFiles === undefined) return;
            // dragOver already preventDefault()d to claim the drop, so the browser
            // is primed to otherwise navigate to the dropped file; claim it here
            // too before filtering, or a non-image drop falls through to that
            // navigation and unsaved edits are gone.
            e.preventDefault();
            const files = imageFilesOf(e.dataTransfer?.files);
            if (files.length === 0) return;
            edit.onImageFiles(files, reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          }}
          onKeyDownCapture={nudge.onKeyDownCapture}
          onBlurCapture={nudge.onBlurCapture}
          {...gestureHandlers}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={props.colorMode ?? 'light'}
            connectionMode={ConnectionMode.Loose}
            onNodeClick={(e, node) => {
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
                const target = (node.data as unknown as NoteData).target;
                if (isNodeRef(target)) {
                  setSelectedNode(target.node);
                  // ...and move React Flow's OWN selection with it. The note is not
                  // selectable, so the flag would otherwise stay on whatever box was
                  // clicked before — and the ring, the image resizer, the quick-add button
                  // and deleteKeyCode/onDelete all render off THAT flag (the same
                  // hazard the editLabelRequest effect documents). Without this,
                  // Backspace would delete the previous box while the panel shows
                  // the element this note is about.
                  setRfNodes((prev) => soleSelection(prev, target.node));
                  props.onSelect?.({ kind: 'node', id: target.node });
                } else {
                  const ve = compiled.edges.find((x) => soleRelation(x)?.id === target.relation);
                  if (ve !== undefined) {
                    if (editing) setFixedSideRelation(target.relation);
                    setSelectedNode(null);
                    // The same hazard, with no box to move to. onEdgeClick is safe
                    // for free — React Flow clears the node selection when its own
                    // edge selection takes over — but a note click is a NODE click,
                    // so nothing clears it for us.
                    setRfNodes(noSelection);
                    props.onSelect?.({ kind: 'edge', id: ve.id, constituentIds: [target.relation] });
                  }
                }
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
            }}
            onNodeDoubleClick={(_e, node) => {
              // edit mode only: rename in place. View-mode enter is handled by the
              // click correlation above (the native node dblclick is unreliable here).
              // A note has no model name to rename — its own double-click opens a
              // threat row instead (NoteNode) — so it is excluded here, or the
              // rename box would open on a `note:` id no node answers to. By type,
              // so a model node called `note:x` still renames.
              if (editing && node.type !== 'note') setLabelEdit({ kind: 'node', id: node.id });
            }}
            onReconnectStart={(_e, _edge, handleType) => {
              reconnectEndRef.current = handleType;
            }}
            onReconnect={(oldEdge, conn) => {
              if (!editing || conn.source === null || conn.target === null) return;
              const viewEdge = compiled.edges.find((x) => x.id === oldEdge.id);
              const relation = viewEdge !== undefined ? soleRelation(viewEdge) : undefined;
              if (relation === undefined) return;
              const endSide = reconnectSide(
                reconnectEndRef.current,
                {
                  source: conn.source,
                  target: conn.target,
                  sourceHandle: conn.sourceHandle,
                  targetHandle: conn.targetHandle,
                },
                relation,
              );
              edit?.onReconnect?.(relation.id, conn.source, conn.target, endSide);
            }}
            onReconnectEnd={() => {
              reconnectEndRef.current = null;
            }}
            {...drag.handlers}
            onConnect={(conn) => {
              if (conn.source !== null && conn.target !== null)
                edit?.onConnect?.(conn.source, conn.target, conn.sourceHandle, conn.targetHandle);
            }}
            onEdgeClick={(e, edge) => {
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
            }}
            onPaneClick={(e) => {
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
                // edit mode: double-click empty canvas drops a node here; view mode
                // keeps the fit-view convenience (the ⛶ control fits in both modes).
                if (editing && edit?.onCreateAt !== undefined) {
                  const id = edit.onCreateAt(reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
                  if (typeof id === 'string') setLabelEdit({ kind: 'node', id });
                } else {
                  void reactFlow.fitView({ padding: 0.1, duration: 500 });
                }
              } else {
                setFixedSideRelation(null);
                corr.clearAll(); // a pane deselect breaks both pending correlations
                setSelectedNode(null);
                props.onSelect?.(null);
                loopHighlight.clear();
              }
            }}
            // Enabled only when the host can turn the gesture into model commands;
            // otherwise (view mode, or an edit host without the callback) the key
            // must stay inert rather than fake a deletion.
            deleteKeyCode={editing && edit?.onDeleteSelection !== undefined ? ['Backspace', 'Delete'] : null}
            onDelete={({ nodes, edges }) => {
              const nodeIds = nodes.map((n) => n.id);
              // Only explicitly selected edges translate to relation deletes:
              // edges React Flow cascade-deletes alongside a node are pruned
              // model-side by delete-node already, and a bundled edge maps to
              // every relation it draws for.
              const relationIds = edges
                .filter((e) => e.selected === true)
                .flatMap((e) => compiled.edges.find((x) => x.id === e.id)?.constituents.map((c) => c.id) ?? []);
              if (nodeIds.length > 0 || relationIds.length > 0) edit?.onDeleteSelection?.({ nodeIds, relationIds });
            }}
            fitView
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            {...(props.snapGrid !== undefined
              ? { snapToGrid: true, snapGrid: [props.snapGrid, props.snapGrid] as [number, number] }
              : {})}
            // Shift+click adds to the selection; Shift+drag on the pane draws a
            // marquee (full containment: sweeping over children inside an expanded
            // group never grabs the group). Both off while the pen/laser owns the drag.
            multiSelectionKeyCode={gestureCaptured ? null : 'Shift'}
            selectionKeyCode={gestureCaptured ? null : 'Shift'}
            onSelectionChange={onSelectionChange}
            panOnScroll
            // The pen (or the laser) owns the drag: no pan, no selection rectangle,
            // no node drag or connect — a stroke that started on a box would
            // otherwise move it.
            panOnDrag={!gestureCaptured}
            elementsSelectable={!gestureCaptured}
            nodesDraggable={(editing || altHeld) && !gestureCaptured}
            nodesConnectable={editing && !gestureCaptured}
            proOptions={{ hideAttribution: true }}
          >
            {/* With snapping on the dots ARE the grid, so a dropped box visibly lands on one. */}
            <Background {...(props.snapGrid !== undefined ? { gap: props.snapGrid, className: 'dg-grid-on' } : {})} />
            <DrawingsLayer
              strokes={strokes}
              live={
                pen.live === null
                  ? null
                  : {
                      points: pen.live,
                      width: penSettings?.width ?? DEFAULT_STROKE_WIDTH,
                      color: penSettings?.color,
                    }
              }
              visible={drawingsVisible && drillRoot === undefined}
              erasing={eraserActive}
              onErase={(id) => edit?.onDeleteStroke?.(id)}
            />
            <LaserLayer trails={laser.trails} live={laser.live} />
            <GuidesLayer lines={drag.guides} />
            {canArrange && (
              <SelectionToolbar
                ids={selectedIds}
                onAlign={(mode) => arrangeSelection((boxes) => alignBoxes(boxes, mode))}
                onDistribute={(axis) => arrangeSelection((boxes) => distributeBoxes(boxes, axis))}
              />
            )}
            <Breadcrumbs path={enteredPath} nameOf={(id) => nameOf.get(id) ?? id} onCrumb={exitTo} />
            {showLegend && legendRowList.length > 0 && (
              // LegendPosition is a subset of React Flow's PanelPosition — no cast needed.
              <Panel position={legendConfig?.position ?? 'bottom-right'}>
                <Legend
                  rows={legendRowList}
                  title={legendConfig?.title}
                  interactive={props.chrome !== false}
                  onToggleLayer={props.onToggleLayer}
                  // Same derivation as `interactive` above: Legend decides "is this
                  // row a button" from the handler alone, so a chrome-less host (the
                  // PNG export) must get no handler — or the export would carry a
                  // focusable control nothing can press.
                  onToggleDrawings={props.chrome !== false ? () => setDrawingsVisible((v) => !v) : undefined}
                  icons={icons}
                  onMeasure={setLegendSize}
                />
              </Panel>
            )}
            {props.chrome !== false && (
              <Controls>
                <ControlButton
                  className={`dg-focus-toggle${focusConnected ? '' : ' dg-focus-toggle-off'}`}
                  title={`${focusConnected ? 'Stop dimming unconnected on select' : 'Dim unconnected on select'}${keyHint('dim')}`}
                  aria-label={focusConnected ? 'Stop dimming unconnected on select' : 'Dim unconnected on select'}
                  aria-pressed={focusConnected}
                  onClick={() => setFocusConnected((v) => !v)}
                >
                  ◎
                </ControlButton>
                <ControlButton
                  className={`dg-laser-toggle${laserOn ? ' dg-laser-toggle-on' : ''}`}
                  title={`${laserOn ? 'Laser pointer off' : 'Laser pointer'}${keyHint('laser')}`}
                  aria-label="Laser pointer"
                  aria-pressed={laserOn}
                  onClick={() => setLaserOn((v) => !v)}
                >
                  ◉
                </ControlButton>
                {/* Gated on the drill root for the same reason the layer is: drilled in,
              every stroke is hidden, so a switch that flips an invisible layer is
              a control with nothing to show for it. */}
                {strokes.length > 0 && drillRoot === undefined && (
                  <ControlButton
                    className={`dg-drawings-toggle${drawingsVisible ? '' : ' dg-drawings-toggle-off'}`}
                    title={`${drawingsVisible ? 'Hide drawings' : 'Show drawings'}${keyHint('drawings')}`}
                    aria-label={drawingsVisible ? 'Hide drawings' : 'Show drawings'}
                    aria-pressed={drawingsVisible}
                    onClick={() => setDrawingsVisible((v) => !v)}
                  >
                    ✎
                  </ControlButton>
                )}
                {legendRowList.length > 0 && (
                  <ControlButton
                    className={`dg-legend-toggle-btn${showLegend ? '' : ' dg-legend-toggle-btn-off'}`}
                    title={`${showLegend ? 'Hide legend' : 'Show legend'}${keyHint('legend')}`}
                    aria-label={showLegend ? 'Hide legend' : 'Show legend'}
                    aria-pressed={showLegend}
                    onClick={() => setShowLegend((v) => !v)}
                  >
                    ▤
                  </ControlButton>
                )}
                {cld && (
                  <ControlButton
                    className={`dg-loop-toggle${showLoops ? '' : ' dg-loop-toggle-off'}`}
                    title={`${showLoops ? 'Hide loop badges' : 'Show loop badges'}${keyHint('loops')}`}
                    aria-label={showLoops ? 'Hide loop badges' : 'Show loop badges'}
                    aria-pressed={showLoops}
                    onClick={() => {
                      // hiding removes the badges you'd click to un-highlight, so drop
                      // any active loop highlight on the way out
                      if (showLoops) loopHighlight.clear();
                      setShowLoops((v) => !v);
                    }}
                  >
                    ↻
                  </ControlButton>
                )}
                {/* Last in the cluster: it is the host's switch, not a property of the drawing. */}
                {props.onToggleTheme !== undefined && (
                  <ControlButton
                    className="dg-theme-toggle"
                    title={props.colorMode === 'dark' ? 'Light theme' : 'Dark theme'}
                    aria-label={props.colorMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                    onClick={props.onToggleTheme}
                  >
                    {props.colorMode === 'dark' ? '☀' : '☾'}
                  </ControlButton>
                )}
              </Controls>
            )}
            {showLoops && loopEdges !== null && placedGeometry !== null && (
              <LoopLabelLayer edges={loopEdges} rough={preset.rough} nodeFilter={editing ? null : selectedNode} />
            )}
            {profile.canvasOverlay === 'git-lanes' && placedGeometry !== null && (
              <GitLanesOverlay model={props.model} plane={props.plane} />
            )}
            {profile.canvasOverlay === 'order-bands' && placedGeometry !== null && (
              <OrderBandsOverlay model={props.model} direction={flowDirection} />
            )}
            {profile.canvasOverlay === 'time-axis' && placedGeometry !== null && (
              <TimeAxisOverlay model={props.model} plane={props.plane} today={props.today} />
            )}
          </ReactFlow>
        </div>
      </NoteStateContext.Provider>
    </LoopHighlightContext.Provider>
  );
}

export function DiagramView(props: DiagramViewProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
