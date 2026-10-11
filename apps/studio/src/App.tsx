import { useMemo, useRef } from 'react';
import {
  DiagramView,
  isKnownStyle,
  LeveragePanel,
  notationProfile,
  STYLE_PRESETS,
  todayIso,
  type CanvasCommands,
  type DiagramSelection,
} from '@diagc/renderer';
import {
  errMessage,
  defaultLayoutDirection,
  layoutPlaneKey,
  SOURCE_URL,
  uniqueSlug,
  type DiagramModel,
  type LayoutSettings,
} from '@diagc/core/internal';
import { getHost } from './host';
import { useDiagramBoot } from './diagrams/useDiagramBoot';
import { useDeepLink } from './diagrams/useDeepLink';
import { useEditSession } from './session/useEditSession';
import { SNAP_GRID, useViewerPrefs } from './useViewerPrefs';
import { useClipboard } from './canvas-editing/useClipboard';
import { useCanvasEditing } from './canvas-editing/useCanvasEditing';
import { useDiagramActions } from './diagrams/useDiagramActions';
import { useViewNavigation } from './view/useViewNavigation';
import { useCanvasSelection } from './view/useCanvasSelection';
import { useViewArrangement } from './layout/useViewArrangement';
import { useDiagramView } from './diagrams/useDiagramView';
import { useCausalLoopAnalysis } from './notations/causal-loop/useCausalLoopAnalysis';
import { DiagramPicker } from './diagrams/DiagramPicker';
import { downloadPng } from './diagrams/downloadPng';
import { EditorToolbar } from './canvas-editing/EditorToolbar';
import { EditLayoutActions, relayoutPlane } from './layout/LayoutActions';
import { LayoutPanel } from './layout/LayoutPanel';
import { MenuButton, type MenuItem } from './MenuButton';
import { uploadAsset } from './canvas-editing/images';
import { NodePanel } from './inspector/NodePanel';
import { EdgePanel } from './inspector/EdgePanel';
import { LayersPlanesPanel } from './view/LayersPlanesPanel';
import { studioNotation } from './notations';
import { dockPanels } from './dock/features';
import { InspectorTabs } from './inspector/InspectorTabs';
import { Dock } from './dock/Dock';
import { DOCK_MAX, LEFT_MIN, RIGHT_MIN, useDockLayout } from './dock/useDockLayout';
import { Sidebar } from './inspector/Sidebar';
import { LibraryPanel } from './library/LibraryPanel';
import { useLibrary } from './library/useLibrary';
import type { ActionId } from './hotkeys/actions';
import { HotkeysContext, keyHint, keyName } from './hotkeys/HotkeysContext';
import { HotkeysDialog } from './hotkeys/HotkeysDialog';
import { useHotkeyPrefs } from './hotkeys/useHotkeyPrefs';
import { useHotkeys, type Handlers } from './hotkeys/useHotkeys';
import { useDrawTool } from './canvas-editing/useDrawTool';

// The Apply-target for a selected node (LibraryPanel restyle toggle); undefined
// when nothing is selected (hides the toggle).
const applyTargetFor = (
  model: DiagramModel,
  selection: DiagramSelection | null,
): { id: string; name: string } | undefined => {
  if (selection?.kind !== 'node') return undefined;
  const n = model.nodes.find((x) => x.id === selection.id);
  return n !== undefined ? { id: n.id, name: n.name || n.id } : undefined;
};

/** `initialTheme` lets a host seed the color scheme (the Obsidian pane passes
 * the vault's); the browser studio keeps its dark default. A seed only — the
 * in-app toggle owns the state from mount on. */
export function App({ initialTheme = 'dark' }: { initialTheme?: 'light' | 'dark' } = {}) {
  const boot = useDiagramBoot();
  const { artifacts, names, booted, ownedNames, canDesign } = boot;

  const { theme, toggleTheme, style, setStyle, snap, toggleSnap } = useViewerPrefs(initialTheme);
  const hotkeyPrefs = useHotkeyPrefs();
  const { keymap, mac } = hotkeyPrefs;
  const appRef = useRef<HTMLDivElement>(null);
  const canvasCommandsRef = useRef<CanvasCommands | null>(null);
  const pickerToggleRef = useRef<(() => void) | null>(null);
  const hotkeyHandlers = useRef<Handlers>({});
  const dock = useDockLayout();
  const { leftTab, selectTab, libraryView } = dock;
  const lib = useLibrary();

  // Read through a ref by a once-subscribed listener, and assigned on every
  // render: leaveEditRef is the hashchange listener's cross-diagram edit close
  // and resetViewRef its view reset (both useDeepLink). The keyboard needs
  // none — see the hotkeys block above the JSX, which runs after everything it
  // calls exists.
  const leaveEditRef = useRef<() => boolean>(() => true);
  const resetViewRef = useRef<() => void>(() => {});

  const dl = useDeepLink({ names, booted, leaveEditRef, resetViewRef });
  const { selected, enteredPath, handleEnteredPathChange } = dl;
  const drillRoot = enteredPath.length > 0 ? enteredPath[enteredPath.length - 1] : undefined;

  const edit = useEditSession({
    store: boot,
    resetInspector: () => selectTab('properties'), // re-entering edit starts on Properties
    leaveEditRef,
  });
  const { editing, editor, layoutApiRef, saveIssues, reportIssues, saving, doSave, enterEdit, leaveEdit } = edit;
  const { tool, penColor, penWidth, setTool, setPen, drawWith } = useDrawTool({ editing, selected, enteredPath });

  // Three hooks here hand a callback to a hook declared after them, because that
  // hook reads their values: entering edit and a view reset drop the
  // arrangement's layout preview, and a selection move drops the loop
  // analysis's focus. The callbacks run only from events and effects, by which
  // time this render has declared `arrangement` and `loops`.
  const { current, session, model, layout, drawings, enterEditFromSource } = useDiagramView({
    artifacts,
    selected,
    editing,
    editor,
    enterEdit,
    reportIssues,
    dropLayoutPreview: () => arrangement.dropPreview(),
  });
  // The diagram's style (a known preset only) outranks the app preference; an
  // unknown style id counts as none, so a retired preset never wedges a file.
  const diagramStyle = model?.style !== undefined && isKnownStyle(model.style) ? model.style : undefined;

  const canvasSelection = useCanvasSelection({
    editing,
    lastRelation: session?.lastRelation,
    onSelect: () => loops.dropFocus(),
  });
  const { selection, renameId, groupSel, select, multiSelect, requestLabelEdit } = canvasSelection;

  // Plane, layer and fold navigation (plane switching, pen sheets, view reset).
  const nav = useViewNavigation({
    model,
    layout,
    editing,
    editor,
    selected,
    select,
    onReset: () => arrangement.dropPreview(),
  });
  const { activePlane, notation, activePlaneBorrowsContainment, activePlaneManual, penLayer } = nav;
  const { activeLayers, pins, switchPlane, activateLayer, toggleLayer, mergeSelectedLayers, toggleExpand, resetView } =
    nav;
  resetViewRef.current = resetView;

  // what the notation adds: its dock panel, the gestures it reads its own way,
  // the kind a connect draws, the loop analysis (see notations/types)
  const studioProfile = studioNotation(notation);
  // the host's calendar date: a plan plane's today line, and where a quick-add
  // or a library drop with no other anchor lands.
  const today = todayIso();
  // elk partitions (second-order's order bands) are a layered-only feature, and
  // the renderer already forces layered for a partitioned profile — so the
  // algorithm picker would only ever offer a choice the run ignores. Reaches
  // the dock's Layout & style section, which serves both modes.
  const algorithmLocked = notationProfile(notation).partitionOf !== undefined;
  const loops = useCausalLoopAnalysis({
    editing,
    loopAnalysis: studioProfile.loopAnalysis === true,
    selection,
    groupSel,
  });

  // Ctrl/⌘+C / Ctrl/⌘+V on the canvas (edit mode): the selection, with what it
  // contains, through the system clipboard — see canvas-editing/useClipboard.
  useClipboard({
    editing,
    editor,
    layoutApiRef,
    activePlane,
    activePlaneBorrowsContainment,
    activePlaneManual,
    penLayer,
    selection,
    multiSelection: groupSel,
    select,
  });

  // What edit mode does from the canvas and its palettes: placing nodes, the
  // canvas's edit callbacks, and what the keys share with them.
  const canvasEditing = useCanvasEditing({
    session: edit,
    model,
    layout,
    nav,
    selection: canvasSelection,
    selectTab,
    lib,
    drillRoot,
    today,
  });
  const { notes, placement } = canvasEditing;
  const { addNode, placeFromLibrary, applyFromLibrary, addImages } = placement;

  // Diagram lifecycle: create + rename + duplicate (the flows that re-key the
  // artifact store).
  const actions = useDiagramActions({
    editing,
    selected,
    current,
    names,
    ownedNames,
    store: boot,
    selectDiagram: dl.selectDiagram,
    renameSelected: dl.renameSelected,
    startEditing: edit.startEditing,
    leaveEdit,
    resetView,
  });

  // Import a user icon into a library category: upload the file, then add it
  // as a new placeable entry (a fresh image-typed template).
  const importLibraryIcon = async (categoryId: string, file: File) => {
    try {
      const image = await uploadAsset(file);
      const id = uniqueSlug(file.name, new Set(lib.library.entries.map((e) => e.id)), 'icon');
      const name = file.name.replace(/\.[^.]*$/, '') || 'icon';
      lib.addEntry({ id, category: categoryId, name, template: { type: 'image', image, width: 64, height: 64 } });
    } catch (e) {
      reportIssues([{ message: errMessage(e) }]);
    }
  };

  // Import a user shape (SVG silhouette) into a library category: same upload
  // flow as importLibraryIcon, but the template carries no width/height — a
  // shape sizes to the node instead of forcing a fixed footprint.
  const importLibraryShape = async (categoryId: string, file: File) => {
    try {
      const shape = await uploadAsset(file);
      const id = uniqueSlug(file.name, new Set(lib.library.entries.map((e) => e.id)), 'shape');
      const name = file.name.replace(/\.[^.]*$/, '') || 'shape';
      lib.addEntry({ id, category: categoryId, name, template: { shape } });
    } catch (e) {
      reportIssues([{ message: errMessage(e) }]);
    }
  };

  // How the diagram is arranged in view mode, and the chips that save it.
  const arrangement = useViewArrangement({
    model,
    layout,
    editing,
    selected,
    activePlane,
    activePlaneManual,
    pins,
    savedUnfoldedKey: nav.savedUnfoldedKey,
    layoutApiRef,
    putLayout: boot.putLayout,
    reportIssues,
  });
  const { viewLayout, savingPositions, autoArrange, unsavedView, savePositions, toggleFreeze } = arrangement;
  // The active plane's automatic-layout settings (algorithm/direction/spacing/
  // edge routing); empty ⇒ tuned defaults. Drives the layout picker in both modes.
  const activePlaneSettings: LayoutSettings =
    (model !== undefined ? viewLayout?.settings?.[layoutPlaneKey(model, activePlane)] : undefined) ?? {};

  // The node panel's position inputs: the selected node's saved position on
  // this plane, and where it sits on screen.
  const savedPosition =
    selection?.kind === 'node' && model !== undefined
      ? layout?.planes[layoutPlaneKey(model, activePlane)]?.[selection.id]
      : undefined;
  const live =
    selection?.kind === 'node' && model !== undefined
      ? layoutApiRef.current?.snapshotPositions()[selection.id]
      : undefined;

  // What each hotkey does right now (hotkeys/useHotkeys reads this ref on every
  // key). The rule: a handler is present exactly while its button would be shown
  // and enabled, so a key can never do what the UI would refuse — and a key with
  // no handler keeps whatever meaning the browser gives it. Placed last because it
  // draws on nearly everything above.
  const on = <T,>(cond: boolean, fn: T): T | undefined => (cond ? fn : undefined);
  const owned = ownedNames.has(selected);
  const viewChips = !editing && model !== undefined;
  const hasSavedPositions =
    model !== undefined && Object.keys(layout?.planes[layoutPlaneKey(model, activePlane)] ?? {}).length > 0;
  const canvasCmd = (run: (c: CanvasCommands) => boolean) =>
    on(model !== undefined, () => (canvasCommandsRef.current !== null ? run(canvasCommandsRef.current) : false));
  hotkeyHandlers.current = {
    'diagram.picker': () => pickerToggleRef.current?.(),
    'diagram.toggle-edit': on(model !== undefined && owned, () => void (editing ? leaveEdit() : enterEditFromSource())),
    'diagram.rename': on(canDesign && !editing && owned, () => void actions.renameDiagram()),
    'diagram.new': on(canDesign, () => void actions.newDiagram()),
    'diagram.duplicate': on(canDesign && viewChips, () => void actions.duplicateDiagram()),
    'diagram.eject': on(canDesign && !editing && owned, () => void actions.ejectDiagram()),

    'edit.add-node': on(editing, () => addNode()),
    'edit.add-child': on(editing, () => (selection?.kind === 'node' ? canvasEditing.runQuickAdd(selection.id) : false)),
    'edit.undo': on(editing, () => editor.undo()),
    'edit.redo': on(editing, () => editor.redo()),
    'edit.save': on(editing, () => void doSave()),
    'edit.group': on(editing && groupSel.length >= 2, () => void canvasEditing.groupSelected()),
    'edit.relayout': on(
      editing,
      () =>
        void relayoutPlane(editor, {
          autoLayout: !activePlaneManual,
          activePlane,
          getAutoPositions: () => layoutApiRef.current?.autoPositions() ?? {},
        }),
    ),
    'edit.toggle-auto-layout': on(editing, canvasEditing.toggleAutoLayout),
    'edit.toggle-notes': on(editing && notes.offered && notes.anyThreats, notes.toggleAll),

    'tool.select': on(editing, () => setTool('select')),
    'tool.pen': on(editing, drawWith('pen')),
    'tool.eraser': on(editing, drawWith('eraser')),
    'pen.thin': on(editing && tool === 'pen', () => setPen({ width: 2 })),
    'pen.medium': on(editing && tool === 'pen', () => setPen({ width: 3 })),
    'pen.thick': on(editing && tool === 'pen', () => setPen({ width: 6 })),

    'canvas.fit': canvasCmd((c) => c.fitView()),
    'canvas.zoom-in': canvasCmd((c) => c.zoomIn()),
    'canvas.zoom-out': canvasCmd((c) => c.zoomOut()),
    'canvas.laser': canvasCmd((c) => c.toggleLaser()),
    'canvas.legend': canvasCmd((c) => c.toggleLegend()),
    'canvas.dim': canvasCmd((c) => c.toggleDim()),
    'canvas.drawings': canvasCmd((c) => c.toggleDrawings()),
    'canvas.loops': canvasCmd((c) => c.toggleLoops()),
    'view.freeze': on(viewChips && !savingPositions && enteredPath.length === 0, () => void toggleFreeze()),
    'view.save-positions': on(viewChips && unsavedView && !savingPositions, () => void savePositions()),
    'view.auto-arrange': on(viewChips && hasSavedPositions, arrangement.toggleAutoArrange),

    'arrange.align-left': canvasCmd((c) => c.align('left')),
    'arrange.align-center': canvasCmd((c) => c.align('centerX')),
    'arrange.align-right': canvasCmd((c) => c.align('right')),
    'arrange.align-top': canvasCmd((c) => c.align('top')),
    'arrange.align-middle': canvasCmd((c) => c.align('middle')),
    'arrange.align-bottom': canvasCmd((c) => c.align('bottom')),
    'arrange.distribute-x': canvasCmd((c) => c.distribute('x')),
    'arrange.distribute-y': canvasCmd((c) => c.distribute('y')),

    'window.left-dock': on(model !== undefined, dock.toggleLeft),
    'window.right-dock': on(model !== undefined, dock.toggleRight),
    'window.inspector-properties': on(editing, () => dock.showInspectorTab('properties')),
    'window.inspector-library': on(editing, () => dock.showInspectorTab('library')),
    'window.theme': toggleTheme,
    'window.snap': toggleSnap,
    'window.hotkeys': hotkeyPrefs.openDialog,
  };
  useHotkeys({
    rootRef: appRef,
    keymap,
    mode: editing ? 'edit' : 'view',
    handlersRef: hotkeyHandlers,
    suspended: hotkeyPrefs.dialogOpen,
    mac,
  });
  const hint = (id: ActionId) => keyHint(keymap, id, mac);
  // The topbar's ⋯ menu. Each row keeps the condition its chip had: a diagram
  // compiled from TypeScript has no source here to rename or eject, only a
  // model to copy.
  const diagramMenu: MenuItem[] = [
    ...(owned
      ? [
          {
            id: 'rename',
            label: 'Rename',
            title: `Rename this diagram${hint('diagram.rename')}`,
            onSelect: () => void actions.renameDiagram(),
          },
        ]
      : []),
    ...(model !== undefined
      ? [
          {
            id: 'export-png',
            label: 'Export PNG',
            title: 'Save the canvas as drawn — folds, layers, theme and drawings — as a PNG image',
            onSelect: () => void downloadPng(layoutApiRef.current, selected ?? ''),
          },
          {
            id: 'duplicate',
            label: 'Duplicate',
            title: `Copy this diagram — layout and all — to a new editable one and open it${hint('diagram.duplicate')}`,
            onSelect: () => void actions.duplicateDiagram(),
          },
        ]
      : []),
    ...(owned
      ? [
          {
            id: 'eject',
            label: 'Eject',
            title: `Promote this diagram to a TypeScript source — it becomes read-only here${hint('diagram.eject')}`,
            onSelect: () => void actions.ejectDiagram(),
          },
        ]
      : []),
  ];
  const hotkeysContext = useMemo(() => ({ keymap, mac }), [keymap, mac]);
  const canvasKeyHints = useMemo(
    () => ({
      laser: keyName(keymap, 'canvas.laser', mac),
      dim: keyName(keymap, 'canvas.dim', mac),
      legend: keyName(keymap, 'canvas.legend', mac),
      drawings: keyName(keymap, 'canvas.drawings', mac),
      loops: keyName(keymap, 'canvas.loops', mac),
    }),
    [keymap, mac],
  );

  return (
    <HotkeysContext.Provider value={hotkeysContext}>
      <div className="app" ref={appRef}>
        <header className="topbar">
          {/* One row that has to fit a narrow Obsidian pane as well as a wide
            window: what names the diagram on the left, what must be SEEN (an
            unsaved arrangement) and the viewer's toggles on the right. Layout
            and style live in the right dock's Layout & style section; the brand
            is the first thing to give way (app.css). */}
          <strong className="brand">diagc studio</strong>
          <DiagramPicker
            names={names}
            selected={selected}
            onSelect={(name) => {
              if (!leaveEdit()) return;
              dl.selectDiagram(name);
              resetView();
            }}
            toggleRef={pickerToggleRef}
          />
          {canDesign && (
            <button
              type="button"
              className="chip icon"
              aria-label="New diagram"
              title={`New diagram${hint('diagram.new')}`}
              onClick={() => void actions.newDiagram()}
            >
              ＋
            </button>
          )}
          {canDesign && !editing && (
            <MenuButton label="Diagram actions" items={diagramMenu}>
              ⋯
            </MenuButton>
          )}
          {model !== undefined &&
            (owned ? (
              !editing && (
                <button
                  className="chip"
                  onClick={() => void enterEditFromSource()}
                  title={`Edit this diagram${hint('diagram.toggle-edit')}`}
                >
                  Edit
                </button>
              )
            ) : (
              <span className="chip read-only" title="Compiled from TypeScript — edit the source">
                read-only
              </span>
            ))}
          <span className="spacer" />
          {/* Stays up here, unlike the other layout chips: it appears only when
            there is something to lose, and a folded dock must not hide that. */}
          {!editing && model !== undefined && unsavedView && (
            <button
              className="chip primary"
              disabled={savingPositions}
              title={`Write the boxes and edge labels you moved, and which groups are open, to this diagram's layout file. Safe on a generated diagram: re-compiling rewrites the model, never the layout.${hint('view.save-positions')}`}
              onClick={() => void savePositions()}
            >
              {savingPositions ? 'Saving…' : 'Save positions'}
            </button>
          )}
          {/* Edit-mode only: opening every bubble is a command on the undo stack,
            saved in the layout file so the published page and the PNG agree —
            in view mode there is no session to dispatch into (there the badge
            toggles for the session). */}
          {editing && notes.offered && (
            <button
              type="button"
              className={`chip${notes.allOpen ? ' active' : ''}`}
              aria-pressed={notes.allOpen}
              // an empty register has nothing to open: the command would push an
              // undo step and an autosave that change nothing
              disabled={!notes.anyThreats}
              title={`${notes.allOpen ? 'Close all threat notes' : 'Open all threat notes'}${hint('edit.toggle-notes')}`}
              onClick={notes.toggleAll}
            >
              Notes
            </button>
          )}
          <span className="sep" />
          <button
            type="button"
            className={`chip icon${snap ? ' active' : ''}`}
            aria-label="Snap to grid"
            aria-pressed={snap}
            title={`${
              snap
                ? `Snapping to a ${SNAP_GRID}px grid. Click to place boxes freely.`
                : `Snap dragged boxes to a ${SNAP_GRID}px grid; arrow keys step by it too.`
            }${hint('window.snap')}`}
            onClick={toggleSnap}
          >
            ⋮⋮
          </button>
          <button
            type="button"
            className="chip icon"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={`${theme === 'dark' ? 'Light theme' : 'Dark theme'}${hint('window.theme')}`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button
            ref={hotkeyPrefs.gearRef}
            type="button"
            className="chip icon"
            aria-label="Keyboard shortcuts"
            title={`Keyboard shortcuts${hint('window.hotkeys')}`}
            onClick={hotkeyPrefs.openDialog}
          >
            ⚙
          </button>
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
            onExit={leaveEdit}
            onSave={() => void doSave()}
            saving={saving}
            saveIssues={saveIssues}
            selectionColor={canvasEditing.selectionColor}
            tool={tool}
            onSetTool={setTool}
            pen={{ color: penColor, width: penWidth }}
            onSetPen={setPen}
            drawingDisabled={enteredPath.length > 0}
          />
        )}
        {names.length === 0 && (
          <div className="banner">
            {canDesign ? (
              // The API is up, so creating is possible — telling an Obsidian (or
              // fresh-checkout) user to run diagc compile here points at a build
              // step their empty workspace doesn't need.
              <>
                No diagrams yet — use <b>New diagram</b> to create one.
              </>
            ) : (
              <>
                No artifacts found — run <code>diagc compile</code> (or <code>diagc watch</code>) first.
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
        {/* enterEditFromSource's catch path and a failed position save set
          saveIssues without ever setting editing — the toolbar's own banner
          (below) only renders while editing, so view mode needs its own surface. */}
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
                collapsed={dock.leftCollapsed}
                onToggle={dock.toggleLeft}
                hasContent={editing ? true : selection !== null}
                width={dock.leftWidth}
                minWidth={LEFT_MIN}
                maxWidth={DOCK_MAX}
                onWidthChange={dock.setLeftWidth}
              >
                {editing ? (
                  <InspectorTabs
                    activeTab={leftTab}
                    onTabChange={selectTab}
                    properties={
                      selection?.kind === 'node' && model.nodes.some((n) => n.id === selection.id) ? (
                        <NodePanel
                          key={selection.id}
                          model={model}
                          nodeId={selection.id}
                          activePlane={activePlane}
                          hasSavedPosition={savedPosition !== undefined}
                          savedPosition={savedPosition}
                          live={live}
                          autoFocusName={selection.id === renameId}
                          notation={notation}
                          today={today}
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
                          notation={notation}
                          activePlane={activePlane}
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
                        applyTarget={applyTargetFor(model, selection)}
                        onAddNode={addNode}
                        onAddImages={(files) => void addImages(files)}
                        onAddCategory={lib.addCategory}
                        onDeleteCategory={lib.deleteCategory}
                        onImportIcon={(categoryId, file) => void importLibraryIcon(categoryId, file)}
                        onImportShape={(categoryId, file) => void importLibraryShape(categoryId, file)}
                        assetBase={getHost().assetBase}
                        viewState={libraryView}
                      />
                    }
                  />
                ) : studioProfile.loopAnalysis === true &&
                  selection?.kind === 'node' &&
                  model.nodes.some((n) => n.id === selection.id) ? (
                  <LeveragePanel
                    key={selection.id}
                    model={model}
                    edges={loops.cldEdges}
                    target={selection.id}
                    activeFocusKey={loops.leverageFocus?.key ?? null}
                    onFocus={loops.focusLeverage}
                    onClose={() => select(null)}
                    compareId={loops.compareId}
                    onClearCompare={loops.clearCompare}
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
                  today={today}
                  activeLayers={activeLayers}
                  onToggleLayer={toggleLayer}
                  pins={pins}
                  onToggleExpand={toggleExpand}
                  onSelect={select}
                  onMultiSelect={multiSelect}
                  onEnteredPathChange={handleEnteredPathChange}
                  enteredPath={enteredPath}
                  onCompareSelect={loops.compareSelect}
                  colorMode={theme}
                  assetBase={getHost().assetBase}
                  libraryBase={getHost().libraryBase}
                  onOpenLink={(l) => getHost().openLink(l)}
                  styleId={diagramStyle ?? style}
                  snapGrid={snap ? SNAP_GRID : undefined}
                  onCldEdges={loops.handleCldEdges}
                  onViewPositionsChange={arrangement.setMovedPositions}
                  onViewLabelMovesChange={arrangement.setMovedLabels}
                  layoutApiRef={layoutApiRef}
                  canvasCommandsRef={canvasCommandsRef}
                  builtinKeys={false}
                  keyHints={canvasKeyHints}
                  ignoreSavedPositions={autoArrange}
                  externalHighlight={loops.externalHighlight}
                  notation={notation}
                  layout={viewLayout}
                  drawings={drawings}
                  {...(editing
                    ? {
                        mode: 'edit' as const,
                        tool,
                        pen: { ...(penColor !== '' ? { color: penColor } : {}), width: penWidth },
                        // Everything that mutates the model travels as ONE edit object
                        // (the read-only path passes `mode` without it — the view/edit
                        // split is then structural, not by convention).
                        edit: canvasEditing.edit,
                      }
                    : {})}
                />
                {editing && groupSel.length >= 2 && (
                  <button
                    className="chip group-action"
                    title={`Group the selection${hint('edit.group')}`}
                    onClick={() => void canvasEditing.groupSelected()}
                  >
                    ⊞ Group {groupSel.length}
                  </button>
                )}
              </div>
              <Dock
                side="right"
                collapsed={dock.rightCollapsed}
                onToggle={dock.toggleRight}
                hasContent
                width={dock.rightWidth}
                minWidth={RIGHT_MIN}
                maxWidth={DOCK_MAX}
                onWidthChange={dock.setRightWidth}
              >
                {dockPanels(studioProfile.dock, {
                  model,
                  editing,
                  viewPlane: activePlane,
                  scopePlane: activePlaneBorrowsContainment ? undefined : activePlane,
                  selection,
                  today,
                  onCommand: editor.dispatch,
                  select,
                  requestLabelEdit,
                })}
                {/* How this plane is arranged and drawn — everything the topbar and
                  the editor toolbar used to carry about layout. The pickers go
                  when the notation arranges the plane itself (git graph,
                  fishbone): elk never runs there, so none of them would do
                  anything, in either mode. */}
                <LayoutPanel
                  controls={
                    notationProfile(notation).layout !== undefined
                      ? null
                      : {
                          settings: activePlaneSettings,
                          onChange: editing ? canvasEditing.setLayoutSettings : arrangement.previewLayoutSettings,
                          defaultDirection: defaultLayoutDirection(model),
                          algorithmLocked,
                          defaultAlgorithm: notationProfile(notation).defaultAlgorithm,
                        }
                  }
                  styleControl={
                    editing ? (
                      <select
                        className="chip-select"
                        aria-label="Diagram style"
                        title="Diagram style (saved with the diagram)"
                        value={diagramStyle ?? ''}
                        onChange={(e) =>
                          editor.dispatch({
                            type: 'set-diagram-style',
                            style: e.target.value === '' ? null : e.target.value,
                          })
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
                        className="chip-select"
                        aria-label="Style"
                        title={diagramStyle !== undefined ? 'Set by diagram' : 'Visual style'}
                        /* clamp: garbage in localStorage would otherwise render a blank select */
                        value={diagramStyle ?? (isKnownStyle(style) ? style : 'clean')}
                        disabled={diagramStyle !== undefined}
                        onChange={(e) => setStyle(e.target.value)}
                      >
                        {STYLE_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    )
                  }
                >
                  {editing && (
                    <EditLayoutActions
                      editor={editor}
                      activePlane={activePlane}
                      autoLayout={!activePlaneManual}
                      onToggleAutoLayout={canvasEditing.toggleAutoLayout}
                      getAutoPositions={() => layoutApiRef.current?.autoPositions() ?? {}}
                    />
                  )}
                  {!editing && arrangement.planePreviewed && (
                    <button
                      className="chip"
                      title="Drop the preview and go back to this diagram's own layout settings"
                      onClick={arrangement.dropPlanePreview}
                    >
                      Reset layout
                    </button>
                  )}
                  {!editing && Object.keys(layout?.planes[layoutPlaneKey(model, activePlane)] ?? {}).length > 0 && (
                    <button
                      type="button"
                      className={`chip${autoArrange ? ' active' : ''}`}
                      aria-pressed={autoArrange}
                      title={`${
                        autoArrange
                          ? 'Ignoring this diagram’s saved positions, so the layout algorithm arranges every node. Click to put them back.'
                          : 'This plane has saved positions, which override the layout algorithm. Click to arrange those nodes automatically instead (nothing is written).'
                      }${hint('view.auto-arrange')}`}
                      onClick={arrangement.toggleAutoArrange}
                    >
                      Auto-arrange
                    </button>
                  )}
                  {!editing && (
                    <button
                      type="button"
                      className={`chip${activePlaneManual ? ' active' : ''}`}
                      aria-pressed={activePlaneManual}
                      // A drilled snapshot (layoutApiRef.current?.snapshotPositions()) holds
                      // only the visible subtree, not the whole plane — freezing from there
                      // would set the plane-wide `manual` flag off the back of a partial
                      // snapshot. Must be done from the top level instead.
                      disabled={savingPositions || enteredPath.length > 0}
                      title={`${
                        enteredPath.length > 0
                          ? 'Freezing pins the whole plane, but a drilled view only has positions for what it shows — leave the drilled view first.'
                          : activePlaneManual
                            ? 'Positions are pinned. Click to let the layout algorithm arrange this plane again (your positions are kept).'
                            : 'Pin every box where it is so the layout algorithm stops moving them. Boxes added to the source later are still placed automatically until you move them.'
                      }${hint('view.freeze')}`}
                      onClick={() => void toggleFreeze()}
                    >
                      Freeze layout
                    </button>
                  )}
                </LayoutPanel>
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
        {hotkeyPrefs.dialogOpen && (
          <HotkeysDialog
            overrides={hotkeyPrefs.overrides}
            onChange={hotkeyPrefs.setOverrides}
            onClose={hotkeyPrefs.closeDialog}
            mac={mac}
          />
        )}
      </div>
    </HotkeysContext.Provider>
  );
}
