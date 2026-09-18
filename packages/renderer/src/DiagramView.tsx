import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
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
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  compileView,
  countAnchored,
  DEFAULT_STROKE_WIDTH,
  GIT_STAGE_TYPE,
  layoutPlaneKey,
  type DiagramNode,
  type EdgeLabelPlacement,
  type EdgeLabelSide,
  type Stroke,
  type ViewNode,
} from '@diagramming/core';
import { createIconRegistry } from '@diagramming/icons';
import { ACTIVITY_CHROME_TYPES, FORCED_SIZE_SHAPES } from './box-size';
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
import { strokesBounds } from './drawings';
import { DrawingsLayer } from './DrawingsLayer';
import { withoutMeasuredExpansion } from './expand-parent';
import { savedPositions } from './fit-containers';
import { reconnectPin } from './floating';
import { GitLanesOverlay } from './GitLanesOverlay';
import { alignBoxes, distributeBoxes, dropDescendants, type Delta } from './arrange';
import type { Box } from './box';
import { GUIDE_THRESHOLD_PX, snapDragFrame, type Guide, type SnapMemo } from './guides';
import { GuidesLayer } from './GuidesLayer';
import { SelectionToolbar } from './SelectionToolbar';
import { Legend } from './Legend';
import { LoopLabelLayer } from './LoopLabelLayer';
import { LoopHighlightContext } from './loop-highlight';
import { notationProfile } from './notations';
import { OrderBandsOverlay } from './OrderBandsOverlay';
import { createKindRegistry, createTypeRegistry } from './registry';
import { stylePreset } from './stylePresets';
import { useCanvasGestures } from './useCanvasGestures';
import { useClickCorrelation } from './useClickCorrelation';
import { useDrillNavigation } from './useDrillNavigation';
import { useLegendState } from './useLegendState';
import { useLoopOverlay } from './useLoopOverlay';
import { NUDGE_STEP, useNudge, type Positions } from './useNudge';
import { useViewLayout } from './useViewLayout';
import { LaserLayer } from './LaserLayer';
import './styles.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';

export {
  DEFAULT_ON_NODE_META_KEYS,
  LIBRARY_ENTRY_DND_TYPE,
  type DiagramSelection,
  type DiagramViewProps,
  type DrawTool,
  type EditingApi,
  type LayoutApi,
  type PenSettings,
} from './view-types';
import {
  DEFAULT_ON_NODE_META_KEYS,
  LIBRARY_ENTRY_DND_TYPE,
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
  document.elementFromPoint(e.clientX, e.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') ??
  undefined;

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
  const visibleRef = useRef<string[]>([]);
  // Which end a reconnect drag grabbed ('source'/'target'), captured on start so
  // onReconnect can tell a same-node side change from a move to another node.
  const reconnectEndRef = useRef<'source' | 'target' | null>(null);
  // The sole-relation id of the edge currently showing endpoint pin dots. Keyed
  // by the stable *relation* id, not the view-edge id (which changes whenever a
  // pin toggles — pins are baked into the aggregation key), so the dots survive
  // pin/unpin instead of vanishing with the old id.
  const [pinEdgeRel, setPinEdgeRel] = useState<string | null>(null);
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
    // plane-switch branch, it never depends on its identity
    onPlaneSwitch: () => setLabelEdit(null),
    isAlwaysExpanded,
  });
  const { enteredPath, drillRoot, focus, enterNode, exitTo, pendingRootFitRef } = nav;

  const editing = props.mode === 'edit';

  // Open a node's name for a host-driven rename that did not originate from a
  // canvas gesture (a panel button creating a node "outside" the canvas, e.g.
  // second-order's "And then what?"). Mirrors onCreateAt's own in-place rename.
  const labelRequest = edit?.editLabelRequest;
  // The last nonce this effect actually acted on. Needed because `edit` — and
  // the request riding on it — disappears while merely viewing (mode toggles
  // off), so `labelRequest?.nonce` itself goes nonce -> undefined -> the SAME
  // nonce on the way back into edit mode. "the nonce changed" would then be
  // true again on re-entry with no new user action, replaying a stale (maybe
  // deleted, maybe no-longer-selected) rename. The ref is deliberately left
  // untouched while the request is absent (view mode) — only a genuinely new
  // nonce, seen while editing, is allowed to open the box.
  const consumedLabelNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!editing || labelRequest === undefined || labelRequest.nonce === consumedLabelNonceRef.current) return;
    consumedLabelNonceRef.current = labelRequest.nonce;
    setLabelEdit({ kind: 'node', id: labelRequest.id });
    // keyed on the nonce alone: the id may repeat, the request may not
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelRequest?.nonce]);

  const nameOf = useMemo(
    () => new Map(props.model.nodes.map((n) => [n.id, n.name])),
    [props.model],
  );

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

  const compiled = useMemo(
    () =>
      compileView(props.model, {
        // drilled → `root` drives visibility; otherwise `focus` (pins + the plane
        // sheet-flip). Identical for view and edit — only affordances differ.
        focus: drillRoot !== undefined ? undefined : focus,
        pins: effectivePins,
        activeLayers: props.activeLayers,
        ...(props.plane !== undefined ? { plane: props.plane } : {}),
        ...(drillRoot !== undefined ? { root: drillRoot } : {}),
      }),
    [props.model, props.plane, focus, drillRoot, effectivePins, props.activeLayers],
  );
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
  const [viewPositions, setViewPositions] = useState<Record<string, { x: number; y: number }>>({});
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
    for (const [relationId, labels] of Object.entries(viewLabelMoves)) merged[relationId] = { ...merged[relationId], ...labels };
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
    onMultiSelectRef.current?.(ids);
  }, []);
  // Alignment guides drawn while a single node is dragged (see snapDragChanges);
  // cleared every frame that yields no lines, which includes drop (the final
  // frame carries dragging: false).
  const [guides, setGuides] = useState<Guide[]>([]);
  const snapMemoRef = useRef<SnapMemo | null>(null);
  // A drag is in flight. While one is, NO node glides (see `.dg-dragging` in
  // styles.css): the dragged node's container grows and its siblings are
  // re-expressed every frame, and a 200ms transition on those would leave the
  // box trailing the child it is supposed to hold — and React Flow measuring a
  // half-grown box, which it then grows from.
  const [dragging, setDragging] = useState(false);
  // The same fact, readable inside onNodesChange in the very task the gesture
  // starts in (the state above lands a render later).
  const draggingRef = useRef(false);

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
  const { geometryRef, routes, placedGeometry, arrangedGeometry, containerShifts, routing, laidAt, labelSpots, flowDirection } = viewLayout;

  // Where each open container's origin sits BEFORE the fit pass shifted it, in
  // absolute flow coordinates — the frame a child's saved position is relative
  // to (see fit-containers.ts). Summed root-first, the same order commitMoves
  // sums the on-screen chain, so with no shift the two are the same float and
  // a saved position is exactly the on-screen one.
  const containerBases = useMemo(() => {
    const bases = new Map<string, { x: number; y: number }>();
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

  // A drill (enter/exit) swaps the whole scene, so once it re-layouts, glide to
  // fit the new isolated view.
  useEffect(() => {
    if (!pendingRootFitRef.current || arrangedGeometry === null) return;
    pendingRootFitRef.current = false;
    void reactFlow.fitView({ padding: 0.15, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingRootFitRef is a stable useRef identity (owned by useDrillNavigation) read through .current
  }, [compiled, arrangedGeometry, reactFlow]);

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
  const nodeColors = useMemo(() => profile.node?.colorOf?.(props.model, props.plane), [profile, props.model, props.plane]);
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
      ...(props.model.typeColors !== undefined ? { typeColors: props.model.typeColors } : {}),
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
      stylePreset: preset.rough !== undefined ? preset : undefined,
      notation: props.notation,
      ...(nodeColors !== undefined ? { nodeColors } : {}),
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
      preset,
      props.notation,
      nodeColors,
    ],
  );

  const derivedNodes = useMemo((): Node[] => {
    if (arrangedGeometry === null) return [];
    const out: Node[] = [];
    const walk = (n: ViewNode, parent?: string) => {
      const geo = arrangedGeometry.get(n.id);
      if (geo === undefined) return;
      const data = buildNodeDataCached(n, nodeDataCtx);
      out.push(
        toRfNode({
          id: n.id,
          position: { x: geo.x, y: geo.y },
          data,
          ...(parent !== undefined ? { parentId: parent } : {}),
          // Membership is edited in the node panel, not by dragging away, so a
          // child never leaves its box — the box gives way instead, live while
          // dragging (React Flow's expandParent) and for good once dropped (the
          // fit pass in useViewLayout). Both modes: an Alt-drag in view mode
          // used to carry the child straight out through the wall. A notation
          // that owns the arrangement sizes its own rows, so there the old
          // edit-mode clamp stays.
          ...(parent === undefined
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
                // leaves above. Ordinary boxes and CLD text chips must NOT go
                // through this branch — forcing sizes there would change their
                // existing CSS-driven sizing.
                n.state === 'leaf' &&
                  n.node.type !== undefined &&
                  (FORCED_SIZE_SHAPES.has(typeRegistry.resolve(n.node.type).shape) ||
                    ACTIVITY_CHROME_TYPES.has(n.node.type))
                ? { style: { width: geo.width, height: geo.height } }
                : // An ordinary box keeps its CSS sizing, but never narrower than
                  // the box elk laid out (box-size.ts estimates it): routes and
                  // gaps are computed against that box, so a narrower drawn one
                  // leaves an orthogonal arrow starting in mid-air beside it.
                  // A FLOOR, not a width — a label the estimate undershot still
                  // grows the box rather than wrapping inside it. Only where
                  // elk placed the node from such an estimate: a notation's own
                  // layout spaces its boxes off LEAF_SIZE, and a CLD chip is
                  // deliberately free of the box minimum.
                  profile.layout === undefined && !(profile.node?.typelessAsText === true && n.node.type === undefined)
                  ? { style: { minWidth: geo.width } }
                  : {}),
        }),
      );
      n.children.forEach((c) => walk(c, n.id));
    };
    compiled.roots.forEach((r) => walk(r));
    return out;
  }, [compiled, arrangedGeometry, nodeDataCtx, editing, typeRegistry, profile]);

  // React Flow owns a copy of the nodes and we apply its changes (drag positions,
  // measured dimensions, selection) with applyNodeChanges — the v12-recommended
  // shape. Fully controlled nodes (the previous design) re-created every node
  // object per drag frame, re-rendering all nodes and flickering under drag.
  // useLayoutEffect so a derived-node change never paints a stale frame first.
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const rfNodesRef = useRef<Node[]>([]);
  rfNodesRef.current = rfNodes;
  // Every way a box can move — a drag, a multi-node drag, an arrow-key nudge,
  // an align/distribute — ends here, so the two modes' persistence paths are
  // decided in exactly one place: edit mode hands the batch to the host (one
  // undo step), view mode keeps it as throwaway drag state the host may offer
  // to save (onViewPositionsChange → the studio's Save positions chip).
  //
  // `onScreen` is what React Flow holds (parent-relative, against the parent's
  // origin as drawn). What gets saved is relative to the parent's UNSHIFTED
  // origin — they differ once a container has grown left/up around a child
  // (fit-containers.ts), or is doing so right now under expandParent.
  const commitMoves = useCallback(
    (onScreen: Positions) => {
      if (Object.keys(onScreen).length === 0) return;
      const typeOf = (id: string) => (rfNodesRef.current.find((n) => n.id === id)?.data as { typeId?: string } | undefined)?.typeId;
      const positions = savedPositions(
        onScreen,
        rfNodesRef.current,
        containerBasesRef.current,
        containerShiftsRef.current,
        // an activity lane is banded at a fixed spot (arrangeActivityFrames)
        (parentId) => typeOf(parentId) === 'activity-lane' || typeOf(parentId) === 'activity-frame',
      );
      if (editing) {
        if (edit?.onNodesMoved !== undefined) edit.onNodesMoved(positions);
        else for (const [id, pos] of Object.entries(positions)) edit?.onNodeMoved?.(id, pos);
      } else {
        setViewPositions((p) => ({ ...p, ...positions }));
      }
    },
    [editing, edit],
  );
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
  const selectedIds = useMemo(() => rfNodes.filter((n) => n.selected === true).map((n) => n.id), [rfNodes]);
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
    setRfNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected === true).map((n) => n.id));
      // A nudge not yet committed must not be undone by a resync in its idle
      // window: keep the pending position, exactly as the selection is kept.
      const pending = nudge.pendingRef.current;
      if (selected.size === 0 && Object.keys(pending).length === 0) return derivedNodes;
      return derivedNodes.map((n) => {
        const p = pending[n.id];
        const s = selected.has(n.id);
        if (!s && p === undefined) return n;
        return { ...n, ...(s ? { selected: true } : {}), ...(p !== undefined ? { position: p } : {}) };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nudge.pendingRef is a stable useRef identity read through .current
  }, [derivedNodes]);

  // Populate the host's imperative layout ref (auto-layout toggle). Functions
  // read refs so the api object stays stable while always returning current data.
  useEffect(() => {
    const ref = props.layoutApiRef;
    if (ref === undefined) return;
    ref.current = {
      // External stubs (compiled.externals) are placeholders for an off-frame
      // node while drilled — not real nodes in the model — so writing their
      // `__ext__:` ids into the layout overlay would corrupt it for every
      // other view of the same plane. Drop them from the snapshot.
      snapshotPositions: () =>
        Object.fromEntries(
          rfNodesRef.current
            .filter((n) => !(compiledRef.current.externals?.has(n.id) ?? false))
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
      pinEdgeRel,
      pendingAdd: addLabelAt,
      onPendingAddConsumed: () => setAddLabelAt(null),
      stylePreset: preset.rough !== undefined ? preset : undefined,
      notation: props.notation,
      ...(routing !== undefined ? { routing } : {}),
      routes,
      laidAt,
      labelSpots,
      ...(labelMoves !== undefined ? { labelMoves } : {}),
      // Movable only where the move can go somewhere: a host that listens for
      // it (the studio's Save positions chip). The published page and the PNG
      // export pass no listener, so their labels stay put.
      ...(!editing && props.onViewLabelMovesChange !== undefined ? { onViewMoveEdgeLabel: moveViewLabel } : {}),
      ...(edgeColors !== undefined ? { edgeColors } : {}),
    }),
    [
      kindRegistry,
      editing,
      edit?.onAddEdgeLabel,
      edit?.onEditEdgeLabel,
      edit?.onMoveEdgeLabel,
      edit?.onSetEdgeSide,
      pinEdgeRel,
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
      const soleRelation = e.constituents.length === 1 ? e.constituents[0] : undefined;
      return toRfEdge({
        id: e.id,
        source: e.from,
        target: e.to,
        data,
        reconnectable: editing && soleRelation !== undefined,
      });
    });
  }, [compiled, placedGeometry, edgeDataCtx, editing]);

  const loops = useLoopOverlay({
    profile,
    compiled,
    externalHighlight: props.externalHighlight,
    onCldEdges: props.onCldEdges,
  });
  const { cld, loopEdges, showLoops, setShowLoops, selectedNode, setSelectedNode, focusConnected, setFocusConnected, loopHighlight } = loops;

  return (
    <LoopHighlightContext.Provider value={loopHighlight}>
    <div
      ref={wrapperRef}
      className={`dg-canvas${props.chrome === false ? ' dg-no-chrome' : ''}${editing ? ' dg-mode-edit' : ''}${!editing && altHeld ? ' dg-alt-move' : ''}${dragging ? ' dg-dragging' : ''}${
        preset.id !== 'clean' ? ` dg-style-${preset.id}` : ''
      }${preset.rough !== undefined ? ' dg-style-rough' : ''}${preset.fontFamily !== undefined ? ' dg-style-font' : ''}${
        profile.className !== undefined ? ' ' + profile.className : ''
      }${penActive ? ' dg-tool-pen' : ''}${eraserActive ? ' dg-tool-eraser' : ''}${laserOn ? ' dg-tool-laser' : ''}`}
      style={
        {
          width: '100%',
          height: '100%',
          ...(preset.fontFamily !== undefined ? { '--dg-style-font': preset.fontFamily } : {}),
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
          const targetNodeId = droppedOnNodeId(e);
          edit?.onDropLibraryEntry?.(entryId, reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }), targetNodeId);
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
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={props.colorMode ?? 'light'}
        connectionMode={ConnectionMode.Loose}
        onNodeClick={(e, node) => {
          setPinEdgeRel(null);
          corr.clearEdgeClick(); // a node click breaks any pending edge-add correlation
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
          if (editing) setLabelEdit({ kind: 'node', id: node.id });
        }}
        onReconnectStart={(_e, _edge, handleType) => {
          reconnectEndRef.current = handleType;
        }}
        onReconnect={(oldEdge, conn) => {
          if (!editing || conn.source === null || conn.target === null) return;
          const viewEdge = compiled.edges.find((x) => x.id === oldEdge.id);
          const relation = viewEdge?.constituents.length === 1 ? viewEdge.constituents[0] : undefined;
          if (relation === undefined) return;
          const endPin = reconnectPin(reconnectEndRef.current, { source: conn.source, target: conn.target, sourceHandle: conn.sourceHandle, targetHandle: conn.targetHandle }, relation);
          edit?.onReconnect?.(relation.id, conn.source, conn.target, endPin);
        }}
        onReconnectEnd={() => {
          reconnectEndRef.current = null;
        }}
        // 'remove' stays out: element existence belongs to the model. The
        // delete key reaches the host through onDelete below instead — letting
        // React Flow remove locally would only ghost-delete until the next
        // model rebuild resurrected the elements.
        //
        // Guides: a single dragged node snaps to its siblings' edges and
        // centres (see snapDragChanges). Grid snapping already happened inside
        // React Flow's drag handler, so a guide in reach beats the grid.
        onNodesChange={(changes: NodeChange[]) => {
          const snapped = snapDragFrame(
            changes,
            { nodes: rfNodesRef.current, absoluteOf: (id) => reactFlow.getInternalNode(id)?.internals.positionAbsolute },
            GUIDE_THRESHOLD_PX / reactFlow.getZoom(),
            snapMemoRef,
          );
          setGuides((g) => (g.length === 0 && snapped.lines.length === 0 ? g : snapped.lines));
          // 'remove' stays out (see above); so does an expandParent expansion
          // that was not asked for by a drag (see expand-parent.ts).
          const kept = withoutMeasuredExpansion(snapped.changes, draggingRef.current).filter((c) => c.type !== 'remove');
          // Advanced in step with the state, not left to the next render: a
          // gesture's last change and onNodeDragStop arrive in the same task,
          // and the commit below reads the final on-screen positions from here.
          rfNodesRef.current = applyNodeChanges(kept, rfNodesRef.current);
          setRfNodes((nds) => applyNodeChanges(kept, nds));
        }}
        // A pointer drag must not race a pending keyboard burst.
        onNodeDragStart={() => {
          nudge.flush();
          draggingRef.current = true;
          setDragging(true);
        }}
        // React Flow hands over every node the gesture moved (a selection drags
        // as one), so a multi-node drag lands as a single batch.
        //
        // Positions come from OUR node copy, not from the event: for a child
        // with expandParent the event carries XYDrag's raw position, which is
        // neither clamped to the (moving) parent nor guide-snapped.
        onNodeDragStop={(_e, _node, nodes) => {
          draggingRef.current = false;
          setDragging(false);
          const now = new Map(rfNodesRef.current.map((n) => [n.id, n.position] as const));
          commitMoves(Object.fromEntries(nodes.map((n) => [n.id, now.get(n.id) ?? n.position])));
        }}
        onConnect={(conn) => {
          if (conn.source !== null && conn.target !== null)
            edit?.onConnect?.(conn.source, conn.target, conn.sourceHandle, conn.targetHandle);
        }}
        onEdgeClick={(e, edge) => {
          const viewEdge = compiled.edges.find((x) => x.id === edge.id);
          // pin dots follow the sole relation (edit mode, single-relation edges)
          const soleRel = viewEdge?.constituents.length === 1 ? viewEdge.constituents[0]?.id : undefined;
          setPinEdgeRel(editing && soleRel !== undefined ? soleRel : null);
          setSelectedNode(null);
          corr.clearNodeClick(); // an edge click breaks any pending node double-click
          props.onSelect?.({
            kind: 'edge',
            id: edge.id,
            ...(viewEdge !== undefined ? { constituentIds: viewEdge.constituents.map((c) => c.id) } : {}),
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
            setPinEdgeRel(null);
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
          live={pen.live === null ? null : { points: pen.live, width: penSettings?.width ?? DEFAULT_STROKE_WIDTH, ...(penSettings?.color !== undefined ? { color: penSettings.color } : {}) }}
          visible={drawingsVisible && drillRoot === undefined}
          erasing={eraserActive}
          onErase={(id) => edit?.onDeleteStroke?.(id)}
        />
        <LaserLayer trails={laser.trails} live={laser.live} />
        <GuidesLayer lines={guides} />
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
              {...(legendConfig?.title !== undefined ? { title: legendConfig.title } : {})}
              interactive={props.chrome !== false}
              {...(props.onToggleLayer !== undefined ? { onToggleLayer: props.onToggleLayer } : {})}
              // Same derivation as `interactive` above: Legend decides "is this
              // row a button" from the handler alone, so a chrome-less host (the
              // PNG export) must get no handler — or the export would carry a
              // focusable control nothing can press.
              {...(props.chrome !== false ? { onToggleDrawings: () => setDrawingsVisible((v) => !v) } : {})}
              icons={icons}
              onMeasure={setLegendSize}
            />
          </Panel>
        )}
        {props.chrome !== false && (
        <Controls>
          <ControlButton
            className={`dg-focus-toggle${focusConnected ? '' : ' dg-focus-toggle-off'}`}
            title={focusConnected ? 'Stop dimming unconnected on select' : 'Dim unconnected on select'}
            aria-label={focusConnected ? 'Stop dimming unconnected on select' : 'Dim unconnected on select'}
            aria-pressed={focusConnected}
            onClick={() => setFocusConnected((v) => !v)}
          >
            ◎
          </ControlButton>
          <ControlButton
            className={`dg-laser-toggle${laserOn ? ' dg-laser-toggle-on' : ''}`}
            title={laserOn ? 'Laser pointer off (L)' : 'Laser pointer (L)'}
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
              title={drawingsVisible ? 'Hide drawings' : 'Show drawings'}
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
              title={showLegend ? 'Hide legend' : 'Show legend'}
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
              title={showLoops ? 'Hide loop badges' : 'Show loop badges'}
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
        </Controls>
        )}
        {showLoops && loopEdges !== null && placedGeometry !== null && (
          <LoopLabelLayer
            edges={loopEdges}
            {...(preset.rough !== undefined ? { rough: preset.rough } : {})}
            nodeFilter={editing ? null : selectedNode}
          />
        )}
        {profile.overlay === 'git-lanes' && placedGeometry !== null && (
          <GitLanesOverlay model={props.model} plane={props.plane} />
        )}
        {profile.overlay === 'order-bands' && placedGeometry !== null && (
          <OrderBandsOverlay model={props.model} direction={flowDirection} />
        )}
      </ReactFlow>
    </div>
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
