import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
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
  buildHierarchy,
  compileView,
  countAnchored,
  DEFAULT_IMAGE_NODE_SIZE,
  DEFAULT_STROKE_WIDTH,
  layoutPlaneKey,
  runsToPlainText,
  type Column,
  type DiagramModel,
  type DiagramNode,
  type Drawings,
  type EdgeLabelSide,
  type LayoutOverlay,
  type NotationId,
  type Stroke,
  type TextRun,
  type ViewNode,
} from '@diagramming/core';
import { createIconRegistry, type IconRegistry } from '@diagramming/icons';
import { arrangeActivityFrames } from './activity-frame';
import { Breadcrumbs } from './Breadcrumbs';
import { buildEdgeDataCached, buildNodeDataCached, type EdgeDataContext, type NodeDataContext } from './build-data';
import { edgeTypes, nodeTypes, toRfEdge, toRfNode } from './adapter';
import { strokesBounds } from './drawings';
import { DrawingsLayer } from './DrawingsLayer';
import { drillChain, truncatePath } from './drill';
import { reconnectPin, type Side } from './floating';
import { focusForVisible } from './focus';
import { GitLanesOverlay } from './GitLanesOverlay';
import { estimateLabelSize } from './label-size';
import { layoutView, type EdgePoint, type NodeGeometry } from './layout';
import { Legend } from './Legend';
import { legendRows } from './legend';
import { tableSize } from './table-ports';
import { LoopLabelLayer } from './LoopLabelLayer';
import { combinePolarities, type LoopEdgeInput } from './loops';
import { EMPTY_ID_SET, LoopHighlightContext, type LoopHighlight } from './loop-highlight';
import { notationProfile } from './notations';
import { overlayPositions } from './placement';
import { createKindRegistry, createTypeRegistry, type KindStyle, type Registry, type TypeStyle } from './registry';
import { stylePreset } from './stylePresets';
import { useClickCorrelation } from './useClickCorrelation';
import { usePen, type PenHandlers } from './usePen';
import { useLaser } from './useLaser';
import { LaserLayer } from './LaserLayer';
import './styles.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';

export interface DiagramSelection {
  kind: 'node' | 'edge';
  id: string;
  constituentIds?: string[];
}

/** the studio's canvas tool; absent = select (the only tool in view mode) */
export type DrawTool = 'select' | 'pen' | 'eraser';
export interface PenSettings {
  /** absent → the theme's ink token */
  color?: string;
  width: number;
}

/** dataTransfer MIME type carrying a library entry id when one is dragged from
 * a palette onto the canvas (the drop places that entry at the drop point). */
export const LIBRARY_ENTRY_DND_TYPE = 'application/x-dg-library-entry';

/** Imperative accessors the host reads to freeze/auto-place layout (the
 * auto-layout toggle). Populated only in edit mode via `layoutApiRef`. */
export interface LayoutApi {
  /** current on-screen positions (elk output with pins applied), parent-relative */
  snapshotPositions: () => Record<string, { x: number; y: number }>;
  /** raw elk positions ignoring pins, parent-relative (a fresh auto arrangement) */
  autoPositions: () => Record<string, { x: number; y: number }>;
  /** viewport center in flow coordinates, or undefined if the canvas isn't mounted */
  viewportCenter: () => { x: number; y: number } | undefined;
  /** bounding box of the content — every rendered node UNION the active plane's
   * drawings — in flow coordinates, or undefined when nothing is laid out yet
   * and nothing is drawn. Used to size an export snapshot to the real content. */
  contentBounds: () => { x: number; y: number; width: number; height: number } | undefined;
  /** fit that content box (nodes ∪ drawings) into the current viewport (re-run
   * after the frame is resized).
   * A per-side padding object reserves space for an overlay such as the legend. */
  fitView: (padding?: number | { top?: number; right?: number; bottom?: number; left?: number }) => void;
  /** px reserved by the legend overlay on its own edge, or null when none is
   * shown — the export handshake grows the capture frame by this. */
  legendReserve: () => { side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null;
}

export interface DiagramViewProps {
  model: DiagramModel;
  /** active plane id (models with planes); absent = the model's first plane */
  plane?: string;
  activeLayers?: string[];
  /** a legend layer row was clicked — toggle that layer's visibility */
  onToggleLayer?: (id: string) => void;
  pins?: Record<string, 'expanded' | 'collapsed'>;
  onTogglePin?: (id: string) => void;
  /** binary expand/collapse for a CLD group's disclosure toggle */
  onToggleExpand?: (id: string) => void;
  onSelect?: (sel: DiagramSelection | null) => void;
  /** view mode: a node was ctrl/cmd-clicked — the host may treat it as a second
   * variable to compare (e.g. CLD dependency). Bypasses selection + drill. */
  onCompareSelect?: (id: string) => void;
  typeRegistry?: Registry<TypeStyle>;
  kindRegistry?: Registry<KindStyle>;
  icons?: IconRegistry;
  colorMode?: 'light' | 'dark';
  /** metadata keys whose values show as badges on the node itself */
  onNodeMetaKeys?: string[];
  /** 'edit' unlocks drag/connect affordances; uses the same semantic-zoom LOD as view (one level at a time); default 'view' */
  mode?: 'view' | 'edit';
  /** overlay positions (applied in both modes) that override elk x/y for matching nodes */
  layout?: LayoutOverlay;
  /** the freehand-drawings sidecar; strokes of the active plane are drawn above
   * the nodes at the top level only (a drilled view has its own coordinates) */
  drawings?: Drawings;
  /** edit mode: the active canvas tool. `pen` captures pointer gestures as
   * strokes; `eraser` makes strokes clickable; anything else is the usual canvas. */
  tool?: DrawTool;
  /** edit mode: what the pen draws with */
  pen?: PenSettings;
  /** edit-mode callbacks, grouped as one object so the view/edit split is
   * structural: a read-only host passes no `edit`; an editing host assembles
   * one. `mode="edit"` gates the canvas affordances (drag/connect); the
   * callbacks here drive what the host persists when those fire. */
  edit?: EditingApi;
  /** the host reads current positions & viewport center through this ref to
   * freeze the layout (auto-layout toggle) and place new nodes when manual —
   * and the read-only viewer uses it for the export handshake (contentBounds/
   * fitView), so it deliberately lives OUTSIDE `edit`. */
  layoutApiRef?: MutableRefObject<LayoutApi | null>;
  /** CLD only: the compiled signed loop-graph (the exact edge ids the canvas
   * draws), surfaced so the host can run leverage analysis against this view. */
  onCldEdges?: (edges: LoopEdgeInput[]) => void;
  /** view mode: the ephemeral drag positions for the active plane changed
   * (parent-relative, keyed by node id — the layout overlay's own shape). The
   * host may persist them to the layout sidecar, which is safe even for a
   * read-only TS-authored diagram because coordinates were never part of the
   * model. The renderer keeps treating them as throwaway state, so a host that
   * ignores this prop behaves exactly as before. Reports `{}` when the drags are
   * dropped (plane switch, model reload, edit-mode toggle). */
  onViewPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  /** view mode: lay the active plane out automatically even where the overlay
   * saved a position, handing hand-placed nodes back to the layout algorithm.
   * Without it saved coordinates beat every algorithm, so a diagram that has
   * been positioned by hand stops responding to the picker. Affects positions
   * only — overlay `sizes` still apply, since no algorithm computes those — and
   * changes nothing on disk. */
  ignoreSavedPositions?: boolean;
  /** host-driven highlight (e.g. a leverage-panel selection): glow these nodes
   * and view-edges, dim the rest. Takes precedence over the loop-badge highlight. */
  externalHighlight?: { nodes: readonly string[]; edges: readonly string[] } | null;
  /** host notification: the drill trail changed (root→current; `[]` at the
   *  bird's-eye). Lets the host parent new nodes to the level being edited. */
  onEnteredPathChange?: (path: string[]) => void;
  /** host-driven drill trail (deep links / Back / Forward): when the prop's
   * reference changes and its contents differ from the current trail, the view
   * syncs to it — pruned at the first id missing from the model — and re-fits.
   * Gestures still navigate internally and report via onEnteredPathChange, so
   * hosts may echo the reported path back without loops. Omit for the
   * self-contained behavior. */
  enteredPath?: string[];
  /** URL prefix image-node asset refs resolve against (e.g. '/api/assets/') */
  assetBase?: string;
  /** false hides the interactive control cluster. The PNG export sets it so a
   * committed image is the diagram alone, with no zoom widget baked into it. */
  chrome?: boolean;
  /** visual style preset id (see stylePresets.ts); unknown/absent = clean */
  styleId?: string;
  /** visual language; overrides registries + chrome. props.typeRegistry/kindRegistry still win wholesale. */
  notation?: NotationId;
}

/** Edit-mode callbacks an editing host (apps/studio) wires to its command
 * pipeline. Grouped as one optional object on DiagramViewProps so a read-only
 * host (apps/viewer) can simply omit it; every callback is optional so the
 * host can opt into just the affordances it wants. */
export interface EditingApi {
  /** edit mode: a node was shift-clicked — add/remove it from a pending
   *  multi-selection (e.g. to group variables). Bypasses primary selection. */
  onGroupToggle?: (id: string) => void;
  /** a connect gesture completed between two nodes. New relations float by
   * default (no pinned sides) — the caller pins later via onSetEdgeSide/reconnect. */
  onConnect?: (from: string, to: string, sourceHandle?: string | null, targetHandle?: string | null) => void;
  /** a node drag ended; pos is parent-relative */
  onNodeMoved?: (id: string, pos: { x: number; y: number }) => void;
  /** an in-place rename (double-click on a node) was committed */
  onRenameNode?: (id: string, name: string) => void;
  /** an in-place rich-text edit (double-click on a box label) was committed */
  onSetNodeRich?: (id: string, runs: TextRun[]) => void;
  /** sole-relation edges: a new positioned label was placed by
   * double-clicking the edge at `t` (0..1 along it) on `side` (top/bottom/center). */
  onAddEdgeLabel?: (relationId: string, text: string, t: number, side: EdgeLabelSide) => void;
  /** sole-relation edges: a label's text was committed (double-click a
   * label). Empty text signals the host to remove the label. */
  onEditEdgeLabel?: (relationId: string, labelId: string, text: string) => void;
  /** sole-relation edges: a label was dragged to a new `t`/`side`. */
  onMoveEdgeLabel?: (relationId: string, labelId: string, t: number, side: EdgeLabelSide) => void;
  /** an edge endpoint was dragged. `endPin` (when present) tells the caller
   * how the *dragged* end's pin changed — dropped on a new node re-floats it
   * (side: null); re-dropped on the same node pins it to that side. The other
   * end is left untouched. */
  onReconnect?: (
    relationId: string,
    from: string,
    to: string,
    endPin?: { end: 'from' | 'to'; side: Side | null },
  ) => void;
  /** a pin dot on a sole-relation edge toggled an endpoint — freeze it at
   * `side`, or re-float it with `side: null`. */
  onSetEdgeSide?: (relationId: string, end: 'from' | 'to', side: Side | null) => void;
  /** a db-table node's columns were added/edited/removed/reordered in
   * place — commit the full replacement columns array. */
  onSetTableColumns?: (id: string, columns: Column[]) => void;
  /** an image node was resized (dimensions belong in the layout overlay);
   * pos is the node's post-resize parent-relative position — resizing from a
   * top or left handle shifts the origin, same space as onNodeMoved's pos */
  onResize?: (id: string, w: number, h: number, pos: { x: number; y: number }) => void;
  /** image files arrived via drop or paste; position is in flow
   * coordinates (drop point, or the viewport center for paste) */
  onImageFiles?: (files: File[], position?: { x: number; y: number }) => void;
  /** a library entry (its id) was dragged from a palette and dropped on
   * the canvas; position is the drop point in flow coordinates */
  onDropLibraryEntry?: (entryId: string, position: { x: number; y: number }, targetNodeId?: string) => void;
  /** a double-click on empty canvas — create a node at this flow point.
   * May return the new node's id, which immediately opens it in canvas
   * in-place rename mode (mirrors double-clicking an existing node to rename it). */
  onCreateAt?: (pos: { x: number; y: number }) => string | void;
  /** pen tool: a stroke was drawn (rounded, simplified flow points). The host
   * assigns the id (uniqueStrokeId) and the plane, like add-node. */
  onAddStroke?: (stroke: Omit<Stroke, 'id'>) => void;
  /** eraser tool: a stroke was clicked */
  onDeleteStroke?: (id: string) => void;
}

export const DEFAULT_ON_NODE_META_KEYS = ['framework', 'language', 'tool'];

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

// Cut a drill path at the first id the model doesn't know — applying a stale
// deep link lands on the deepest surviving prefix instead of a blank canvas.
function pruneToModel(path: string[], m: DiagramModel): string[] {
  const exists = new Set(m.nodes.map((n) => n.id));
  const cut = path.findIndex((id) => !exists.has(id));
  return cut < 0 ? path : path.slice(0, cut);
}

// ---------------------------------------------------------------------------
// Render-phase navigation sync (useReducer). The view keeps a snapshot of the
// props that drive navigation (model id / model object / plane / enteredPath
// prop) and, during render, compares the current props against it to decide
// which of the four transitions applies. The reducer owns that snapshot so the
// transitions are visible as data: every branch dispatches the SAME `sync`
// action with the current props snapshot, and the reducer classifies which
// transition it was. The dispatched snapshot is never read back in the same
// render (dispatching during render re-renders), which is exactly the ref
// mutation it replaces — later branches read the stale snapshot, and only the
// next render sees the updated one.
// ---------------------------------------------------------------------------

interface SeenKey {
  modelId: string;
  model: DiagramModel;
  plane: string | undefined;
  enteredPathProp: string[] | undefined;
}

type SyncTransition = 'model-switch' | 'plane-switch' | 'model-edit' | 'entered-path' | 'none';

interface SyncState {
  seen: SeenKey;
  /** which transition the last sync action classified. Data, not behavior —
   * the render branches below still do their own comparisons; this just makes
   * the four transitions visible in one place (and lets the reducer be the
   * single authority on their precedence). */
  transition: SyncTransition;
}

type SyncAction = { type: 'sync'; next: SeenKey };

function syncReducer(prev: SyncState, action: SyncAction): SyncState {
  const seen = action.next;
  if (prev.seen.modelId !== seen.modelId) return { seen, transition: 'model-switch' };
  if (prev.seen.plane !== seen.plane) return { seen, transition: 'plane-switch' };
  if (prev.seen.model !== seen.model) return { seen, transition: 'model-edit' };
  if (prev.seen.enteredPathProp !== seen.enteredPathProp) return { seen, transition: 'entered-path' };
  return { seen, transition: 'none' };
}

const seenKeyOf = (props: DiagramViewProps): SeenKey => ({
  modelId: props.model.id,
  model: props.model,
  plane: props.plane,
  enteredPathProp: props.enteredPath,
});

/** leaf shapes with no CSS-natural size (padding/min-width zeroed): the RF
 * wrapper must get the layout's size explicitly, like image/shape leaves */
const FORCED_SIZE_SHAPES = new Set(['circle', 'diamond', 'bar', 'start-dot', 'end-bullseye']);
/** activity chrome renders width/height:100% of its wrapper — an EMPTY lane or
 * frame is compiled 'leaf' and would otherwise collapse to 0×0 */
const ACTIVITY_CHROME_TYPES = new Set(['activity-frame', 'activity-lane', 'activity-region']);

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

  // Nested zoom: `enteredPath` is the drill trail root→current (the breadcrumb);
  // its deepest node is the `drillRoot` that scopes the view in both modes.
  // (Automatic viewport-center focus is parked in ./focus.ts.)
  const [focus, setFocus] = useState<string[]>([]);
  const [enteredPath, setEnteredPath] = useState<string[]>(() =>
    props.enteredPath !== undefined ? pruneToModel(props.enteredPath, props.model) : [],
  );
  const enteredPathRef = useRef<string[]>([]);
  enteredPathRef.current = enteredPath;
  // Report the drill trail upward so the host can scope new-node placement to
  // the level currently open.
  const { onEnteredPathChange } = props;
  useEffect(() => {
    onEnteredPathChange?.(enteredPath);
  }, [enteredPath, onEnteredPathChange]);
  // A pending "fit the whole view" (exiting to the bird's-eye), applied by the
  // same post-layout glide effect that handles per-node fits.
  const pendingRootFitRef = useRef(false);
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
  // Render-phase state adjustment (sanctioned React pattern): new model resets
  // navigation; a plane switch instead maps it — the entities on screen stay
  // visible, regrouped by the new plane's ancestors (the "sheet flip"). The
  // last-seen props snapshot lives in a useReducer (see syncReducer above):
  // each branch below dispatches the SAME `sync` action with the current props,
  // and the reducer classifies the transition it was — so the four paths
  // (new model / plane switch / model edit / host-driven path) are visible as
  // data. Dispatching during render is the same sanctioned pattern the queues
  // below already rely on: the new snapshot applies on the re-render, and the
  // stale `sync.seen` read by later branches in THIS render is exactly what
  // the old mutable keyRef provided.
  const [sync, syncSeen] = useReducer(syncReducer, undefined, () => ({ seen: seenKeyOf(props), transition: 'none' as const }));
  // The drill trail as it will actually be after this render's queued
  // setEnteredPath calls — the state variable itself is stale once one of the
  // branches below has already queued a reset/prune for this same render.
  let effectivePath = enteredPath;
  if (sync.seen.modelId !== props.model.id) {
    // a different diagram loaded → full reset
    syncSeen({ type: 'sync', next: seenKeyOf(props) });
    visibleRef.current = [];
    setFocus([]);
    setEnteredPath([]);
    effectivePath = [];
  } else if (sync.seen.plane !== props.plane) {
    syncSeen({ type: 'sync', next: seenKeyOf(props) });
    // a plane switch remaps focus to keep the same entities visible; the drill
    // trail (whose ids may not exist in the new plane) resets to the bird's-eye.
    setFocus(focusForVisible(props.model, props.plane, visibleRef.current));
    setEnteredPath([]);
    effectivePath = [];
    setLabelEdit(null);
  } else if (sync.seen.model !== props.model) {
    // same diagram, new model object (an edit): KEEP the drill trail so editing
    // stays at the current level, but prune it to nodes that still exist —
    // deleting the node you're inside pops you out to the surviving prefix.
    syncSeen({ type: 'sync', next: seenKeyOf(props) });
    setEnteredPath((path) => pruneToModel(path, props.model));
    effectivePath = pruneToModel(enteredPath, props.model);
  }

  // Host-driven navigation (deep links / Back / Forward): apply a changed
  // `enteredPath` prop. Reference inequality gates the check; content equality
  // makes echoed reports (the host writing back what we just emitted) a no-op.
  if (sync.seen.enteredPathProp !== props.enteredPath) {
    syncSeen({ type: 'sync', next: seenKeyOf(props) });
    if (props.enteredPath !== undefined) {
      const next = pruneToModel(props.enteredPath, props.model);
      if (next.length !== effectivePath.length || next.some((id, i) => id !== effectivePath[i])) {
        pendingRootFitRef.current = true;
        setEnteredPath(next);
        setFocus([]);
      }
    }
  }

  const editing = props.mode === 'edit';
  // Containment index for the active plane — the source of the drill chain
  // (enterNode's drillChain).
  const viewHierarchy = useMemo(
    () => buildHierarchy(props.model, props.plane),
    [props.model, props.plane],
  );
  const nameOf = useMemo(
    () => new Map(props.model.nodes.map((n) => [n.id, n.name])),
    [props.model],
  );

  // The drill root (deepest entered node) scopes the view to that node's interior
  // — an isolated "the node is the canvas" view — in BOTH modes.
  const drillRoot = enteredPath.length > 0 ? enteredPath[enteredPath.length - 1] : undefined;

  // Both tools are inert while drilled: drawings live at the top level only (the
  // layer below is hidden whenever drillRoot is set), so a gesture inside a
  // drilled view would append strokes to the top-level bucket that the person
  // drawing cannot see — and an eraser would delete ink they are not looking at.
  // The laser pointer is viewer state like drawingsVisible: never saved, reset
  // per diagram, and available in BOTH modes and while drilled — it is a light
  // on the screen, not ink in the sidecar, so the drawings gating below does not
  // apply. While it is on it owns the drag, so the studio's pen and eraser stand
  // down (their toolbar buttons stay pressed; switching the laser off hands the
  // gesture straight back).
  const [laserOn, setLaserOn] = useState(false);
  const penActive = editing && props.tool === 'pen' && drillRoot === undefined && !laserOn;
  const eraserActive = editing && props.tool === 'eraser' && drillRoot === undefined && !laserOn;
  /** pen or laser: a primary-button drag is captured, so React Flow must not pan/drag/select */
  const gestureCaptured = penActive || laserOn;
  // The active plane's strokes. Keyed like layout.planes, so a borrowing plane
  // shares its donor's bucket exactly as it shares positions.
  const strokes = useMemo(
    () => props.drawings?.planes[layoutPlaneKey(props.model, props.plane)] ?? [],
    [props.drawings, props.model, props.plane],
  );
  // Render-phase ref (same pattern as enteredPathRef): the layoutApiRef effect
  // below keeps deps of just [layoutApiRef, reactFlow], so it reads the ink
  // through a ref rather than re-installing the api object on every stroke.
  const strokesRef = useRef<readonly Stroke[]>([]);
  strokesRef.current = strokes;
  // Tracing-paper switch: viewer state, on by default (an author drew it to be
  // seen), reset per diagram like pins. Never saved.
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  useEffect(() => {
    setDrawingsVisible(true);
    setLaserOn(false);
  }, [props.model.id]);
  // L toggles the laser, Escape switches it off — window-level like the Alt
  // listener, ignored inside form fields and with a modifier held (Ctrl+L is the
  // browser's address bar). Not installed for the chrome-less export, which has
  // no control to show the state and no one at the keyboard.
  const chromeless = props.chrome === false;
  useEffect(() => {
    if (chromeless) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setLaserOn(false);
      else if (e.key.toLowerCase() === 'l' && !e.repeat) {
        e.preventDefault();
        setLaserOn((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chromeless]);
  const { pen: penSettings } = props;
  const onAddStroke = edit?.onAddStroke;
  const pen = usePen({
    enabled: penActive && onAddStroke !== undefined,
    toFlow: reactFlow.screenToFlowPosition,
    onStroke: (points) =>
      onAddStroke?.({
        points,
        ...(penSettings?.color !== undefined ? { color: penSettings.color } : {}),
        width: penSettings?.width ?? DEFAULT_STROKE_WIDTH,
      }),
  });
  const laser = useLaser({ enabled: laserOn, toFlow: reactFlow.screenToFlowPosition });
  // Both capture hooks stay attached at all times and each ignores pointers it
  // did not start: a handler swap on toggle would strand a gesture in flight
  // (pen stroke begun, L pressed mid-drag) with no up event to finish it. At
  // most one of them is enabled, so at most one claims a given pointerdown.
  const gestureHandlers = useMemo<PenHandlers>(() => {
    const both =
      (k: keyof PenHandlers): PenHandlers[keyof PenHandlers] =>
      (e) => {
        laser.handlers[k](e);
        pen.handlers[k](e);
      };
    return {
      onPointerDownCapture: both('onPointerDownCapture'),
      onPointerMoveCapture: both('onPointerMoveCapture'),
      onPointerUpCapture: both('onPointerUpCapture'),
      onPointerCancelCapture: both('onPointerCancelCapture'),
    };
  }, [laser.handlers, pen.handlers]);

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

  // The model opts in; the control button overrides locally. Never persisted.
  const [showLegend, setShowLegend] = useState(props.model.legend !== undefined);
  const [legendSize, setLegendSize] = useState<{ width: number; height: number } | null>(null);
  const legendConfig = props.model.legend;
  // Switching diagrams must re-seed from the new model, or a local override
  // leaks across: hide the legend on diagram A, open B, and B's key is missing.
  useEffect(() => {
    setShowLegend(legendConfig !== undefined);
  }, [props.model.id, legendConfig]);
  const activePlane = useMemo(
    () => props.model.planes.find((p) => p.id === (props.plane ?? props.model.planes[0]?.id)),
    [props.model.planes, props.plane],
  );
  const legendRowList = useMemo(
    () =>
      legendConfig === undefined
        ? []
        : legendRows({
            model: props.model,
            compiled,
            ...(activePlane !== undefined ? { plane: activePlane } : {}),
            // Drilled in, only the root's interior is on screen; the key has to
            // be scoped the same way or it explains things nothing draws.
            ...(drillRoot !== undefined ? { root: drillRoot } : {}),
            // Passed through undefined-and-all: the legend resolves plane
            // presets the same way compileView does, and `?? []` here would
            // tell it "no layers on" on a page that draws the presets.
            ...(props.activeLayers !== undefined ? { activeLayers: props.activeLayers } : {}),
            typeRegistry,
            kindRegistry,
            config: legendConfig,
            // Not `chrome`: a greyed row is only worth showing to a reader who
            // can un-grey it, and only a host with a handler offers that.
            canToggleLayers: props.onToggleLayer !== undefined,
            // Only when this plane has ink: no strokes means no toggle to show,
            // exactly the condition the control button already uses.
            ...(strokes.length > 0 ? { drawings: { active: drawingsVisible } } : {}),
          }),
    [
      legendConfig,
      props.model,
      compiled,
      activePlane,
      drillRoot,
      props.activeLayers,
      typeRegistry,
      kindRegistry,
      props.onToggleLayer,
      strokes,
      drawingsVisible,
    ],
  );
  // Read through `legendReserveRef` (not the state above) by the layoutApiRef
  // effect below, whose own deps are intentionally just [layoutApiRef, reactFlow]
  // — a ref keeps that closure from going stale without re-running it.
  const legendReserveRef = useRef<{ side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null>(null);
  useEffect(() => {
    const pos = legendConfig?.position ?? 'bottom-right';
    legendReserveRef.current =
      !showLegend || legendSize === null || legendRowList.length === 0
        ? null
        : { side: pos.startsWith('top') ? 'top' : 'bottom', px: legendSize.height + 16 };
  }, [showLegend, legendSize, legendRowList, legendConfig]);

  // Per-node size hints: the notation profile can seed a leaf size (e.g. CLD's
  // typeless nodes rendered as text chips); image nodes then overwrite with
  // their own footprint (overlay-resized if present, else a fixed default —
  // the studio seeds real dimensions at creation).
  const sizeHints = useMemo(() => {
    const m = new Map<string, { width: number; height: number }>();
    for (const n of props.model.nodes) {
      const hint = profile.node?.leafSize?.(n);
      if (hint !== undefined) m.set(n.id, hint);
    }
    // Registry-declared default sizes (activity dots/bars/diamonds): how
    // fixed-geometry glyphs get real footprints from the DSL, where no palette
    // template seeded dimensions. An explicit resize (overlay sizes) wins.
    for (const n of props.model.nodes) {
      if (n.type === undefined) continue;
      const ds = typeRegistry.resolve(n.type).defaultSize;
      if (ds === undefined) continue;
      const s = props.layout?.sizes?.[n.id];
      m.set(n.id, s !== undefined ? { width: s.w, height: s.h } : ds);
    }
    for (const n of props.model.nodes) {
      if (n.image === undefined) continue;
      const s = props.layout?.sizes?.[n.id];
      m.set(n.id, s !== undefined ? { width: s.w, height: s.h } : { width: DEFAULT_IMAGE_NODE_SIZE.w, height: DEFAULT_IMAGE_NODE_SIZE.h });
    }
    // Shape (silhouette) nodes honor their stored size like image nodes; without
    // one they fall through to the label-based estimate.
    for (const n of props.model.nodes) {
      if (n.shape === undefined) continue;
      const s = props.layout?.sizes?.[n.id];
      if (s !== undefined) m.set(n.id, { width: s.w, height: s.h });
    }
    // Multiline/rich leaf box labels: reserve an estimated footprint so elk
    // doesn't overlap neighbors around a taller-than-default box. Image/shape
    // nodes keep their own sizing above, and an explicit resize always wins.
    for (const n of props.model.nodes) {
      if (n.image !== undefined || n.shape !== undefined) continue;
      const plain = n.rich !== undefined ? runsToPlainText(n.rich) : n.name;
      if (n.rich === undefined && !plain.includes('\n')) continue; // single-line plain = default LEAF_SIZE
      if (props.layout?.sizes?.[n.id] !== undefined) continue; // explicit resize wins
      m.set(n.id, estimateLabelSize(plain, n.fontScale));
    }
    // db-table nodes: reserve the intrinsic footprint for the header + all rows
    // so elk lays out the full table, not a default box. Explicit resize wins.
    for (const n of props.model.nodes) {
      if (n.type !== 'db-table' || n.columns === undefined) continue;
      if (props.layout?.sizes?.[n.id] !== undefined) continue; // explicit resize wins
      m.set(n.id, tableSize(n.columns, n.name));
    }
    return m;
  }, [props.model, props.layout, profile, typeRegistry]);

  // Per-plane automatic-layout settings (algorithm/direction/spacing/edge routing)
  // from the overlay; stable-referenced so a position drag (which rebuilds
  // props.layout) doesn't needlessly re-run elk.
  const layoutSettings = useMemo(
    () => props.layout?.settings?.[layoutPlaneKey(props.model, props.plane)],
    [props.layout, props.model, props.plane],
  );

  const [geometry, setGeometry] = useState<Map<string, NodeGeometry> | null>(null);
  const geometryRef = useRef<Map<string, NodeGeometry> | null>(null);
  geometryRef.current = geometry;
  // elk-routed absolute edge waypoints (only populated when edgeRouting is
  // 'orthogonal'); consumed by the edges memo, falling back to floating paths.
  const [routes, setRoutes] = useState<Map<string, EdgePoint[]>>(() => new Map());
  useEffect(() => {
    let live = true;
    // A notation that owns the arrangement bypasses elk entirely; wrapped in a
    // resolved promise so both paths share the .then/.catch below.
    const notationLayout = profile.layout;
    const arrange =
      notationLayout !== undefined
        ? Promise.resolve().then(() => notationLayout(compiled, props.model, props.plane, sizeHints))
        : layoutView(compiled, sizeHints, layoutSettings);
    void arrange
      .then((r) => {
        if (!live) return;
        setGeometry((old) => (old === r.geometry ? old : r.geometry));
        setRoutes(r.routes);
      })
      // layoutView degrades to the default algorithm rather than rejecting, so
      // getting here via that path means even the degraded attempt failed. A
      // notation's own layout (e.g. git-graph's) has no such fallback — any
      // throw it raises lands here directly. Either way, keep the last
      // arrangement (there is nothing better to draw) but say so — an
      // unhandled rejection here reads on screen as the layout control
      // silently doing nothing.
      .catch((e: unknown) => {
        if (live) console.error('layout failed; keeping the previous arrangement', e);
      });
    // remember what is on screen — the plane-switch mapping reads this
    const ids: string[] = [];
    const walk = (n: ViewNode) => {
      ids.push(n.id);
      n.children.forEach(walk);
    };
    compiled.roots.forEach(walk);
    visibleRef.current = ids;
    return () => {
      live = false;
    };
  }, [compiled, sizeHints, layoutSettings, profile, props.model, props.plane]);

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

  // Surface them upward so a host can offer to persist them. Driven off the state
  // rather than the drag handler, so the resets above are reported too — a host
  // that kept showing a "save" affordance after a plane switch would be offering
  // to write positions the viewer can no longer see.
  const { onViewPositionsChange } = props;
  useEffect(() => {
    onViewPositionsChange?.(viewPositions);
  }, [viewPositions, onViewPositionsChange]);

  // Overlay-applied geometry: elk output with any layout-overlay positions for
  // the active plane substituted in (width/height stay elk's). Derived so the
  // elk cache is never mutated; everything that RENDERS reads this, while the
  // raw `geometry` remains the layout-effect state.
  const placedGeometry = useMemo(() => {
    if (geometry === null) return geometry;
    const key = layoutPlaneKey(props.model, props.plane);
    // Editing always reads the saved overlay: there the positions ARE the
    // document being edited, and the auto/manual switch is a command on the undo
    // stack. Only a viewer may set them aside.
    const saved = !editing && props.ignoreSavedPositions === true ? {} : (props.layout?.planes[key] ?? {});
    const withSaved = overlayPositions(geometry, saved);
    // A drag still wins over an automatic arrangement, so moving a box while
    // auto-arrange is on behaves the way dragging always does.
    return editing ? withSaved : overlayPositions(withSaved, viewPositions);
  }, [geometry, props.layout, props.model, props.plane, props.ignoreSavedPositions, editing, viewPositions]);

  // Activity frames: normalize lanes into full-width stacked bands. Applied to
  // the OVERLAY-APPLIED geometry (not the elk cache) so hand-drags participate:
  // dragging a node inside a lane grows the band on the next frame.
  const arrangedGeometry = useMemo(
    () =>
      placedGeometry === null
        ? null
        : arrangeActivityFrames(placedGeometry, compiled, props.model, props.layout?.sizes),
    [placedGeometry, compiled, props.model, props.layout],
  );

  // Ids the band pass above moved off elk's placement (arrangeActivityFrames
  // overrides lanes' x/y/w/h and frames' w/h AFTER elk already routed against
  // the pre-band positions) — the exact same kind of staleness a manual drag
  // causes for `pinnedIds` below, so these ids must join that same set (see
  // its comment: the git-lane-drag precedent this mirrors). `arrangeActivityFrames`
  // only `out.set()`s an id it actually changed, so "displaced" is precisely
  // "its arranged geometry object is not the placed one" (reference
  // inequality, not a value comparison). The `===` shortcut makes this empty
  // and free to compute when there are no activity frames on the plane at all
  // (arrangeActivityFrames then returns the same map back, unchanged).
  const bandDisplacedIds = useMemo(() => {
    if (arrangedGeometry === null || placedGeometry === null || arrangedGeometry === placedGeometry) {
      return EMPTY_ID_SET;
    }
    const displaced = new Set<string>();
    for (const [id, g] of arrangedGeometry) {
      if (placedGeometry.get(id) !== g) displaced.add(id);
    }
    return displaced;
  }, [arrangedGeometry, placedGeometry]);

  // A drill (enter/exit) swaps the whole scene, so once it re-layouts, glide to
  // fit the new isolated view.
  useEffect(() => {
    if (!pendingRootFitRef.current || arrangedGeometry === null) return;
    pendingRootFitRef.current = false;
    void reactFlow.fitView({ padding: 0.15, duration: 500 });
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

  // Enter (drill into) a node: make it the drill root — the isolated view swaps to
  // show its interior filling the canvas. Recomputing the whole chain (not
  // appending) means entering a sibling or ancestor (e.g. an external stub)
  // navigates correctly too. Every drill re-fits the whole new scene. Stable
  // across drills (reads the path from a ref) so it can be threaded onto nodes.
  const enterNode = useCallback(
    (id: string) => {
      // A notation container that is always expanded (e.g. a git lane) is a row,
      // not a box with an inside — nothing offers drilling into one, but a
      // double-click can still reach here via the click-correlation path, so
      // guard it explicitly rather than relying on the absent affordance.
      const node = props.model.nodes.find((n) => n.id === id);
      if (
        node !== undefined &&
        (profile.node?.alwaysExpanded?.(node) === true ||
          (node.type !== undefined && typeRegistry.resolve(node.type).alwaysExpanded === true))
      )
        return;
      const chain = drillChain(viewHierarchy.parentsOf, id, enteredPathRef.current);
      if (chain.length === 0) return; // unknown / not in this plane
      pendingRootFitRef.current = true;
      setEnteredPath(chain);
      setFocus([]); // drilling replaces any in-place (sheet-flip/peek) expansion
    },
    [viewHierarchy, props.model.nodes, profile, typeRegistry],
  );

  // Exit out to a breadcrumb (`null` = the home button → bird's-eye). The scene
  // becomes that frame's interior, so re-fit the whole thing.
  const exitTo = (id: string | null) => {
    const path = id === null ? [] : truncatePath(enteredPath, id);
    pendingRootFitRef.current = true;
    setEnteredPath(path);
    setFocus([]);
  };

  const hiddenCounts = useMemo(() => countAnchored(props.model, compiled), [props.model, compiled]);
  const metaKeys = props.onNodeMetaKeys ?? DEFAULT_ON_NODE_META_KEYS;

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
      pins: props.pins,
      onTogglePin: props.onTogglePin,
      onToggleExpand: props.onToggleExpand,
      onEnterNode: enterNode,
      editing,
      labelEditingId: labelEdit?.kind === 'node' ? labelEdit.id : undefined,
      endLabelEdit: () => setLabelEdit(null),
      onRenameNode: edit?.onRenameNode,
      onSetNodeRich: edit?.onSetNodeRich,
      assetBase: props.assetBase,
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
      props.pins,
      props.onTogglePin,
      props.onToggleExpand,
      enterNode,
      editing,
      labelEdit,
      edit?.onRenameNode,
      edit?.onSetNodeRich,
      props.assetBase,
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
          // membership is edited in the node panel, not by dragging away — keep
          // child drags clamped inside the parent box
          ...(editing && parent !== undefined ? { extent: 'parent' as const } : {}),
          ...(n.state === 'expanded'
            ? { style: { width: geo.width, height: geo.height }, zIndex: -1 }
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
                : {}),
        }),
      );
      n.children.forEach((c) => walk(c, n.id));
    };
    compiled.roots.forEach((r) => walk(r));
    return out;
  }, [compiled, arrangedGeometry, nodeDataCtx, editing, typeRegistry]);

  // React Flow owns a copy of the nodes and we apply its changes (drag positions,
  // measured dimensions, selection) with applyNodeChanges — the v12-recommended
  // shape. Fully controlled nodes (the previous design) re-created every node
  // object per drag frame, re-rendering all nodes and flickering under drag.
  // useLayoutEffect so a derived-node change never paints a stale frame first.
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const rfNodesRef = useRef<Node[]>([]);
  rfNodesRef.current = rfNodes;
  // Resync must not wipe flags React Flow owns on its copy — selection drives
  // the image-node resizer, and a selection click itself re-renders the app,
  // recomputing derivedNodes in the same tick.
  useLayoutEffect(() => {
    setRfNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected === true).map((n) => n.id));
      return selected.size === 0
        ? derivedNodes
        : derivedNodes.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n));
    });
  }, [derivedNodes]);

  // Populate the host's imperative layout ref (auto-layout toggle). Functions
  // read refs so the api object stays stable while always returning current data.
  useEffect(() => {
    const ref = props.layoutApiRef;
    if (ref === undefined) return;
    ref.current = {
      snapshotPositions: () =>
        Object.fromEntries(rfNodesRef.current.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
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
        const inkBounds = strokesBounds(strokesRef.current);
        if (nodeBounds === undefined) return inkBounds;
        if (inkBounds === undefined) return nodeBounds;
        // Union: a scribble outside the boxes must not be cropped from the PNG.
        const x = Math.min(nodeBounds.x, inkBounds.x);
        const y = Math.min(nodeBounds.y, inkBounds.y);
        return {
          x,
          y,
          width: Math.max(nodeBounds.x + nodeBounds.width, inkBounds.x + inkBounds.width) - x,
          height: Math.max(nodeBounds.y + nodeBounds.height, inkBounds.y + inkBounds.height) - y,
        };
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
  }, [props.layoutApiRef, reactFlow]);

  // Orthogonal routing is a per-plane setting — or the notation's own layout,
  // whose routes are the drawing (a git link has no floating form worth showing).
  // Endpoints whose position is manually overridden (saved pins, or ephemeral
  // view-mode drags) have a stale precomputed route, so those edges fall back
  // to floating paths. `bandDisplacedIds` joins the same set for the same
  // reason: the activity band pass overrides lane/frame geometry after elk
  // ran, exactly as a drag overrides it afterward by hand. A pinned id can
  // also be a CONTAINER (e.g. a dragged git lane, or a band-displaced activity
  // lane) — moving it moves every descendant along with it, so their routes
  // are just as stale even though only the container's own id was pinned. Walk
  // the compiled tree once to expand each pinned id to its whole subtree: an
  // endpoint counts as pinned when it, or any ancestor, is. Kept as a small memo
  // apart from the edges list itself so a plane/layout change alone doesn't
  // force the whole edge-data rebuild.
  const orthogonal = layoutSettings?.edgeRouting === 'orthogonal' || profile.layout !== undefined;
  const pinnedIds = useMemo(() => {
    if (!orthogonal) return undefined;
    const rawPinned = new Set<string>([
      ...Object.keys(props.layout?.planes[layoutPlaneKey(props.model, props.plane)] ?? {}),
      ...(editing ? [] : Object.keys(viewPositions)),
      ...bandDisplacedIds,
    ]);
    const expanded = new Set<string>();
    const walk = (n: ViewNode, ancestorPinned: boolean) => {
      const pinned = ancestorPinned || rawPinned.has(n.id);
      if (pinned) expanded.add(n.id);
      n.children.forEach((c) => walk(c, pinned));
    };
    compiled.roots.forEach((r) => walk(r, false));
    return expanded;
  }, [orthogonal, props.layout, props.model, props.plane, editing, viewPositions, compiled, bandDisplacedIds]);

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
      orthogonal,
      pinnedIds,
      routes,
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
      orthogonal,
      pinnedIds,
      routes,
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

  // Causal-loop-diagram overlay: the R/B feedback-loop badges. Derived from the
  // drawn edges (aggregated where relations parallel), not the raw model, so it
  // stays in sync with layer/plane filtering the same way the arrows do.
  const cld = profile.overlay === 'loop-labels';
  const loopEdges = useMemo(
    (): LoopEdgeInput[] | null =>
      cld
        ? compiled.edges.map((e) => {
            const pol = combinePolarities(e.constituents.map((c) => c.polarity));
            return { id: e.id, from: e.from, to: e.to, ...(pol !== undefined ? { polarity: pol } : {}) };
          })
        : null,
    [compiled, cld],
  );
  // Surface the compiled signed graph upward (leverage analysis runs on the
  // exact edge ids the canvas draws).
  const { onCldEdges } = props;
  useEffect(() => {
    onCldEdges?.(loopEdges ?? []);
  }, [loopEdges, onCldEdges]);

  // Declutter switch for the CLD overlay: badges can pile up (a busy loop graph
  // has dozens), so a canvas control hides them all. Default shown, ephemeral —
  // survives plane switches (Inner stays mounted) but resets on reload.
  const [showLoops, setShowLoops] = useState(true);
  // The selected node id: drives the view-mode loop-badge filter (edit mode
  // leaves that null) and the connected-neighborhood focus dim in both modes.
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // Dim nodes/edges not connected to the selected node. On by default, ephemeral.
  const [focusConnected, setFocusConnected] = useState(true);
  const [activeLoop, setActiveLoop] = useState<{ key: string; nodes: Set<string>; edges: Set<string> } | null>(null);
  // A host-driven highlight (leverage panel) overrides the internal badge one.
  const ext = props.externalHighlight;
  // The selected node's neighborhood: itself + every node one edge away (in or
  // out) and the incident edges, over the currently-visible graph.
  const neighborFocus = useMemo(() => {
    if (!focusConnected || selectedNode === null) return null;
    const nodes = new Set<string>([selectedNode]);
    const edges = new Set<string>();
    for (const e of compiled.edges) {
      if (e.from === selectedNode) {
        nodes.add(e.to);
        edges.add(e.id);
      } else if (e.to === selectedNode) {
        nodes.add(e.from);
        edges.add(e.id);
      }
    }
    return { nodes, edges };
  }, [focusConnected, selectedNode, compiled.edges]);
  // Precedence: a leverage row (ext) or loop badge glows its set (strong dim of
  // the rest); plain node selection is the gentle fallback (light dim, no glow).
  const loopHighlight = useMemo<LoopHighlight>(() => {
    const strong =
      ext != null
        ? { nodes: new Set(ext.nodes), edges: new Set(ext.edges) }
        : activeLoop !== null
          ? { nodes: activeLoop.nodes, edges: activeLoop.edges }
          : null;
    const source = strong ?? neighborFocus;
    return {
      nodes: source?.nodes ?? EMPTY_ID_SET,
      edges: source?.edges ?? EMPTY_ID_SET,
      active: source !== null,
      variant: strong !== null ? 'loop' : 'focus',
      activeKey: activeLoop?.key ?? null,
      toggle: (key, nodes, edges) =>
        setActiveLoop((cur) => (cur?.key === key ? null : { key, nodes: new Set(nodes), edges: new Set(edges) })),
      clear: () => setActiveLoop(null),
    };
  }, [activeLoop, ext, neighborFocus]);
  // A highlighted loop's ids (and the node-focus filter) go stale when the view
  // recompiles (plane / zoom / edit).
  useEffect(() => {
    setActiveLoop(null);
    setSelectedNode(null);
  }, [compiled]);

  return (
    <LoopHighlightContext.Provider value={loopHighlight}>
    <div
      ref={wrapperRef}
      className={`dg-canvas${props.chrome === false ? ' dg-no-chrome' : ''}${editing ? ' dg-mode-edit' : ''}${!editing && altHeld ? ' dg-alt-move' : ''}${
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
          // shift-click in edit mode builds a pending multi-selection (grouping).
          // Bypass primary selection + the drill double-click correlation.
          if (editing && e.shiftKey && edit?.onGroupToggle !== undefined) {
            corr.clearNodeClick();
            edit.onGroupToggle(node.id);
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
          // view mode: a second click (detail>=2) on the SAME node within the
          // window is a double-click → enter (drill into) it. The detail check
          // separates it from a click-then-click-elsewhere (e.g. deselect), which
          // stays detail 1. Otherwise record this as a possible first click.
          if (!editing && corr.consumeNodeDrill(node.id, e, e.detail)) {
            enterNode(node.id);
          } else if (editing) {
            corr.clearNodeClick();
          } else {
            corr.recordNodeClick(node.id, e);
          }
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
        onNodesChange={(changes: NodeChange[]) => setRfNodes((nds) => applyNodeChanges(changes, nds))}
        onNodeDragStop={(_e, node) => {
          if (editing) edit?.onNodeMoved?.(node.id, node.position);
          else setViewPositions((p) => ({ ...p, [node.id]: node.position }));
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
        fitView
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        multiSelectionKeyCode={null}
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
        <Background />
        <DrawingsLayer
          strokes={strokes}
          live={pen.live === null ? null : { points: pen.live, width: penSettings?.width ?? DEFAULT_STROKE_WIDTH, ...(penSettings?.color !== undefined ? { color: penSettings.color } : {}) }}
          visible={drawingsVisible && drillRoot === undefined}
          erasing={eraserActive}
          onErase={(id) => edit?.onDeleteStroke?.(id)}
        />
        <LaserLayer trails={laser.trails} live={laser.live} />
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
