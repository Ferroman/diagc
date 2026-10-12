import { useMemo, useRef } from 'react';
import { todayIso, type CanvasCommands } from '@diagc/renderer';
import { useDiagramBoot } from './diagrams/useDiagramBoot';
import { useDeepLink } from './diagrams/useDeepLink';
import { useEditSession } from './session/useEditSession';
import { useViewerPrefs } from './useViewerPrefs';
import { useClipboard } from './canvas-editing/useClipboard';
import { useCanvasEditing } from './canvas-editing/useCanvasEditing';
import { useDiagramActions } from './diagrams/useDiagramActions';
import { useViewNavigation } from './view/useViewNavigation';
import { useCanvasSelection } from './view/useCanvasSelection';
import { useViewArrangement } from './layout/useViewArrangement';
import { useDiagramView } from './diagrams/useDiagramView';
import { useCausalLoopAnalysis } from './notations/causal-loop/useCausalLoopAnalysis';
import { EditorToolbar } from './canvas-editing/EditorToolbar';
import { studioNotation } from './notations';
import { useDockLayout } from './dock/useDockLayout';
import { useLibrary } from './library/useLibrary';
import { HotkeysContext, keyName } from './hotkeys/HotkeysContext';
import { HotkeysDialog } from './hotkeys/HotkeysDialog';
import { useHotkeyPrefs } from './hotkeys/useHotkeyPrefs';
import { useHotkeys, type Handlers } from './hotkeys/useHotkeys';
import { buildHotkeyHandlers } from './hotkeys/buildHotkeyHandlers';
import { useDrawTool } from './canvas-editing/useDrawTool';
import { hasSavedPositions } from './layout/savedPositions';
import { TopBar } from './TopBar';
import { Banners } from './Banners';
import { InspectorDock } from './inspector/InspectorDock';
import { StudioCanvas } from './view/StudioCanvas';
import { NotationDock } from './dock/NotationDock';

/** `initialTheme` lets a host seed the color scheme (the Obsidian pane passes
 * the vault's); the browser studio keeps its dark default. A seed only — the
 * in-app toggle owns the state from mount on. */
export function App({ initialTheme = 'dark' }: { initialTheme?: 'light' | 'dark' } = {}) {
  const boot = useDiagramBoot();
  const { artifacts, names, booted, ownedNames, canDesign } = boot;

  const prefs = useViewerPrefs(initialTheme);
  const hotkeyPrefs = useHotkeyPrefs();
  const { keymap, mac } = hotkeyPrefs;
  const appRef = useRef<HTMLDivElement>(null);
  const canvasCommandsRef = useRef<CanvasCommands | null>(null);
  const pickerToggleRef = useRef<(() => void) | null>(null);
  const hotkeyHandlers = useRef<Handlers>({});
  const dock = useDockLayout();
  const lib = useLibrary();

  // Read through a ref by a once-subscribed listener, and assigned on every
  // render: leaveEditRef is the hashchange listener's cross-diagram edit close
  // and resetViewRef its view reset (both useDeepLink). The keyboard needs
  // none — see the hotkeys block above the JSX, which runs after everything it
  // calls exists.
  const leaveEditRef = useRef<() => boolean>(() => true);
  const resetViewRef = useRef<() => void>(() => {});

  const dl = useDeepLink({ names, booted, leaveEditRef, resetViewRef });
  const { selected, enteredPath } = dl;
  const drillRoot = enteredPath.length > 0 ? enteredPath[enteredPath.length - 1] : undefined;

  const edit = useEditSession({
    store: boot,
    resetInspector: () => dock.selectTab('properties'), // re-entering edit starts on Properties
    leaveEditRef,
  });
  const { editing, editor, layoutApiRef, reportIssues, leaveEdit } = edit;
  const draw = useDrawTool({ editing, selected, enteredPath });

  // Three hooks here hand a callback to a hook declared after them, because that
  // hook reads their values: entering edit and a view reset drop the
  // arrangement's layout preview, and a selection move drops the loop
  // analysis's focus. The callbacks run only from events and effects, by which
  // time this render has declared `arrangement` and `loops`.
  const view = useDiagramView({
    artifacts,
    selected,
    editing,
    editor,
    enterEdit: edit.enterEdit,
    reportIssues,
    dropLayoutPreview: () => arrangement.dropPreview(),
  });
  const { model, layout } = view;

  const canvasSelection = useCanvasSelection({
    editing,
    lastRelation: view.session?.lastRelation,
    onSelect: () => loops.dropFocus(),
  });
  const { selection, groupSel, select } = canvasSelection;

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
  const { activePlane, activePlaneBorrowsContainment, activePlaneManual, penLayer } = nav;
  resetViewRef.current = nav.resetView;

  // what the notation adds: its dock panel, the gestures it reads its own way,
  // the kind a connect draws, the loop analysis (see notations/types)
  const studioProfile = studioNotation(nav.notation);
  // the host's calendar date: a plan plane's today line, and where a quick-add
  // or a library drop with no other anchor lands.
  const today = todayIso();
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
    selectTab: dock.selectTab,
    lib,
    drillRoot,
    today,
  });

  // Diagram lifecycle: create + rename + duplicate (the flows that re-key the
  // artifact store).
  const actions = useDiagramActions({
    editing,
    selected,
    current: view.current,
    names,
    ownedNames,
    store: boot,
    selectDiagram: dl.selectDiagram,
    renameSelected: dl.renameSelected,
    startEditing: edit.startEditing,
    leaveEdit,
    resetView: nav.resetView,
  });

  // How the diagram is arranged in view mode, and the chips that save it.
  const arrangement = useViewArrangement({
    model,
    layout,
    editing,
    selected,
    activePlane,
    activePlaneManual,
    pins: nav.pins,
    savedUnfoldedKey: nav.savedUnfoldedKey,
    layoutApiRef,
    putLayout: boot.putLayout,
    reportIssues,
  });

  // What each hotkey does right now (hotkeys/useHotkeys reads this ref on every
  // key; see buildHotkeyHandlers for the rule). Placed last because it draws on
  // nearly everything above.
  hotkeyHandlers.current = buildHotkeyHandlers({
    hasModel: model !== undefined,
    owned: ownedNames.has(selected),
    canDesign,
    editing,
    drilled: enteredPath.length > 0,
    hasSavedPositions: hasSavedPositions(model, layout, activePlane),
    session: edit,
    enterEditFromSource: view.enterEditFromSource,
    actions,
    selection: canvasSelection,
    canvasEditing,
    nav,
    draw,
    arrangement,
    dock,
    prefs,
    openHotkeysDialog: hotkeyPrefs.openDialog,
    pickerToggleRef,
    canvasCommandsRef,
  });
  useHotkeys({
    rootRef: appRef,
    keymap,
    mode: editing ? 'edit' : 'view',
    handlersRef: hotkeyHandlers,
    suspended: hotkeyPrefs.dialogOpen,
    mac,
  });
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
        <TopBar
          boot={boot}
          deepLink={dl}
          session={edit}
          view={view}
          nav={nav}
          actions={actions}
          arrangement={arrangement}
          notes={canvasEditing.notes}
          prefs={prefs}
          hotkeyPrefs={hotkeyPrefs}
          pickerToggleRef={pickerToggleRef}
        />
        {editing && (
          <EditorToolbar
            editor={editor}
            onExit={leaveEdit}
            onSave={() => void edit.doSave()}
            saving={edit.saving}
            saveIssues={edit.saveIssues}
            selectionColor={canvasEditing.selectionColor}
            tool={draw.tool}
            onSetTool={draw.setTool}
            pen={{ color: draw.penColor, width: draw.penWidth }}
            onSetPen={draw.setPen}
            drawingDisabled={enteredPath.length > 0}
          />
        )}
        <Banners
          names={names}
          canDesign={canDesign}
          editing={editing}
          current={view.current}
          saveIssues={edit.saveIssues}
        />
        <main className="body">
          {model !== undefined && (
            <>
              <InspectorDock
                model={model}
                layout={layout}
                editing={editing}
                dock={dock}
                selection={canvasSelection}
                nav={nav}
                today={today}
                session={edit}
                lib={lib}
                placement={canvasEditing.placement}
                loopAnalysis={studioProfile.loopAnalysis === true}
                loops={loops}
              />
              <StudioCanvas
                model={model}
                today={today}
                editing={editing}
                nav={nav}
                selection={canvasSelection}
                deepLink={dl}
                loops={loops}
                prefs={prefs}
                arrangement={arrangement}
                drawings={view.drawings}
                draw={draw}
                canvasEditing={canvasEditing}
                layoutApiRef={layoutApiRef}
                canvasCommandsRef={canvasCommandsRef}
                keyHints={canvasKeyHints}
              />
              <NotationDock
                model={model}
                layout={layout}
                editing={editing}
                editor={editor}
                dock={dock}
                nav={nav}
                notationDock={studioProfile.dock}
                selection={canvasSelection}
                today={today}
                drilled={enteredPath.length > 0}
                arrangement={arrangement}
                canvasEditing={canvasEditing}
                prefs={prefs}
                layoutApiRef={layoutApiRef}
              />
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
