import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTheme,
  darkTheme,
  DiagramView,
  isKnownStyle,
  lightTheme,
  STYLE_PRESETS,
  type DiagramSelection,
  type LoopEdgeInput,
  type Side,
} from '@diagramming/renderer';
import {
  BUILTIN_NOTATIONS,
  emptyLayout,
  errMessage,
  layoutPlaneKey,
  SOURCE_URL,
  type Column,
  type DiagramModel,
  type EdgeLabelSide,
  type LayoutSettings,
  type NotationId,
  type RelationStyle,
  type TextRun,
} from '@diagramming/core';
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
import { withSavedPositions } from './savedPositions';
import { uploadAsset } from './editor/images';
import { NodePanel } from './editor/NodePanel';
import { EdgePanel } from './editor/EdgePanel';
import { LeveragePanel, type LeverageFocus } from './LeveragePanel';
import { LayersPlanesPanel } from './editor/LayersPlanesPanel';
import { InspectorTabs, type InspectorTab } from './editor/InspectorTabs';
import { Dock } from './Dock';
import { clampDockWidth } from './dockWidth';
import { Sidebar } from './Sidebar';
import { LibraryPanel } from './library/LibraryPanel';
import { useLibrary } from './library/useLibrary';
import { uniqueLibraryId } from './library/entry';
import { fkConnectionCommands } from './tableConnect';

const STYLE_KEY = 'diagramming.style';
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

export function App() {
  const boot = useDiagramBoot();
  const { artifacts, names, booted, ownedNames, setOwnedNames, setDrafts, setLoaded, setSources, canDesign } = boot;

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [style, setStyle] = usePersistedState<string>(STYLE_KEY, 'clean', (raw) => raw);
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
  const [savingPositions, setSavingPositions] = useState(false);
  // Hand back a hand-positioned plane to the layout algorithm for this view only.
  // Saved coordinates otherwise beat every algorithm, so a diagram that has been
  // placed by hand stops responding to the picker entirely. Viewer state, like
  // pins and the layout preview: never written, and dropped when the diagram
  // changes so one diagram's choice cannot silently govern the next.
  const [autoArrange, setAutoArrange] = useState(false);
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  // Edit mode: variables shift-selected to be grouped into one abstract variable.
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const groupToggle = (id: string) =>
    setGroupSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
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
  // Both are read through refs by the listeners and assigned on every render.
  const addNodeRef = useRef<() => void>(() => {});
  const leaveEditRef = useRef<() => boolean>(() => true);

  const dl = useDeepLink({ names, booted, leaveEditRef });
  const { selected, setSelected, enteredPath, setEnteredPath, handleEnteredPathChange } = dl;
  const drillRoot = enteredPath.length > 0 ? enteredPath[enteredPath.length - 1] : undefined;

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

  const edit = useEditSession({
    setDrafts,
    resetInspector: () => setLeftTab('properties'), // re-entering edit starts on Properties
    addNodeRef,
    leaveEditRef,
  });
  const { editing, setEditing, editor, layoutApiRef, saveIssues, setSaveIssues, saving, doSave, enterEdit, leaveEdit } = edit;

  useEffect(() => {
    applyTheme(document.documentElement, theme === 'dark' ? darkTheme : lightTheme);
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const current = artifacts[selected];
  const session = editor.session;
  const model = editing ? session?.state.model : current?.model;
  const layout = editing ? session?.state.layout : current?.layout;
  // A diagram-pinned style (known preset only) outranks the app preference;
  // unknown pinned ids behave as unpinned so retired presets never wedge a file.
  const pinnedStyle = model?.style !== undefined && isKnownStyle(model.style) ? model.style : undefined;
  const planes = model?.planes ?? [];
  // undefined = the base/default view (no plane overlay, no notation). Kept
  // distinct from planes[0] so the Default chip stays reachable once planes exist.
  const activePlane = plane;
  const activeNotation = planes.find((p) => p.id === activePlane)?.notation;
  const notation = (BUILTIN_NOTATIONS as readonly string[]).includes(activeNotation ?? '')
    ? (activeNotation as NotationId)
    : undefined;
  // A borrowing plane's node membership resolves to its base plane
  // (compileView/resolveContainmentPlane), so tagging node.plane with the
  // borrowing plane's own id would mismatch and the node would silently
  // vanish. Stage 1 disables plane-scoped membership editing there — new
  // nodes are added shared instead (see createNodeAt).
  const activePlaneBorrowsContainment = planes.find((p) => p.id === activePlane)?.containmentOf !== undefined;

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
    setLeftTab,
    setLeverageFocus,
    setCompareId,
    setGroupSel,
    setPlane,
    setPins,
    setLayoutPreview,
    setActiveLayers,
    setActiveLayer,
  });
  const { select, switchPlane, activateLayer, toggleLayer, mergeSelectedLayers, togglePin, toggleExpand, resetView } = view;
  const { compareSelect, groupSelected } = view;

  // Diagram lifecycle: create + rename (the flows that re-key the artifact store).
  const actions = useDiagramActions({
    editing,
    selected,
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

  // Flip the active plane between automatic and manual layout. Turning auto Off
  // freezes the current on-screen positions (so nothing jumps) then sets the
  // manual flag; turning it On just clears the flag (non-destructive — the pins
  // stay, but automatic layout resumes driving the arrangement).
  const toggleAutoLayout = () => {
    if (editor.session?.state.model === undefined) return;
    const planeOpt = activePlane !== undefined ? { plane: activePlane } : {};
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

  // Write the hand-placed positions to `<name>.layout.json` and fold them into
  // the in-memory overlay, so they survive a plane switch (which drops the
  // renderer's ephemeral drags) without a reload. Explicit, never automatic —
  // DEFERRALS.md keeps "no autosave" deliberate, and this writes a repo file.
  const savePositions = useCallback(async () => {
    if (model === undefined || Object.keys(movedPositions).length === 0) return;
    const next = withSavedPositions(layout, model, activePlane, movedPositions);
    setSavingPositions(true);
    try {
      const res = await fetch(`/api/layouts/${selected}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = (await res.json()) as { issues?: { message: string }[] };
        setSaveIssues(body.issues ?? [{ message: 'Could not save positions' }]);
        return;
      }
      setLoaded((cur) => {
        const entry = cur[selected];
        return entry === undefined ? cur : { ...cur, [selected]: { ...entry, layout: next } };
      });
      setMovedPositions({});
      setSaveIssues(null);
    } finally {
      setSavingPositions(false);
    }
  }, [model, movedPositions, layout, activePlane, selected, setLoaded, setSaveIssues]);

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
        <span className="spacer" />
        {model !== undefined &&
          (ownedNames.has(selected) ? (
            !editing && (
              <button
                className="chip"
                onClick={() => {
                  // Edit mode reads the session's own overlay, not the preview — drop
                  // it here (mirroring resetView() on the diagram picker) so Save +
                  // Done doesn't come back to a stale preview masking what was saved.
                  setLayoutPreview({});
                  enterEdit(selected, current?.model as DiagramModel, current?.layout ?? emptyLayout());
                }}
              >
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
            <LayoutControls settings={activePlaneSettings} onChange={previewLayoutSettings} />
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
            {Object.keys(movedPositions).length > 0 && (
              <button
                className="chip primary"
                disabled={savingPositions}
                title="Write the boxes you moved to this diagram's layout file. Safe on a generated diagram: re-compiling rewrites the model, never the positions."
                onClick={() => void savePositions()}
              >
                {savingPositions ? 'Saving…' : 'Save positions'}
              </button>
            )}
          </>
        )}
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
          onSetLayoutSettings={setLayoutSettings}
          selectionColor={selectionColor}
        />
      )}
      {names.length === 0 && (
        <div className="banner">
          No artifacts found — run <code>pnpm compile</code> (or <code>pnpm compile:watch</code>) first.
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
                        hasPin={layout?.planes[layoutPlaneKey(model, activePlane)]?.[selection.id] !== undefined}
                        autoFocusName={selection.id === renameId}
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
                      assetBase="/api/assets/"
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
                onTogglePin={togglePin}
                onToggleExpand={toggleExpand}
                onSelect={select}
                onEnteredPathChange={handleEnteredPathChange}
                enteredPath={enteredPath}
                onCompareSelect={compareSelect}
                colorMode={theme}
                assetBase="/api/assets/"
                styleId={pinnedStyle ?? style}
                onCldEdges={handleCldEdges}
                onViewPositionsChange={setMovedPositions}
                ignoreSavedPositions={autoArrange}
                externalHighlight={
                  editing
                    ? groupSel.length > 0
                      ? { nodes: groupSel, edges: [] }
                      : null
                    : (leverageFocus ??
                      (compareId !== null && selection?.kind === 'node'
                        ? { nodes: [selection.id, compareId], edges: [] }
                        : null))
                }
                {...(notation !== undefined ? { notation } : {})}
                {...(viewLayout !== undefined ? { layout: viewLayout } : {})}
                {...(editing
                  ? {
                      mode: 'edit' as const,
                      layoutApiRef,
                      // Everything that mutates the model travels as ONE edit object
                      // (the read-only path passes `mode` without it — the view/edit
                      // split is then structural, not by convention).
                      edit: {
                      onGroupToggle: groupToggle,
                      onNodeMoved: (id: string, pos: { x: number; y: number }) =>
                        editor.dispatch({
                          type: 'set-position',
                          nodeId: id,
                          x: pos.x,
                          y: pos.y,
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
                        // nodes.
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
                          opts: { kind: 'sync', ...(penLayer !== null ? { layer: penLayer } : {}) },
                        });
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
                      },
                    }
                  : {})}
              />
              {editing && groupSel.length >= 2 && (
                <button className="chip group-action" onClick={groupSelected}>
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