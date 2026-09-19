import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTheme,
  darkTheme,
  DiagramView,
  isKnownStyle,
  lightTheme,
  notationProfile,
  STYLE_PRESETS,
  type DiagramSelection,
  type DrawTool,
  type EdgeLabelMoves,
  type LoopEdgeInput,
  type Side,
} from '@diagramming/renderer';
import {
  allNotesOpen,
  DEFAULT_STROKE_WIDTH,
  emptyDrawings,
  emptyLayout,
  errMessage,
  defaultLayoutDirection,
  layoutPlaneKey,
  LEAF_SIZE,
  NEW_THREAT_TITLE,
  nextThreatId,
  openingPins,
  presetLayers,
  SOURCE_URL,
  strideFor,
  threatsOf,
  TM_NOTATION,
  uniqueStrokeId,
  type Column,
  type DiagramModel,
  type Drawings,
  type EdgeLabelSide,
  type LayoutOverlay,
  type LayoutSettings,
  type RelationStyle,
  type Stroke,
  type TextRun,
  type ThreatStatus,
  type ThreatTarget,
} from '@diagramming/core';
import { activeNotation } from './notation';
import { getHost } from './host';
import { useDiagramBoot } from './hooks/useDiagramBoot';
import { useDeepLink } from './hooks/useDeepLink';
import { useEditSession } from './hooks/useEditSession';
import { usePersistedState } from './hooks/usePersistedState';
import { useNodePlacement } from './hooks/useNodePlacement';
import { useDiagramActions } from './hooks/useDiagramActions';
import { useViewOps } from './hooks/useViewOps';
import { edgeLabelsOf, addEdgeLabel, editEdgeLabel, moveEdgeLabel } from './edge-labels';
import { computeSelectionColor } from './selection-color';
import { EditorToolbar } from './editor/EditorToolbar';
import { LayoutControls } from './LayoutControls';
import { mergePreview, withLayoutPreview } from './layoutPreview';
import { unfoldedOf, withPlaneManual, withSavedPositions } from './savedPositions';
import { uploadAsset } from './editor/images';
import { NodePanel } from './editor/NodePanel';
import { EdgePanel } from './editor/EdgePanel';
import { LeveragePanel, type LeverageFocus } from './LeveragePanel';
import { LayersPlanesPanel } from './editor/LayersPlanesPanel';
import { GitPanel } from './editor/GitPanel';
import { ActivityPanel } from './editor/ActivityPanel';
import { SecondOrderPanel } from './editor/SecondOrderPanel';
import { FishbonePanel } from './editor/FishbonePanel';
import { ThreatModelPanel } from './editor/ThreatModelPanel';
import { quickAdd, quickAddLabel, quickAddPlaced, type QuickAddContext } from './editor/quickAdd';
import { InspectorTabs, type InspectorTab } from './editor/InspectorTabs';
import { Dock } from './Dock';
import { clampDockWidth } from './dockWidth';
import { Sidebar } from './Sidebar';
import { LibraryPanel } from './library/LibraryPanel';
import { useLibrary } from './library/useLibrary';
import { uniqueLibraryId } from './library/entry';
import { deleteSelectionCommand } from './editor/deleteSelection';
import { connectKind } from './editor/connectKind';
import { fkConnectionCommands } from './tableConnect';

const STYLE_KEY = 'diagramming.style';
// Snap-to-grid is a viewer preference (how one edits), not a property of the
// diagram, so it lives beside the style preset rather than in the sidecar.
const SNAP_KEY = 'diagramming.snap';
const SNAP_GRID = 10;
// The right details dock defaults open, but a collapse is remembered so it stays
// out of the way across reloads once dismissed.
const RIGHT_DOCK_KEY = 'diagramming.rightDock';
const LEFT_DOCK_KEY = 'diagramming.leftDock';
const LEFT_WIDTH_KEY = 'diagramming.leftDockWidth';
const RIGHT_WIDTH_KEY = 'diagramming.rightDockWidth';
const DOCK_MAX = 560;
const LEFT_MIN = 220;
const RIGHT_MIN = 240;
const LEFT_DEFAULT = 300;
const RIGHT_DEFAULT = 320;

// The dock widths persist clamped; a garbage/non-numeric stored value falls back
// to the default (readDockWidth semantics), so the persisted reader returns null
// for such values and usePersistedState applies its fallback.
const readClampedWidth = (raw: string | null, min: number, max: number): number | null => {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? clampDockWidth(n, min, max) : null;
};

// The Apply-target for a selected node (LibraryPanel restyle toggle); undefined
// when nothing is selected (hides the toggle).
const applyTargetFor = (
  model: DiagramModel,
  selection: DiagramSelection | null,
): { applyTarget: { id: string; name: string } } | undefined => {
  if (selection?.kind !== 'node') return undefined;
  const n = model.nodes.find((x) => x.id === selection.id);
  return n !== undefined ? { applyTarget: { id: n.id, name: n.name || n.id } } : undefined;
};

/** `initialTheme` lets a host seed the color scheme (the Obsidian pane passes
 * the vault's); the browser studio keeps its dark default. A seed only — the
 * in-app toggle owns the state from mount on. */
export function App({ initialTheme = 'dark' }: { initialTheme?: 'light' | 'dark' } = {}) {
  const boot = useDiagramBoot();
  const { artifacts, names, booted, ownedNames, setOwnedNames, setDrafts, setLoaded, setSources, canDesign } = boot;

  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [style, setStyle] = usePersistedState<string>(STYLE_KEY, 'clean', (raw) => raw);
  const [snap, setSnap] = usePersistedState<boolean>(SNAP_KEY, false, (raw) => (raw === null ? null : raw === 'true'));
  const [plane, setPlane] = useState<string | undefined>(undefined);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  // The "pen": the transparent sheet new nodes/edges land on (null = base sheet).
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, 'expanded' | 'collapsed'>>({});
  // A viewer's momentary layout choice, keyed by resolved containment plane like
  // the persisted settings are. Never written: this is viewer state in the same
  // class as pins and focus, and DEFERRALS.md:14 keeps saves explicit.
  const [layoutPreview, setLayoutPreview] = useState<Record<string, LayoutSettings>>({});
  // Boxes moved by hand in view mode (alt-drag), not yet written to the sidecar.
  // Unlike the layout preview these CAN be persisted — coordinates were never
  // part of the model, so saving them is legitimate even for a read-only
  // TS-authored diagram, whose sidecar `pnpm compile` never rewrites.
  const [movedPositions, setMovedPositions] = useState<Record<string, { x: number; y: number }>>({});
  // Edge labels slid along their edges in view mode (Alt+drag a label): the
  // same class of state, saved by the same chip into the overlay's `edgeLabels`.
  const [movedLabels, setMovedLabels] = useState<EdgeLabelMoves>({});
  const [savingPositions, setSavingPositions] = useState(false);
  // Hand back a hand-positioned plane to the layout algorithm for this view only.
  // Saved coordinates otherwise beat every algorithm, so a diagram that has been
  // placed by hand stops responding to the picker entirely. Viewer state, like
  // pins and the layout preview: never written, and dropped when the diagram
  // changes so one diagram's choice cannot silently govern the next.
  const [autoArrange, setAutoArrange] = useState(false);
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  // A node created OUTSIDE the canvas (a panel button, e.g. second-order's "And
  // then what?") that should open for rename, same as onCreateAt's canvas
  // gesture does. Nonce-keyed (see EditingApi.editLabelRequest) so asking again
  // for the same id still re-arms the effect.
  const [labelRequest, setLabelRequest] = useState<{ id: string; nonce: number } | undefined>(undefined);
  const requestLabelEdit = (id: string) => setLabelRequest((r) => ({ id, nonce: (r?.nonce ?? 0) + 1 }));
  // A threat added from the canvas (an element's empty badge, a note's +) opens
  // its title on the note — the same nonce-keyed handshake as labelRequest, so
  // adding a second threat to the same element still re-arms the request.
  const [threatRequest, setThreatRequest] = useState<{ target: ThreatTarget; id: string; nonce: number } | undefined>(
    undefined,
  );
  const requestThreatEdit = (target: ThreatTarget, id: string) =>
    setThreatRequest((r) => ({ target, id, nonce: (r?.nonce ?? 0) + 1 }));
  // The canvas multi-selection (Shift+click / marquee), mirrored from the
  // renderer. Drives the ⊞ Group chip and the selection glow. Deduped by
  // contents so a re-report of the same set never re-renders the app.
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const multiSelect = useCallback(
    (ids: string[]) =>
      setGroupSel((cur) => (cur.length === ids.length && cur.every((id, i) => id === ids[i]) ? cur : ids)),
    [],
  );
  // CLD dependency: the ctrl-clicked second variable to compare with the
  // selected one (null = no comparison active).
  const [compareId, setCompareId] = useState<string | null>(null);
  // CLD leverage analysis: the compiled signed graph surfaced by DiagramView,
  // and the report row currently driving the canvas highlight.
  const [cldEdges, setCldEdges] = useState<LoopEdgeInput[]>([]);
  const handleCldEdges = useCallback((edges: LoopEdgeInput[]) => setCldEdges(edges), []);
  const [leverageFocus, setLeverageFocus] = useState<LeverageFocus | null>(null);
  const [leftTab, setLeftTab] = useState<InspectorTab>('properties');
  // The dock collapse states persist with an on-disk format that predates this
  // hook ('collapsed'/'expanded'), so both reader and serializer use it.
  const [leftCollapsed, setLeftCollapsed] = usePersistedState<boolean>(LEFT_DOCK_KEY, false, (raw) => raw === 'collapsed', (v) => (v ? 'collapsed' : 'expanded'));
  const [rightCollapsed, setRightCollapsed] = usePersistedState<boolean>(RIGHT_DOCK_KEY, false, (raw) => raw === 'collapsed', (v) => (v ? 'collapsed' : 'expanded'));
  const [leftWidth, setLeftWidth] = usePersistedState<number>(LEFT_WIDTH_KEY, LEFT_DEFAULT, (raw) =>
    readClampedWidth(raw, LEFT_MIN, DOCK_MAX),
  );
  const [rightWidth, setRightWidth] = usePersistedState<number>(RIGHT_WIDTH_KEY, RIGHT_DEFAULT, (raw) =>
    readClampedWidth(raw, RIGHT_MIN, DOCK_MAX),
  );
  const lib = useLibrary();

  // Synchronous re-entrancy guards for the once-subscribed listeners, each of
  // which must call the latest closure without re-subscribing on every render:
  //   - addNodeRef: the keydown N-key shortcut (see useEditSession).
  //   - leaveEditRef: the hashchange listener's cross-diagram edit close.
  //   - tabActionRef: the keydown Tab shortcut (a notation's "add a child").
  // All three are read through refs by the listeners and assigned on every render.
  const addNodeRef = useRef<() => void>(() => {});
  const leaveEditRef = useRef<() => boolean>(() => true);
  const tabActionRef = useRef<() => boolean>(() => false);

  const dl = useDeepLink({ names, booted, leaveEditRef });
  const { selected, setSelected, enteredPath, setEnteredPath, handleEnteredPathChange } = dl;
  const drillRoot = enteredPath.length > 0 ? enteredPath[enteredPath.length - 1] : undefined;
  // Live mirror of `selected` for enterEditFromSource's in-flight fetch to check
  // against once it resolves (same ref-mirror pattern as useDeepLink's urlNowRef) —
  // a callback captures `selected` at click time, but the async gap means the
  // user may have switched diagrams before the response arrives.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Auto-arrange is scoped to the diagram it was switched on for, so one
  // diagram's choice cannot silently rearrange the next one you open.
  useEffect(() => {
    setAutoArrange(false);
  }, [selected]);

  // The preview is diagram-scoped viewer state; every path that changes which
  // diagram is selected — the picker, a hashchange deep link, or the stale-name
  // fallback (all in useDeepLink) — must drop it here, or a leftover preview
  // keyed 'default' (a key every diagram resolves to, unlike the plane/pin
  // state it leaks alongside today) would silently re-lay out the next diagram.
  useEffect(() => {
    setLayoutPreview({});
  }, [selected]);

  // Canvas tool + pen settings. Viewer state: never saved, reset to Select on
  // leaving edit mode or switching diagram so a pen never lingers invisibly.
  const [tool, setTool] = useState<DrawTool>('select');
  const [penColor, setPenColor] = useState('');
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_STROKE_WIDTH);
  // Read through a ref by the once-subscribed keydown handler (like addNodeRef).
  // Pen/Eraser are refused while drilled in, matching the toolbar chips, which
  // are disabled there for the same reason (drawings are a top-level layer).
  // The renderer is already inert while drilled, so nothing would be drawn
  // either way — but a chip that reads pressed while disabled, and a pen that
  // springs to life the moment you drill back out, is a first-hour
  // contradiction. Select/Escape always get through: leaving a tool must never
  // depend on where you are.
  const toolKeyRef = useRef<(t: DrawTool) => void>(() => {});
  toolKeyRef.current = (t) => {
    if (t !== 'select' && enteredPath.length > 0) return;
    setTool(t);
  };

  const edit = useEditSession({
    setDrafts,
    resetInspector: () => setLeftTab('properties'), // re-entering edit starts on Properties
    addNodeRef,
    toolKeyRef,
    leaveEditRef,
    tabActionRef,
  });
  const { editing, setEditing, editor, layoutApiRef, saveIssues, setSaveIssues, saving, doSave, enterEdit, leaveEdit } = edit;

  // Leaving edit mode or switching diagram drops the pen (see the tool state
  // above): Pen/Eraser only exist in edit mode, and a tool that survived either
  // transition would keep swallowing canvas clicks with nothing to draw on.
  // Drilling in resets too — drawings are a top-level layer, so the toolbar
  // disables both tools there and the state must follow, or the UI would show
  // Pen pressed on a canvas that cannot draw.
  useEffect(() => {
    if (!editing || enteredPath.length > 0) setTool('select');
  }, [editing, selected, enteredPath]);

  useEffect(() => {
    applyTheme(document.documentElement, theme === 'dark' ? darkTheme : lightTheme);
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const current = artifacts[selected];
  const session = editor.session;
  const model = editing ? session?.state.model : current?.model;
  const layout = editing ? session?.state.layout : current?.layout;
  const drawings = editing ? session?.state.drawings : current?.drawings;
  // A diagram-pinned style (known preset only) outranks the app preference;
  // unknown pinned ids behave as unpinned so retired presets never wedge a file.
  const pinnedStyle = model?.style !== undefined && isKnownStyle(model.style) ? model.style : undefined;
  const planes = model?.planes ?? [];
  // undefined = the base/default view (no plane overlay). Kept distinct from
  // planes[0] so the Default chip stays reachable once planes exist — but the
  // default view's containment IS the first plane's, so it takes that plane's
  // notation too (activeNotation falls back to planes[0]), matching the
  // published page.
  const activePlane = plane;
  const notation = activeNotation(planes, activePlane, model?.notation);
  // elk partitions (second-order's order bands) are a layered-only feature, and
  // the renderer already forces layered for a partitioned profile — so the
  // algorithm picker would only ever offer a choice the run ignores. Reaches
  // both the toolbar (edit mode) and the view-mode LayoutControls below.
  const algorithmLocked = notationProfile(notation).partitionOf !== undefined;
  // A borrowing plane's node membership resolves to its base plane
  // (compileView/resolveContainmentPlane), so tagging node.plane with the
  // borrowing plane's own id would mismatch and the node would silently
  // vanish. Stage 1 disables plane-scoped membership editing there — new
  // nodes are added shared instead (see createNodeAt).
  const activePlaneBorrowsContainment = planes.find((p) => p.id === activePlane)?.containmentOf !== undefined;

  // Seed the layer switch from the plane's presets when a diagram arrives on
  // screen. A plane's `layers` are a DEFAULT the user then owns (see
  // presetLayers): compileView no longer unions them in on every compile, so
  // without a seed a diagram opens with its own overlays off. Keyed on the
  // diagram, not on `model` — editing rebuilds the model on every keystroke, and
  // re-seeding there would undo the user's own toggles mid-edit. A plane change
  // does not re-seed here either; switchPlane owns that transition.
  const seededDiagram = useRef<string | null>(null);
  useEffect(() => {
    if (model === undefined || seededDiagram.current === selected) return;
    seededDiagram.current = selected;
    setActiveLayers(presetLayers(model.planes, plane));
    // Same seed as the exporter: a diagram whose layout names groups in
    // `export.collapsed` opens with exactly those folded here too. Without it the
    // studio drew a picture the published image never shows — the author would
    // fold by hand to see what they were shipping, or (worse) not notice that a
    // box is folded in the image at all. Empty list, empty pins: unchanged.
    // On top of that, the boxes the layout was SAVED with open (`unfolded`):
    // hand-placed interiors only show while their container is open.
    const folded = layout?.export?.collapsed ?? [];
    setPins({
      ...Object.fromEntries(folded.map((id) => [id, 'collapsed' as const])),
      ...openingPins(layout, model, plane),
    });
  }, [selected, model, plane, layout]);

  // Whether the active plane is in manual (frozen) layout — its manual flag is
  // set in the layout sidecar. Drives the toolbar toggle and new-node placement.
  const activePlaneManual = model !== undefined && layout?.manual?.[layoutPlaneKey(model, activePlane)] === true;

  // Edit mode reads the session's own overlay untouched — layout settings there
  // are commands on the undo stack. View mode overlays the ephemeral preview.
  const viewLayout = useMemo(
    () => (editing ? layout : withLayoutPreview(layout, model, activePlane, layoutPreview)),
    [editing, layout, model, activePlane, layoutPreview],
  );

  // The active plane's automatic-layout settings (algorithm/direction/spacing/
  // edge routing); empty ⇒ tuned defaults. Drives the layout picker in both modes.
  const activePlaneSettings: LayoutSettings =
    (model !== undefined ? viewLayout?.settings?.[layoutPlaneKey(model, activePlane)] : undefined) ?? {};

  // The pen, clamped to a layer that still exists (deleting the active layer
  // drops us back to the base sheet without any explicit reset).
  const penLayer = activeLayer !== null && (model?.layers ?? []).some((l) => l.id === activeLayer) ? activeLayer : null;

  // Set (or clear, with side=null) one endpoint's pinned side on a relation,
  // merged into its existing style so other overrides survive; returns the next
  // style object, or null when nothing remains (drops the style entirely). Shared
  // by the pin dots (onSetEdgeSide) and reconnect-drag pinning.
  const styleWithSide = (relationId: string, end: 'from' | 'to', side: Side | null): RelationStyle | null => {
    const style: RelationStyle = { ...model?.relations.find((r) => r.id === relationId)?.style };
    const key = end === 'from' ? 'fromSide' : 'toSide';
    if (side === null) delete style[key];
    else style[key] = side;
    return Object.keys(style).length > 0 ? style : null;
  };

  // Multi-label edge editing. Each helper reads the relation, projects its
  // effective labels through relationLabels() (via edge-labels.ts, bridging a
  // legacy `label`), computes the next array, and dispatches update-relation
  // { labels }. A relation upgrades from a legacy `label` to `labels` on its
  // first edit. The pure compute lives in edge-labels.ts; the dispatch glue is
  // here because it needs the live editor session.
  const addEdgeLabelFor = (relationId: string, text: string, t: number, side: EdgeLabelSide) => {
    if (model === undefined) return;
    const cur = edgeLabelsOf(model, relationId);
    if (cur === null) return;
    editor.dispatch({
      type: 'update-relation',
      id: relationId,
      patch: { labels: addEdgeLabel(cur, text, t, side) },
    });
  };
  const editEdgeLabelFor = (relationId: string, labelId: string, text: string) => {
    if (model === undefined) return;
    const cur = edgeLabelsOf(model, relationId);
    if (cur === null) return;
    editor.dispatch({ type: 'update-relation', id: relationId, patch: { labels: editEdgeLabel(cur, labelId, text) } });
  };
  const moveEdgeLabelFor = (relationId: string, labelId: string, t: number, side: EdgeLabelSide) => {
    if (model === undefined) return;
    const cur = edgeLabelsOf(model, relationId);
    if (cur === null) return;
    editor.dispatch({
      type: 'update-relation',
      id: relationId,
      patch: { labels: moveEdgeLabel(cur, labelId, t, side) },
    });
  };

  // Select the relation a connect gesture just created (Task 3/4 render its panel).
  const lastRel = session?.lastRelationId;
  useEffect(() => {
    if (editing && lastRel !== undefined) {
      setSelection({ kind: 'edge', id: lastRel });
      setRenameId(null);
    }
  }, [editing, lastRel]);

  // Selection, view/plane/layer/pin navigation (select, compare/group, plane
  // switching, pen sheets, view reset).
  const view = useViewOps({
    editor,
    model,
    selection,
    groupSel,
    editing,
    notation,
    activePlane,
    activePlaneBorrowsContainment,
    planes,
    activeLayer,
    activeLayers,
    setSelection,
    setRenameId,
    setLeverageFocus,
    setCompareId,
    setPlane,
    setPins,
    layout,
    pins,
    setLayoutPreview,
    setActiveLayers,
    setActiveLayer,
  });
  const { select, switchPlane, activateLayer, toggleLayer, mergeSelectedLayers, toggleExpand, resetView } = view;
  const { compareSelect, groupSelected } = view;

  // The `+` on a selected node and the Tab key are one action: add the node
  // the notation expects on the selection (a category / cause on a fish, a
  // consequence, a flow to a new process, a connected sibling anywhere else)
  // and open it for typing, the way the notation panels' own buttons do.
  // Placement: a sibling goes beside its source only when elk would not place
  // it (manual plane) or the source is pinned — see quickAddPlaced.
  // Reports whether it acted so the keydown handler only swallows Tab's
  // default focus move when there was something to extend (see useEditSession).
  const quickAddCtx: QuickAddContext = {
    notation,
    plane: activePlane,
    borrowsContainment: activePlaneBorrowsContainment,
    penLayer,
  };
  const runQuickAdd = (id: string): boolean => {
    // peek(): the synchronous session, so the add is built on the model the
    // gesture was made on — Tab commits the name being typed a moment before it
    // adds, and the new node's id must not collide with that render's stale one.
    const m = editor.peek()?.state.model;
    if (!editing || m === undefined) return false;
    const out = quickAdd(m, id, quickAddCtx);
    if (out === undefined) return false;
    const key = layoutPlaneKey(m, activePlane);
    // the source's own box size, when it was ever resized — the sibling takes it
    // so a row of hand-sized stencils stays one size (see quickAddPlaced)
    const size = layout?.sizes?.[id];
    editor.dispatch(
      quickAddPlaced(out, {
        pinned: activePlaneManual || layout?.planes[key]?.[id] !== undefined,
        source: layoutApiRef.current?.snapshotPositions()[id],
        width: size?.w ?? LEAF_SIZE.width,
        ...(size !== undefined ? { size } : {}),
        plane: activePlane,
      }),
    );
    select({ kind: 'node', id: out.id });
    requestLabelEdit(out.id);
    return true;
  };
  tabActionRef.current = () => (selection?.kind === 'node' ? runQuickAdd(selection.id) : false);

  // The plane every plane-scoped command below is filed under; the base view
  // (undefined) sends no `plane` at all, which the commands read as "the
  // resolved default" (see layoutPlaneKey).
  const planeOpt = activePlane !== undefined ? { plane: activePlane } : {};

  // Threat notes on the canvas. The note only reports gestures — which threat
  // to add, what a title became — and the host owns the model, exactly as it
  // does for quick add: the renderer never invents an id or a category.
  const addThreatOn = (target: ThreatTarget) => {
    // peek(): the synchronous session, so a second + right after the first
    // commit sees the threat that commit added and picks the next free id.
    const m = editor.peek()?.state.model;
    if (m === undefined) return;
    const existing = threatsOf(m, target);
    if (existing === undefined) return; // no such element: a stale note
    // The element's own STRIDE letters, so a store opens on Tampering rather
    // than on a constant; the panel is where it gets corrected.
    const typeOrKind =
      'node' in target ? m.nodes.find((n) => n.id === target.node)?.type : m.relations.find((r) => r.id === target.relation)?.kind;
    const id = nextThreatId(existing);
    // NEW_THREAT_TITLE, never `''`: autosave fires on a 300ms timer, so the
    // model this dispatch produces is saved while the field is still open — and
    // an empty title fails validation, which the save handler answers with a
    // 400 and the toolbar with a red banner mid-typing. A placeholder keeps
    // every intermediate state a valid model.
    // One undo step: the first threat AND its bubble, open — the `+` was a
    // request to write on the canvas, and a closed bubble would swallow the
    // title field the request opens next.
    editor.dispatch({
      type: 'batch',
      commands: [
        { type: 'add-threat', target, threat: { id, category: strideFor(typeOrKind)[0] ?? 'S', title: NEW_THREAT_TITLE } },
        { type: 'set-note-open', target, open: true, ...planeOpt },
      ],
    });
    requestThreatEdit(target, id); // …and open it for typing, where it was added
  };
  const retitleThreat = (target: ThreatTarget, id: string, title: string) => {
    const m = editor.peek()?.state.model;
    const current = m !== undefined ? threatsOf(m, target)?.find((t) => t.id === id) : undefined;
    if (current === undefined) return;
    // An emptied or escaped field on a threat nobody has named yet takes it away
    // again — the placeholder is how "never titled" is recognised. On a threat
    // that carries a real title it is a cancelled edit, so the title stands; the
    // field never writes `''` into the model, which would fail validation and
    // wedge every autosave until it was fixed.
    if (title === '') {
      if (current.title === NEW_THREAT_TITLE) editor.dispatch({ type: 'remove-threat', target, id });
      return;
    }
    if (title !== current.title) editor.dispatch({ type: 'update-threat', target, id, patch: { title } });
  };
  const setThreatStatus = (target: ThreatTarget, id: string, status: ThreatStatus) =>
    editor.dispatch({ type: 'update-threat', target, id, patch: { status } });
  const editThreatText = (target: ThreatTarget, id: string, field: 'description' | 'mitigation', text: string) => {
    const m = editor.peek()?.state.model;
    const current = m !== undefined ? threatsOf(m, target)?.find((t) => t.id === id) : undefined;
    if (current === undefined) return;
    // `''` clears (null in the patch — the field is optional on a Threat, and
    // an empty string would be a third state); an unchanged value is no command
    if ((current[field] ?? '') === text) return;
    editor.dispatch({ type: 'update-threat', target, id, patch: { [field]: text === '' ? null : text } });
  };
  // The `Notes` chip reads pressed only when EVERY bubble is open (model-wide,
  // the set-notes-open rule), so a press always does what the picture lacks.
  const allOpen = model !== undefined && layout !== undefined && allNotesOpen(model, layout, layoutPlaneKey(model, activePlane));
  // `some` rather than threatRegister(): this runs every render and only needs
  // to know whether ONE threat exists, not to build (and name) every row.
  const anyThreats =
    model !== undefined &&
    (model.nodes.some((n) => (n.threats?.length ?? 0) > 0) ||
      model.relations.some((r) => (r.threats?.length ?? 0) > 0));
  // Only a diagram that has threats (or is meant to grow them) gets the chip.
  const hasThreats = model !== undefined && (notation === TM_NOTATION || anyThreats);

  // Diagram lifecycle: create + rename + duplicate (the flows that re-key the
  // artifact store).
  const actions = useDiagramActions({
    editing,
    selected,
    current,
    names,
    ownedNames,
    setOwnedNames,
    setDrafts,
    setLoaded,
    setSources,
    setSelected,
    setEnteredPath,
    setEditing,
    leaveEdit,
    resetView,
    editor,
  });

  // Everything that creates a node: whiteboard add, canvas create, library
  // place/apply/drop, image import — all through createNodeAt.
  const placement = useNodePlacement({
    editor,
    layoutApiRef,
    addNodeRef,
    setSelection,
    setRenameId,
    setLeftTab,
    requestLabelEdit,
    setSaveIssues,
    activePlane,
    activePlaneBorrowsContainment,
    activePlaneManual,
    penLayer,
    selection,
    drillRoot,
    model,
    lib,
  });
  const { addNode, createAt, placeFromLibrary, applyFromLibrary, dropLibraryEntry, addImages } = placement;

  // Import a user icon into a library category: upload the file, then add it
  // as a new placeable entry (a fresh image-typed template).
  const importLibraryIcon = async (categoryId: string, file: File) => {
    try {
      const image = await uploadAsset(file);
      const id = uniqueLibraryId(file.name, new Set(lib.library.entries.map((e) => e.id)), 'icon');
      const name = file.name.replace(/\.[^.]*$/, '') || 'icon';
      lib.addEntry({ id, category: categoryId, name, template: { type: 'image', image, width: 64, height: 64 } });
    } catch (e) {
      setSaveIssues([{ message: errMessage(e) }]);
    }
  };

  // Import a user shape (SVG silhouette) into a library category: same upload
  // flow as importLibraryIcon, but the template carries no width/height — a
  // shape sizes to the node instead of forcing a fixed footprint.
  const importLibraryShape = async (categoryId: string, file: File) => {
    try {
      const shape = await uploadAsset(file);
      const id = uniqueLibraryId(file.name, new Set(lib.library.entries.map((e) => e.id)), 'shape');
      const name = file.name.replace(/\.[^.]*$/, '') || 'shape';
      lib.addEntry({ id, category: categoryId, name, template: { shape } });
    } catch (e) {
      setSaveIssues([{ message: errMessage(e) }]);
    }
  };

  // Edit sessions start from the raw source on disk, never the boot model —
  // the boot model is composed for umbrellas, and a session seeded from it
  // would save grafted content into the source.
  const enterEditFromSource = async () => {
    const target = selected;
    try {
      const res = await getHost().apiFetch(`/api/diagrams/${target}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { model: DiagramModel; layout?: LayoutOverlay; drawings?: Drawings };
      // The user may have switched diagrams (picker or hashchange) while this
      // fetch was in flight — entering edit on `target` now would open a session
      // on the diagram the header no longer shows, so a stale response is
      // dropped instead of touching any state for a diagram that isn't selected.
      if (selectedRef.current !== target) return;
      // Edit mode reads the session's own overlay, not the preview — drop it here
      // (mirroring resetView() on the diagram picker) so Save + Done doesn't come
      // back to a stale preview masking what was saved. Only on success: a
      // failed fetch leaves the preview exactly as the old synchronous code did.
      setLayoutPreview({});
      enterEdit(target, body.model, body.layout ?? emptyLayout(), body.drawings ?? emptyDrawings());
    } catch (e) {
      if (selectedRef.current !== target) return;
      setSaveIssues([{ message: `Could not load '${target}' for editing: ${errMessage(e)}` }]);
    }
  };

  // Flip the active plane between automatic and manual layout. Turning auto Off
  // freezes the current on-screen positions (so nothing jumps) then sets the
  // manual flag; turning it On just clears the flag (non-destructive — the pins
  // stay, but automatic layout resumes driving the arrangement).
  const toggleAutoLayout = () => {
    if (editor.session?.state.model === undefined) return;
    if (activePlaneManual) {
      editor.dispatch({ type: 'set-plane-layout', manual: false, ...planeOpt });
    } else {
      editor.dispatch({ type: 'set-positions', positions: layoutApiRef.current?.snapshotPositions() ?? {}, ...planeOpt });
      editor.dispatch({ type: 'set-plane-layout', manual: true, ...planeOpt });
    }
  };

  // Merge a layout-settings patch into the active plane (a field set to undefined
  // clears it back to the tuned default; the reducer drops emptied buckets).
  const setLayoutSettings = (patch: Partial<LayoutSettings>) => {
    if (editor.session?.state.model === undefined) return;
    editor.dispatch({ type: 'set-layout-settings', patch, ...(activePlane !== undefined ? { plane: activePlane } : {}) });
  };

  // Write an overlay to `<name>.layout.json` and fold it into the in-memory copy
  // on success, so it survives a plane switch (which drops the renderer's
  // ephemeral drags) without a reload. Explicit, never automatic — unlike the
  // edit session's autosave, this runs in view mode on diagrams the studio does
  // not own, so committing positions to a repo file stays a deliberate act.
  // Both view-mode chips (Save positions, Freeze layout) end here.
  const postLayout = useCallback(
    async (next: LayoutOverlay): Promise<boolean> => {
      setSavingPositions(true);
      try {
        const res = await getHost().apiFetch(`/api/layouts/${selected}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          const body = (await res.json()) as { issues?: { message: string }[] };
          setSaveIssues(body.issues ?? [{ message: 'Could not save layout' }]);
          return false;
        }
        setLoaded((cur) => {
          const entry = cur[selected];
          return entry === undefined ? cur : { ...cur, [selected]: { ...entry, layout: next } };
        });
        setSaveIssues(null);
        return true;
      } finally {
        setSavingPositions(false);
      }
    },
    [selected, setLoaded, setSaveIssues],
  );

  // While editing, the open boxes are recorded in the session's overlay (see
  // toggleExpand), so undo/redo can change them underneath the canvas: follow.
  // Only a CHANGE while editing counts — entering edit mode must not fold away
  // what the viewer had open just because it was never saved.
  const savedUnfoldedKey =
    model !== undefined ? (layout?.unfolded?.[layoutPlaneKey(model, activePlane)] ?? []).join('\u0000') : '';
  const lastSavedUnfolded = useRef<string | null>(null);
  useEffect(() => {
    const was = lastSavedUnfolded.current;
    lastSavedUnfolded.current = editing ? savedUnfoldedKey : null;
    if (!editing || was === null || was === savedUnfoldedKey || model === undefined) return;
    setPins((p) => (unfoldedOf(p).join('\u0000') === savedUnfoldedKey ? p : openingPins(layout, model, activePlane)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved list's CONTENT; layout/model/plane are read at that moment
  }, [editing, savedUnfoldedKey]);

  // Which boxes are open is saved WITH the positions (see withSavedPositions),
  // so the chip also has something to save when only a fold changed.
  const unfoldedNow = useMemo(() => unfoldedOf(pins), [pins]);
  const foldsUnsaved = model !== undefined && unfoldedNow.join('\u0000') !== savedUnfoldedKey;

  const unsavedView = Object.keys(movedPositions).length > 0 || Object.keys(movedLabels).length > 0 || foldsUnsaved;

  const savePositions = useCallback(async () => {
    if (model === undefined || !unsavedView) return;
    const ok = await postLayout(withSavedPositions(layout, model, activePlane, movedPositions, unfoldedNow, movedLabels));
    // The posted body folds movedPositions into the saved overlay, so on success
    // those drags are no longer unsaved — clear the chip. A failed post must
    // leave it up (postLayout surfaces saveIssues) so the user can retry.
    if (ok) {
      setMovedPositions({});
      setMovedLabels({});
    }
  }, [model, movedPositions, movedLabels, unsavedView, unfoldedNow, layout, activePlane, postLayout]);

  // The view-mode manual switch. Freezing snapshots every on-screen position
  // (React Flow's parent-relative copy — the overlay's own space, unsaved drags
  // included) so nothing jumps, then sets the flag; thawing only clears the
  // flag. Same semantics as the edit toolbar's toggle, minus the undo stack —
  // see withPlaneManual for what the flag does and does not do.
  const toggleFreeze = useCallback(async () => {
    if (model === undefined) return;
    const freezing = !activePlaneManual;
    const snapshot = freezing ? (layoutApiRef.current?.snapshotPositions() ?? {}) : null;
    const ok = await postLayout(
      withPlaneManual(layout, model, activePlane, snapshot, freezing ? unfoldedNow : undefined, freezing ? movedLabels : {}),
    );
    // Freezing's body IS the current on-screen snapshot, so any pending
    // view-mode drags it covers are now saved too — clear the chip. Thawing's
    // body carries no positions at all, so pending drags stay pending; they
    // must NOT be discarded just because the plane went back to automatic.
    if (ok && freezing) {
      setMovedPositions({});
      setMovedLabels({});
    }
  }, [model, layout, activePlane, activePlaneManual, layoutApiRef, postLayout, unfoldedNow, movedLabels]);

  // View mode never persists: merge into the ephemeral preview instead of
  // dispatching a command.
  const previewLayoutSettings = useCallback(
    (patch: Partial<LayoutSettings>) => {
      if (model === undefined) return;
      const key = layoutPlaneKey(model, activePlane);
      setLayoutPreview((p) => mergePreview(p, key, patch));
    },
    [model, activePlane],
  );

  // Global color target: the selected node, or the selected single-relation
  // edge — drives the toolbar swatch row (select object -> click color).
  const selectionColor = editing && model !== undefined ? computeSelectionColor(model, selection, editor.dispatch) : null;

  // The node panel's position inputs, computed once here instead of twice in
  // the JSX below (hasPin used to run this same lookup a second time via an
  // IIFE just to get pinned/live) — same lookups, same values, one place.
  const pinned =
    selection?.kind === 'node' && model !== undefined
      ? layout?.planes[layoutPlaneKey(model, activePlane)]?.[selection.id]
      : undefined;
  const live =
    selection?.kind === 'node' && model !== undefined ? layoutApiRef.current?.snapshotPositions()[selection.id] : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <strong>Diagramming Studio</strong>
        <select
          aria-label="Diagram"
          value={selected}
          onChange={(e) => {
            if (!leaveEdit()) return;
            setSelected(e.target.value);
            setEnteredPath([]);
            resetView();
          }}
        >
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {canDesign && !editing && (
          <button className="chip" onClick={() => void actions.newDiagram()}>
            New diagram
          </button>
        )}
        {canDesign && !editing && ownedNames.has(selected) && (
          <button className="chip" onClick={() => void actions.renameDiagram()} title="Rename this diagram">
            Rename
          </button>
        )}
        {canDesign && !editing && model !== undefined && (
          <button
            className="chip"
            onClick={() => void actions.duplicateDiagram()}
            title="Copy this diagram — layout and all — to a new editable one and open it"
          >
            Duplicate
          </button>
        )}
        {canDesign && !editing && ownedNames.has(selected) && (
          <button
            className="chip"
            onClick={() => void actions.ejectDiagram()}
            title="Promote this diagram to a TypeScript source — it becomes read-only here"
          >
            Eject
          </button>
        )}
        <span className="spacer" />
        {model !== undefined &&
          (ownedNames.has(selected) ? (
            !editing && (
              <button className="chip" onClick={() => void enterEditFromSource()}>
                Edit
              </button>
            )
          ) : (
            <span className="chip read-only" title="Compiled from TypeScript — edit the source">
              read-only
            </span>
          ))}
        {!editing && model !== undefined && (
          <>
            <LayoutControls
              settings={activePlaneSettings}
              onChange={previewLayoutSettings}
              {...(model !== undefined ? { defaultDirection: defaultLayoutDirection(model) } : {})}
              algorithmLocked={algorithmLocked}
            />
            {layoutPreview[layoutPlaneKey(model, activePlane)] !== undefined && (
              <button
                className="chip"
                title="Drop the preview and go back to this diagram's own layout settings"
                onClick={() =>
                  setLayoutPreview((p) => {
                    const next = { ...p };
                    delete next[layoutPlaneKey(model, activePlane)];
                    return next;
                  })
                }
              >
                Reset layout
              </button>
            )}
            {Object.keys(layout?.planes[layoutPlaneKey(model, activePlane)] ?? {}).length > 0 && (
              <button
                type="button"
                className={`chip${autoArrange ? ' active' : ''}`}
                aria-pressed={autoArrange}
                title={
                  autoArrange
                    ? 'Ignoring this diagram’s saved positions, so the layout algorithm arranges every node. Click to put them back.'
                    : 'This plane has saved positions, which override the layout algorithm. Click to arrange those nodes automatically instead (nothing is written).'
                }
                onClick={() => setAutoArrange((v) => !v)}
              >
                Auto-arrange
              </button>
            )}
            <button
              type="button"
              className={`chip${activePlaneManual ? ' active' : ''}`}
              aria-pressed={activePlaneManual}
              // A drilled snapshot (layoutApiRef.current?.snapshotPositions()) holds
              // only the visible subtree, not the whole plane — freezing from there
              // would set the plane-wide `manual` flag off the back of a partial
              // snapshot. Must be done from the top level instead.
              disabled={savingPositions || enteredPath.length > 0}
              title={
                enteredPath.length > 0
                  ? 'Freezing pins the whole plane, but a drilled view only has positions for what it shows — leave the drilled view first.'
                  : activePlaneManual
                    ? 'Positions are pinned. Click to let the layout algorithm arrange this plane again (your positions are kept).'
                    : 'Pin every box where it is so the layout algorithm stops moving them. Boxes added to the source later are still placed automatically until you move them.'
              }
              onClick={() => void toggleFreeze()}
            >
              Freeze layout
            </button>
            {unsavedView && (
              <button
                className="chip primary"
                disabled={savingPositions}
                title="Write the boxes and edge labels you moved, and which groups are open, to this diagram's layout file. Safe on a generated diagram: re-compiling rewrites the model, never the layout."
                onClick={() => void savePositions()}
              >
                {savingPositions ? 'Saving…' : 'Save positions'}
              </button>
            )}
          </>
        )}
        {/* Beside the layout chips, and edit-mode only: opening every bubble is
            a command on the undo stack, saved in the layout file so the
            published page and the PNG agree — in view mode there is no session
            to dispatch into (there the badge toggles for the session). */}
        {editing && hasThreats && (
          <button
            type="button"
            className={`chip${allOpen ? ' active' : ''}`}
            aria-pressed={allOpen}
            // an empty register has nothing to open: the command would push an
            // undo step and an autosave that change nothing
            disabled={!anyThreats}
            title={allOpen ? 'Close all threat notes' : 'Open all threat notes'}
            onClick={() => editor.dispatch({ type: 'set-notes-open', open: !allOpen, ...planeOpt })}
          >
            Notes
          </button>
        )}
        <button
          type="button"
          className={`chip${snap ? ' active' : ''}`}
          aria-pressed={snap}
          title={
            snap
              ? `Snapping to a ${SNAP_GRID}px grid. Click to place boxes freely.`
              : `Snap dragged boxes to a ${SNAP_GRID}px grid; arrow keys step by it too.`
          }
          onClick={() => setSnap((v) => !v)}
        >
          ⋮⋮ Snap
        </button>
        <button className="chip" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '☀ light' : '☾ dark'}
        </button>
        {editing ? (
          <select
            className="chip"
            aria-label="Diagram style"
            title="Diagram style (saved with the diagram)"
            value={pinnedStyle ?? ''}
            onChange={(e) =>
              editor.dispatch({ type: 'set-diagram-style', style: e.target.value === '' ? null : e.target.value })
            }
          >
            <option value="">(app default)</option>
            {STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <select
            className="chip"
            aria-label="Style"
            title={pinnedStyle !== undefined ? 'Set by diagram' : 'Visual style'}
            /* clamp: garbage in localStorage would otherwise render a blank select */
            value={pinnedStyle ?? (isKnownStyle(style) ? style : 'clean')}
            disabled={pinnedStyle !== undefined}
            onChange={(e) => setStyle(e.target.value)}
          >
            {STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {/* AGPL section 13 offer. Near-dormant on localhost, but `diagc studio` accepts
            a `host` option, and the moment it is bound to a non-loopback address its
            users are interacting with the program over a network and are owed a way to
            get its source. Cheaper to always show than to detect the binding. */}
        <a
          className="chip source-link"
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          title="diagc is free software under the AGPL-3.0 — get the source"
        >
          source
        </a>
      </header>
      {editing && (
        <EditorToolbar
          editor={editor}
          onNewDiagram={() => void actions.newDiagram()}
          onExit={leaveEdit}
          onSave={() => void doSave()}
          saving={saving}
          saveIssues={saveIssues}
          activePlane={activePlane}
          autoLayout={!activePlaneManual}
          onToggleAutoLayout={toggleAutoLayout}
          getAutoPositions={() => layoutApiRef.current?.autoPositions() ?? {}}
          layoutSettings={activePlaneSettings}
          {...(model !== undefined ? { defaultDirection: defaultLayoutDirection(model) } : {})}
          onSetLayoutSettings={setLayoutSettings}
          selectionColor={selectionColor}
          tool={tool}
          onSetTool={setTool}
          pen={{ color: penColor, width: penWidth }}
          onSetPen={(patch) => {
            if (patch.color !== undefined) setPenColor(patch.color);
            if (patch.width !== undefined) setPenWidth(patch.width);
          }}
          drawingDisabled={enteredPath.length > 0}
          layoutLocked={notationProfile(notation).layout !== undefined}
          algorithmLocked={algorithmLocked}
        />
      )}
      {names.length === 0 && (
        <div className="banner">
          {canDesign ? (
            // The API is up, so creating is possible — telling an Obsidian (or
            // fresh-checkout) user to run pnpm compile here points at a build
            // step their empty workspace doesn't need.
            <>
              No diagrams yet — use <b>New diagram</b> to create one.
            </>
          ) : (
            <>
              No artifacts found — run <code>pnpm compile</code> (or <code>pnpm compile:watch</code>) first.
            </>
          )}
        </div>
      )}
      {!editing && current !== undefined && current.issues.length > 0 && (
        <div className="banner error">
          <b>{current.name}</b> failed validation:
          <ul>
            {current.issues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      {/* enterEditFromSource's catch path sets saveIssues without ever setting
          editing — the toolbar's own banner (below) only renders while editing,
          so a raw-source fetch failure needs its own view-mode surface. */}
      {!editing && saveIssues !== null && saveIssues.length > 0 && (
        <div className="banner error">
          <ul>
            {saveIssues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      <main className="body">
        {model !== undefined && (
          <>
            <Dock
              side="left"
              collapsed={leftCollapsed}
              onToggle={() => setLeftCollapsed((v) => !v)}
              hasContent={editing ? true : selection !== null}
              width={leftWidth}
              minWidth={LEFT_MIN}
              maxWidth={DOCK_MAX}
              onWidthChange={setLeftWidth}
            >
              {editing ? (
                <InspectorTabs
                  activeTab={leftTab}
                  onTabChange={setLeftTab}
                  properties={
                    selection?.kind === 'node' && model.nodes.some((n) => n.id === selection.id) ? (
                      <NodePanel
                        key={selection.id}
                        model={model}
                        nodeId={selection.id}
                        activePlane={activePlane}
                        hasPin={pinned !== undefined}
                        {...(pinned !== undefined ? { pinned } : {})}
                        {...(live !== undefined ? { live } : {})}
                        autoFocusName={selection.id === renameId}
                        {...(notation !== undefined ? { notation } : {})}
                        onCommand={editor.dispatch}
                        onClose={() => select(null)}
                        onDeleted={() => select(null)}
                      />
                    ) : selection?.kind === 'edge' ? (
                      <EdgePanel
                        key={selection.id}
                        model={model}
                        constituentIds={selection.constituentIds ?? [selection.id]}
                        onCommand={editor.dispatch}
                        onClose={() => select(null)}
                        {...(notation !== undefined ? { notation } : {})}
                        {...(activePlane !== undefined ? { activePlane } : {})}
                      />
                    ) : (
                      <Sidebar model={model} selection={selection} />
                    )
                  }
                  library={
                    <LibraryPanel
                      library={lib.library}
                      onPlace={placeFromLibrary}
                      onApply={applyFromLibrary}
                      {...(applyTargetFor(model, selection) ?? {})}
                      onAddNode={addNode}
                      onAddImages={(files) => void addImages(files)}
                      onAddCategory={lib.addCategory}
                      onDeleteCategory={lib.deleteCategory}
                      onImportIcon={(categoryId, file) => void importLibraryIcon(categoryId, file)}
                      onImportShape={(categoryId, file) => void importLibraryShape(categoryId, file)}
                      assetBase={getHost().assetBase}
                    />
                  }
                />
              ) : notation === 'causal-loop' &&
                selection?.kind === 'node' &&
                model.nodes.some((n) => n.id === selection.id) ? (
                <LeveragePanel
                  key={selection.id}
                  model={model}
                  edges={cldEdges}
                  target={selection.id}
                  activeFocusKey={leverageFocus?.key ?? null}
                  onFocus={setLeverageFocus}
                  onClose={() => select(null)}
                  compareId={compareId}
                  onClearCompare={() => setCompareId(null)}
                />
              ) : selection !== null ? (
                <Sidebar model={model} selection={selection} />
              ) : (
                <div className="sidebar dock-empty">Select a node or edge for details.</div>
              )}
            </Dock>
            <div className="canvas-area">
              <DiagramView
                model={model}
                plane={activePlane}
                activeLayers={activeLayers}
                onToggleLayer={toggleLayer}
                pins={pins}
                onToggleExpand={toggleExpand}
                onSelect={select}
                onMultiSelect={multiSelect}
                onEnteredPathChange={handleEnteredPathChange}
                enteredPath={enteredPath}
                onCompareSelect={compareSelect}
                colorMode={theme}
                assetBase={getHost().assetBase}
                {...(getHost().libraryBase !== undefined ? { libraryBase: getHost().libraryBase } : {})}
                onOpenLink={(l) => getHost().openLink(l)}
                styleId={pinnedStyle ?? style}
                {...(snap ? { snapGrid: SNAP_GRID } : {})}
                onCldEdges={handleCldEdges}
                onViewPositionsChange={setMovedPositions}
                onViewLabelMovesChange={setMovedLabels}
                layoutApiRef={layoutApiRef}
                ignoreSavedPositions={autoArrange}
                externalHighlight={
                  editing
                    ? groupSel.length >= 2
                      ? { nodes: groupSel, edges: [] }
                      : null
                    : (leverageFocus ??
                      (compareId !== null && selection?.kind === 'node'
                        ? { nodes: [selection.id, compareId], edges: [] }
                        : null))
                }
                {...(notation !== undefined ? { notation } : {})}
                {...(viewLayout !== undefined ? { layout: viewLayout } : {})}
                {...(drawings !== undefined ? { drawings } : {})}
                {...(editing
                  ? {
                      mode: 'edit' as const,
                      tool,
                      pen: { ...(penColor !== '' ? { color: penColor } : {}), width: penWidth },
                      // Everything that mutates the model travels as ONE edit object
                      // (the read-only path passes `mode` without it — the view/edit
                      // split is then structural, not by convention).
                      edit: {
                      ...(labelRequest !== undefined ? { editLabelRequest: labelRequest } : {}),
                      ...(threatRequest !== undefined ? { editThreatRequest: threatRequest } : {}),
                      onNoteMoved: (target: ThreatTarget, offset: { dx: number; dy: number }) =>
                        editor.dispatch({ type: 'set-note-offset', target, offset, ...planeOpt }),
                      onToggleNote: (target: ThreatTarget, open: boolean) =>
                        editor.dispatch({ type: 'set-note-open', target, open, ...planeOpt }),
                      onAddThreat: addThreatOn,
                      onRetitleThreat: retitleThreat,
                      onSetThreatStatus: setThreatStatus,
                      onEditThreatText: editThreatText,
                      quickAdd: {
                        label: (id: string) => (model !== undefined ? quickAddLabel(model, id, quickAddCtx) : undefined),
                        run: runQuickAdd,
                      },
                      onNodesMoved: (positions: Record<string, { x: number; y: number }>) =>
                        editor.dispatch({
                          type: 'set-positions',
                          positions,
                          ...(activePlane !== undefined ? { plane: activePlane } : {}),
                        }),
                      onCreateAt: (pos: { x: number; y: number }) => createAt(pos),
                      onImageFiles: (files: File[], position?: { x: number; y: number }) =>
                        void addImages(files, position),
                      onDropLibraryEntry: dropLibraryEntry,
                      onResize: (id: string, w: number, h: number, pos: { x: number; y: number }) => {
                        editor.dispatch({ type: 'set-size', nodeId: id, w, h });
                        // top/left-handle resizes shift the node origin — pin the
                        // post-resize position too, or the next resync snaps it
                        // back by the size delta.
                        editor.dispatch({
                          type: 'set-position',
                          nodeId: id,
                          x: pos.x,
                          y: pos.y,
                          ...(activePlane !== undefined ? { plane: activePlane } : {}),
                        });
                      },
                      onConnect: (from: string, to: string, sourceHandle?: string | null) => {
                        // Dragging from a table column's row handle creates an fk
                        // relation (+ flags the column) instead of the default float
                        // edge. float by default: no pinned sides, so the new edge
                        // tracks the facing borders. Pin later via a pin dot or the
                        // panel. The edge lands on the active sheet (the pen), like
                        // nodes. The kind otherwise comes from the notation and the
                        // two endpoints (connectKind) — a threat model's flows must be
                        // data-flow to be read as flows at all, unless an end is a
                        // trust boundary, which no flow may touch.
                        const m = editor.session?.state.model;
                        const cmds =
                          m !== undefined
                            ? fkConnectionCommands(m, from, to, sourceHandle, penLayer !== null ? { layer: penLayer } : undefined)
                            : null;
                        if (cmds !== null) {
                          for (const c of cmds) editor.dispatch(c);
                          return;
                        }
                        editor.dispatch({
                          type: 'add-relation',
                          from,
                          to,
                          opts: {
                            kind: connectKind(notation, m, from, to),
                            ...(penLayer !== null ? { layer: penLayer } : {}),
                          },
                        });
                      },
                      onDeleteSelection: (sel: { nodeIds: string[]; relationIds: string[] }) => {
                        // peek(): the synchronous session — the gesture must
                        // translate against the model it was made on.
                        const m = editor.peek()?.state.model;
                        const cmd = m !== undefined ? deleteSelectionCommand(m, sel) : null;
                        if (cmd === null) return;
                        editor.dispatch(cmd);
                        select(null); // the panel target is gone
                      },
                      onSetTableColumns: (id: string, columns: Column[]) =>
                        editor.dispatch({ type: 'set-table-columns', id, columns }),
                      onRenameNode: (id: string, name: string) =>
                        editor.dispatch({ type: 'rename-node', id, name }),
                      onSetNodeRich: (id: string, runs: TextRun[]) =>
                        editor.dispatch({ type: 'set-node-rich', id, runs }),
                      onAddEdgeLabel: addEdgeLabelFor,
                      onEditEdgeLabel: editEdgeLabelFor,
                      onMoveEdgeLabel: moveEdgeLabelFor,
                      onReconnect: (
                        relationId: string,
                        from: string,
                        to: string,
                        endPin?: { end: 'from' | 'to'; side: Side | null },
                      ) =>
                        // move the endpoint(s); the dragged end floats (new node) or
                        // pins to the side it was dropped on (same node)
                        editor.dispatch({
                          type: 'update-relation',
                          id: relationId,
                          patch: {
                            from,
                            to,
                            ...(endPin !== undefined ? { style: styleWithSide(relationId, endPin.end, endPin.side) } : {}),
                          },
                        }),
                      onSetEdgeSide: (relationId: string, end: 'from' | 'to', side: Side | null) =>
                        editor.dispatch({
                          type: 'update-relation',
                          id: relationId,
                          patch: { style: styleWithSide(relationId, end, side) },
                        }),
                      onAddStroke: (stroke: Omit<Stroke, 'id'>) => {
                        // peek(): the synchronous session, so two strokes in
                        // quick succession never reuse an id.
                        const d = editor.peek()?.state.drawings;
                        const m = editor.peek()?.state.model;
                        if (d === undefined || m === undefined) return;
                        editor.dispatch({
                          type: 'add-stroke',
                          stroke: { id: uniqueStrokeId(d, layoutPlaneKey(m, activePlane)), ...stroke },
                          ...(activePlane !== undefined ? { plane: activePlane } : {}),
                        });
                      },
                      onDeleteStroke: (id: string) =>
                        editor.dispatch({
                          type: 'delete-stroke',
                          id,
                          ...(activePlane !== undefined ? { plane: activePlane } : {}),
                        }),
                      },
                    }
                  : {})}
              />
              {editing && groupSel.length >= 2 && (
                <button className="chip group-action" onClick={() => void groupSelected()}>
                  ⊞ Group {groupSel.length}
                </button>
              )}
            </div>
            <Dock
              side="right"
              collapsed={rightCollapsed}
              onToggle={() => setRightCollapsed((v) => !v)}
              hasContent
              width={rightWidth}
              minWidth={RIGHT_MIN}
              maxWidth={DOCK_MAX}
              onWidthChange={setRightWidth}
            >
              {editing && notation === 'git-graph' && (
                <GitPanel
                  model={model}
                  plane={activePlane}
                  selection={selection}
                  onCommand={editor.dispatch}
                  onSelect={(id) => select({ kind: 'node', id })}
                />
              )}
              {editing && notation === 'second-order' && (
                <SecondOrderPanel
                  model={model}
                  selection={selection}
                  {...(activePlane !== undefined && !activePlaneBorrowsContainment ? { plane: activePlane } : {})}
                  onCommand={editor.dispatch}
                  onSelect={(id) => select({ kind: 'node', id })}
                  onCreated={requestLabelEdit}
                />
              )}
              {editing && notation === 'fishbone' && (
                <FishbonePanel
                  model={model}
                  selection={selection}
                  {...(activePlane !== undefined && !activePlaneBorrowsContainment ? { plane: activePlane } : {})}
                  onCommand={editor.dispatch}
                  onSelect={(id) => select({ kind: 'node', id })}
                  onCreated={requestLabelEdit}
                />
              )}
              {/* No `editing` gate, unlike its siblings above: this panel only
                  reads the model — the register and the crossings still to
                  review are as much use on a read-only .diagram.ts threat model
                  as on an editable one. */}
              {notation === TM_NOTATION && (
                <ThreatModelPanel
                  model={model}
                  {...(activePlane !== undefined ? { plane: activePlane } : {})}
                  onSelect={select}
                />
              )}
              {editing && (
                <ActivityPanel
                  model={model}
                  plane={activePlane}
                  selection={selection}
                  onCommand={editor.dispatch}
                  onSelect={(id) => select({ kind: 'node', id })}
                />
              )}
              <LayersPlanesPanel
                model={model}
                onCommand={editor.dispatch}
                mode={editing ? 'edit' : 'view'}
                activeLayer={penLayer}
                onActivateLayer={activateLayer}
                activePlane={activePlane}
                onSelectPlane={(id) => (id === undefined ? resetView() : switchPlane(id))}
                activeLayers={activeLayers}
                onToggleLayer={toggleLayer}
                onMergeLayers={mergeSelectedLayers}
              />
            </Dock>
          </>
        )}
      </main>
    </div>
  );
}