/** The DiagramView public surface: props, the edit-callback contract, and the
 * imperative layout API. Pure declarations — no runtime logic lives here. */

import type { Column, DiagramModel, Drawings, EdgeLabelSide, LayoutOverlay, NotationId, Stroke, TextRun, ThreatStatus, ThreatTarget } from '@diagc/core';
import type { IconRegistry } from '@diagc/icons';
import type { MutableRefObject } from 'react';
import type { AlignMode } from './arrange';
import type { EdgeLabelMoves } from './build-data';
import type { Side } from './floating';
import type { LoopEdgeInput } from './loops';
import type { KindStyle, Registry, TypeStyle } from './registry';

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
 * auto-layout toggle, the view-mode freeze chip) and to run the export
 * handshake. Populated in both modes whenever `layoutApiRef` is passed. */
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

/** The corner controls and the arrange toolbar, callable: what a host binds keys
 *  to. Each entry is the function its button runs, and reports whether it applied
 *  — `false` when the button would not be showing (no legend, fewer than two boxes
 *  selected, …), so the host can leave the key to the browser. `fitView` is the
 *  one exception: React Flow's own button fits the nodes, this fits what
 *  LayoutApi.fitView fits (nodes ∪ drawings). */
export interface CanvasCommands {
  toggleLaser(): boolean;
  toggleDim(): boolean;
  toggleLegend(): boolean;
  toggleDrawings(): boolean;
  toggleLoops(): boolean;
  zoomIn(): boolean;
  zoomOut(): boolean;
  fitView(): boolean;
  align(mode: AlignMode): boolean;
  distribute(axis: 'x' | 'y'): boolean;
}
/** the corner controls a host can name a key for (see DiagramViewProps.keyHints) */
export type CanvasKeyHint = 'laser' | 'dim' | 'legend' | 'drawings' | 'loops';

export interface DiagramViewProps {
  model: DiagramModel;
  /** active plane id (models with planes); absent = the model's first plane */
  plane?: string;
  activeLayers?: string[];
  /** a legend layer row was clicked — toggle that layer's visibility */
  onToggleLayer?: (id: string) => void;
  pins?: Record<string, 'expanded' | 'collapsed'>;
  /** a linked node's badge was clicked (see DiagramNode.link) — the host
   * resolves it (e.g. the Obsidian plugin opens a [[wikilink]] note); absent
   * falls back to DiagramNode's own best-effort (new-tab for http(s) links). */
  onOpenLink?: (link: string) => void;
  /** a container's fold chip (or a CLD group's disclosure toggle) was clicked.
   * `next` is the state to land in: the view knows what is on screen, the host
   * only knows its pins — and a container can be open with no pin at all. */
  onToggleExpand?: (id: string, next: 'expanded' | 'collapsed') => void;
  onSelect?: (sel: DiagramSelection | null) => void;
  /** the set of selected nodes changed (Shift+click, Shift+drag marquee, a
   * plain click, a deselect). Both modes. Reported only when the ids actually
   * differ from the last report, and through a stable callback — React Flow
   * re-fires its selection listener whenever the callback identity changes. */
  onMultiSelect?: (ids: string[]) => void;
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
  /** Populated like layoutApiRef: the canvas's own switches, for a host that owns
   * the keyboard. */
  canvasCommandsRef?: MutableRefObject<CanvasCommands | null>;
  /** false = a host dispatches the canvas keys itself (the studio's configurable
   * hotkeys), so the built-in `L` listener stands down — two listeners would
   * toggle the laser twice. Escape → laser off stays either way: it is a cancel,
   * not a binding. Default true: the published viewer has no host to do it. */
  builtinKeys?: boolean;
  /** key names appended to the corner controls' titles, e.g. `{ laser: 'K' }` →
   * "Laser pointer (K)". Absent, the laser keeps `(L)` while builtinKeys is on. */
  keyHints?: Partial<Record<CanvasKeyHint, string>>;
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
  /** view mode: the edge labels the viewer slid along their edges (Alt+drag a
   * label), relation id → label id → placement. The same contract as
   * onViewPositionsChange: throwaway state the host may persist (to the
   * overlay's `edgeLabels`), reported as `{}` when dropped. Passing it is also
   * what makes labels movable in view mode at all — without a listener the
   * move would have nowhere to go. */
  onViewLabelMovesChange?: (moves: EdgeLabelMoves) => void;
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
  /** URL prefix substituted for a leading '/library/' on bundled-icon refs, for
   * hosts with no static server to serve them verbatim (e.g. the Obsidian
   * plugin); absent keeps '/library/…' refs untouched. */
  libraryBase?: string;
  /** false hides the interactive control cluster. The PNG export sets it so a
   * committed image is the diagram alone, with no zoom widget baked into it. */
  chrome?: boolean;
  /** false draws no threat bubbles at all and leaves the badges passive counts —
   * a host that wants none, whatever the overlay says. Default true, which is
   * not "all of them": a bubble draws only while its element's is open. */
  notes?: boolean;
  /** visual style preset id (see stylePresets.ts); unknown/absent = clean */
  styleId?: string;
  /** snap dragged and nudged nodes to a square grid of this many flow px and
   * draw that grid as the background dots; absent = free placement */
  snapGrid?: number;
  /** visual language; overrides registries + chrome. props.typeRegistry/kindRegistry still win wholesale. */
  notation?: NotationId;
  /** the host's date (YYYY-MM-DD) for a plan's today line; null = draw none (exports) */
  today?: string | null;
}

/** Edit-mode callbacks an editing host (apps/studio) wires to its command
 * pipeline. Grouped as one optional object on DiagramViewProps so a read-only
 * host (apps/viewer) can simply omit it; every callback is optional so the
 * host can opt into just the affordances it wants. */
export interface EditingApi {
  /** a connect gesture completed between two nodes. New relations float by
   * default (no pinned sides) — the caller pins later via onSetEdgeSide/reconnect. */
  onConnect?: (from: string, to: string, sourceHandle?: string | null, targetHandle?: string | null) => void;
  /** a node drag ended; pos is parent-relative */
  onNodeMoved?: (id: string, pos: { x: number; y: number }) => void;
  /** one or more nodes moved together — a drag of a selection, an arrow-key
   * burst, an align/distribute. Parent-relative, keyed by node id. Commit as
   * ONE undo step. When absent the renderer falls back to onNodeMoved per id,
   * so a host that never learns the batch form keeps working.
   * `deltas` is each node's displacement from where the layout arranged it,
   * parent-relative — what a notation that derives positions (a plan's dates)
   * reads instead of the position. */
  onNodesMoved?: (
    positions: Record<string, { x: number; y: number }>,
    deltas: Record<string, { dx: number; dy: number }>,
  ) => void;
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
  /** Open this node's name for in-place editing — for hosts that create a node
   * from OUTSIDE the canvas (a panel button, a key) and want the caret in it, as
   * `onCreateAt`'s returned id does for a canvas double-click. Re-armed by a new
   * `nonce`, so asking twice for the same id works. */
  editLabelRequest?: { id: string; nonce: number };
  /** The `+` on a selected node (and the host's Tab): `label(id)` names what
   * it would add — undefined hides the button — and `run(id)` adds it. The
   * host owns the recipe (it knows the notation); the view only draws the
   * offer and reports the click. */
  quickAdd?: { label: (id: string) => string | undefined; run: (id: string) => void };
  /** a threat note was dragged: its new offset from the automatic anchor */
  onNoteMoved?: (target: ThreatTarget, offset: { dx: number; dy: number }) => void;
  /** the empty badge/chip or a note's `+`: add a threat on this element. The
   * host adds it and answers with `editThreatRequest` so its title opens. */
  onAddThreat?: (target: ThreatTarget) => void;
  /** a threat title was committed on its note; `''` = escaped or emptied */
  onRetitleThreat?: (target: ThreatTarget, id: string, title: string) => void;
  /** open this threat's title on its note — the `editLabelRequest` contract, nonce-keyed */
  editThreatRequest?: { target: ThreatTarget; id: string; nonce: number };
  /** the badge/chip was clicked in edit mode: save this element's bubble as open or closed */
  onToggleNote?: (target: ThreatTarget, open: boolean) => void;
  /** a bubble's status chip was clicked: the threat's next status */
  onSetThreatStatus?: (target: ThreatTarget, id: string, status: ThreatStatus) => void;
  /** a bubble's description/mitigation field was committed; `''` clears it */
  onEditThreatText?: (target: ThreatTarget, id: string, field: 'description' | 'mitigation', text: string) => void;
  /** Backspace/Delete pressed with a canvas selection: `nodeIds` are the
   * selected nodes, `relationIds` the constituent relations of any selected
   * edges. Wiring this is what enables the delete key at all — without it
   * (and always in view mode) the key is inert, because React Flow's own
   * removal only touches its local element copy and the model would
   * resurrect everything on the next rebuild. */
  onDeleteSelection?: (sel: { nodeIds: string[]; relationIds: string[] }) => void;
  /** pen tool: a stroke was drawn (rounded, simplified flow points). The host
   * assigns the id (uniqueStrokeId) and the plane, like add-node. */
  onAddStroke?: (stroke: Omit<Stroke, 'id'>) => void;
  /** eraser tool: a stroke was clicked */
  onDeleteStroke?: (id: string) => void;
}

export const DEFAULT_ON_NODE_META_KEYS = ['framework', 'language', 'tool'];
