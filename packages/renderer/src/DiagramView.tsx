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
  getNodesBounds,
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
  layoutPlaneKey,
  runsToPlainText,
  type Column,
  type DiagramModel,
  type EdgeLabelSide,
  type LayoutOverlay,
  type NotationId,
  type TextRun,
  type ViewNode,
} from '@diagramming/core';
import { createIconRegistry, type IconRegistry } from '@diagramming/icons';
import { Breadcrumbs } from './Breadcrumbs';
import { buildEdgeDataCached, buildNodeDataCached, type EdgeDataContext, type NodeDataContext } from './build-data';
import { edgeTypes, nodeTypes, toRfEdge, toRfNode } from './adapter';
import { drillChain, truncatePath } from './drill';
import { reconnectPin, type Side } from './floating';
import { focusForVisible } from './focus';
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
import './styles.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';

export interface DiagramSelection {
  kind: 'node' | 'edge';
  id: string;
  constituentIds?: string[];
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
  /** bounding box of all rendered nodes in flow coordinates, or undefined when
   * nothing is laid out yet — used to size an export snapshot to the real content */
  contentBounds: () => { x: number; y: number; width: number; height: number } | undefined;
  /** fit every node into the current viewport (re-run after the frame is resized).
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
}

export const DEFAULT_ON_NODE_META_KEYS = ['framework', 'language', 'tool'];

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
  const compiled = useMemo(
    () =>
      compileView(props.model, {
        // drilled → `root` drives visibility; otherwise `focus` (pins + the plane
        // sheet-flip). Identical for view and edit — only affordances differ.
        focus: drillRoot !== undefined ? undefined : focus,
        pins: props.pins,
        activeLayers: props.activeLayers,
        ...(props.plane !== undefined ? { plane: props.plane } : {}),
        ...(drillRoot !== undefined ? { root: drillRoot } : {}),
      }),
    [props.model, props.plane, focus, drillRoot, props.pins, props.activeLayers],
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
  }, [props.model, props.layout, profile]);

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
    void layoutView(compiled, sizeHints, layoutSettings)
      .then((r) => {
        if (!live) return;
        setGeometry((old) => (old === r.geometry ? old : r.geometry));
        setRoutes(r.routes);
      })
      // layoutView degrades to the default algorithm rather than rejecting, so
      // getting here means even that failed. Keep the last arrangement (there is
      // nothing better to draw) but say so — an unhandled rejection here reads on
      // screen as the layout control silently doing nothing.
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
  }, [compiled, sizeHints, layoutSettings]);

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

  // A drill (enter/exit) swaps the whole scene, so once it re-layouts, glide to
  // fit the new isolated view.
  useEffect(() => {
    if (!pendingRootFitRef.current || placedGeometry === null) return;
    pendingRootFitRef.current = false;
    void reactFlow.fitView({ padding: 0.15, duration: 500 });
  }, [compiled, placedGeometry, reactFlow]);

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
      const chain = drillChain(viewHierarchy.parentsOf, id, enteredPathRef.current);
      if (chain.length === 0) return; // unknown / not in this plane
      pendingRootFitRef.current = true;
      setEnteredPath(chain);
      setFocus([]); // drilling replaces any in-place (sheet-flip/peek) expansion
    },
    [viewHierarchy],
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
    ],
  );

  const derivedNodes = useMemo((): Node[] => {
    if (placedGeometry === null) return [];
    const out: Node[] = [];
    const walk = (n: ViewNode, parent?: string) => {
      const geo = placedGeometry.get(n.id);
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
              : {}),
        }),
      );
      n.children.forEach((c) => walk(c, n.id));
    };
    compiled.roots.forEach((r) => walk(r));
    return out;
  }, [compiled, placedGeometry, nodeDataCtx, editing]);

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
        return nodes.length === 0 ? undefined : getNodesBounds(nodes);
      },
      fitView: (padding = 0.06) => {
        void reactFlow.fitView({
          padding:
            typeof padding === 'number'
              ? padding
              : Object.fromEntries(Object.entries(padding).map(([k, v]) => [k, `${v}px`])),
        });
      },
      legendReserve: () => legendReserveRef.current,
    };
    return () => {
      ref.current = null;
    };
  }, [props.layoutApiRef, reactFlow]);

  // Orthogonal routing is a per-plane setting; endpoints whose position is
  // manually overridden (saved pins, or ephemeral view-mode drags) have a stale
  // precomputed route, so those edges fall back to floating paths. Kept as a
  // small memo apart from the edges list itself so a plane/layout change alone
  // doesn't force the whole edge-data rebuild.
  const orthogonal = layoutSettings?.edgeRouting === 'orthogonal';
  const pinnedIds = useMemo(
    () =>
      orthogonal
        ? new Set<string>([
            ...Object.keys(props.layout?.planes[layoutPlaneKey(props.model, props.plane)] ?? {}),
            ...(editing ? [] : Object.keys(viewPositions)),
          ])
        : undefined,
    [orthogonal, props.layout, props.model, props.plane, editing, viewPositions],
  );

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
      }`}
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
        minZoom={0.02}
        maxZoom={4}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        multiSelectionKeyCode={null}
        panOnScroll
        nodesDraggable={editing || altHeld}
        nodesConnectable={editing}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Breadcrumbs path={enteredPath} nameOf={(id) => nameOf.get(id) ?? id} onCrumb={exitTo} />
        {showLegend && legendRowList.length > 0 && (
          // LegendPosition is a subset of React Flow's PanelPosition — no cast needed.
          <Panel position={legendConfig?.position ?? 'bottom-right'}>
            <Legend
              rows={legendRowList}
              {...(legendConfig?.title !== undefined ? { title: legendConfig.title } : {})}
              interactive={props.chrome !== false}
              {...(props.onToggleLayer !== undefined ? { onToggleLayer: props.onToggleLayer } : {})}
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
