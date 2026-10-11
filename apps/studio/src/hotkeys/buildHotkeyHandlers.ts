import type { RefObject } from 'react';
import type { CanvasCommands } from '@diagc/renderer';
import type { CanvasEditing } from '../canvas-editing/useCanvasEditing';
import type { DrawToolState } from '../canvas-editing/useDrawTool';
import type { DiagramActions } from '../diagrams/useDiagramActions';
import type { DockLayout } from '../dock/useDockLayout';
import { relayoutPlane } from '../layout/LayoutActions';
import type { ViewArrangement } from '../layout/useViewArrangement';
import type { EditSession } from '../session/useEditSession';
import type { ViewerPrefs } from '../useViewerPrefs';
import type { CanvasSelection } from '../view/useCanvasSelection';
import type { ViewNavigation } from '../view/useViewNavigation';
import type { Handlers } from './useHotkeys';

/** What the keys act on: App's state, read as it is in the render that builds the handlers. */
export interface HotkeyContext {
  /** a diagram is on screen */
  hasModel: boolean;
  /** the diagram on screen has a source here, so it can be edited, renamed and ejected */
  owned: boolean;
  /** the design API is up: diagrams can be created and copied */
  canDesign: boolean;
  editing: boolean;
  /** drilled into a node: the view holds only part of the plane */
  drilled: boolean;
  /** the plane on screen has saved positions for Auto-arrange to set aside */
  hasSavedPositions: boolean;
  session: Pick<EditSession, 'editor' | 'doSave' | 'leaveEdit' | 'layoutApiRef'>;
  enterEditFromSource: () => Promise<void>;
  actions: DiagramActions;
  selection: Pick<CanvasSelection, 'selection' | 'groupSel'>;
  canvasEditing: Pick<CanvasEditing, 'placement' | 'runQuickAdd' | 'groupSelected' | 'toggleAutoLayout' | 'notes'>;
  nav: Pick<ViewNavigation, 'activePlane' | 'activePlaneManual'>;
  draw: Pick<DrawToolState, 'tool' | 'setTool' | 'setPen' | 'drawWith'>;
  arrangement: Pick<
    ViewArrangement,
    'savingPositions' | 'unsavedView' | 'savePositions' | 'toggleFreeze' | 'toggleAutoArrange'
  >;
  dock: Pick<DockLayout, 'toggleLeft' | 'toggleRight' | 'showInspectorTab'>;
  prefs: Pick<ViewerPrefs, 'toggleTheme' | 'toggleSnap'>;
  openHotkeysDialog: () => void;
  /** the picker's open/close, handed over by DiagramPicker */
  pickerToggleRef: RefObject<(() => void) | null>;
  /** the canvas's own commands, handed over by DiagramView */
  canvasCommandsRef: RefObject<CanvasCommands | null>;
}

/** a handler only while `cond` holds: absent, the key keeps the browser's meaning */
const on = <T>(cond: boolean, fn: T): T | undefined => (cond ? fn : undefined);

function diagramKeys(c: HotkeyContext) {
  const { hasModel, owned, canDesign, editing, session, enterEditFromSource, actions } = c;
  const viewChips = !editing && hasModel;
  return {
    'diagram.picker': () => c.pickerToggleRef.current?.(),
    'diagram.toggle-edit': on(hasModel && owned, () => void (editing ? session.leaveEdit() : enterEditFromSource())),
    'diagram.rename': on(canDesign && !editing && owned, () => void actions.renameDiagram()),
    'diagram.new': on(canDesign, () => void actions.newDiagram()),
    'diagram.duplicate': on(canDesign && viewChips, () => void actions.duplicateDiagram()),
    'diagram.eject': on(canDesign && !editing && owned, () => void actions.ejectDiagram()),
  } satisfies Handlers;
}

function editKeys({ editing, session, selection, canvasEditing, nav }: HotkeyContext) {
  const { editor, layoutApiRef } = session;
  const { notes } = canvasEditing;
  return {
    'edit.add-node': on(editing, () => canvasEditing.placement.addNode()),
    'edit.add-child': on(editing, () =>
      selection.selection?.kind === 'node' ? canvasEditing.runQuickAdd(selection.selection.id) : false,
    ),
    'edit.undo': on(editing, () => editor.undo()),
    'edit.redo': on(editing, () => editor.redo()),
    'edit.save': on(editing, () => void session.doSave()),
    'edit.group': on(editing && selection.groupSel.length >= 2, () => void canvasEditing.groupSelected()),
    'edit.relayout': on(
      editing,
      () =>
        void relayoutPlane(editor, {
          autoLayout: !nav.activePlaneManual,
          activePlane: nav.activePlane,
          getAutoPositions: () => layoutApiRef.current?.autoPositions() ?? {},
        }),
    ),
    'edit.toggle-auto-layout': on(editing, canvasEditing.toggleAutoLayout),
    'edit.toggle-notes': on(editing && notes.offered && notes.anyThreats, notes.toggleAll),
  } satisfies Handlers;
}

function toolKeys({ editing, draw }: HotkeyContext) {
  const { tool, setTool, setPen, drawWith } = draw;
  return {
    'tool.select': on(editing, () => setTool('select')),
    'tool.pen': on(editing, drawWith('pen')),
    'tool.eraser': on(editing, drawWith('eraser')),
    'pen.thin': on(editing && tool === 'pen', () => setPen({ width: 2 })),
    'pen.medium': on(editing && tool === 'pen', () => setPen({ width: 3 })),
    'pen.thick': on(editing && tool === 'pen', () => setPen({ width: 6 })),
  } satisfies Handlers;
}

/** a command the canvas runs itself, while there is a canvas; false until it has handed them over */
const canvasCommand =
  ({ hasModel, canvasCommandsRef }: HotkeyContext) =>
  (run: (c: CanvasCommands) => boolean) =>
    on(hasModel, () => (canvasCommandsRef.current !== null ? run(canvasCommandsRef.current) : false));

function canvasKeys(c: HotkeyContext) {
  const canvasCmd = canvasCommand(c);
  return {
    'canvas.fit': canvasCmd((c) => c.fitView()),
    'canvas.zoom-in': canvasCmd((c) => c.zoomIn()),
    'canvas.zoom-out': canvasCmd((c) => c.zoomOut()),
    'canvas.laser': canvasCmd((c) => c.toggleLaser()),
    'canvas.legend': canvasCmd((c) => c.toggleLegend()),
    'canvas.dim': canvasCmd((c) => c.toggleDim()),
    'canvas.drawings': canvasCmd((c) => c.toggleDrawings()),
    'canvas.loops': canvasCmd((c) => c.toggleLoops()),
  } satisfies Handlers;
}

function viewKeys({ hasModel, editing, drilled, hasSavedPositions, arrangement }: HotkeyContext) {
  const viewChips = !editing && hasModel;
  const { savingPositions, unsavedView } = arrangement;
  return {
    'view.freeze': on(viewChips && !savingPositions && !drilled, () => void arrangement.toggleFreeze()),
    'view.save-positions': on(viewChips && unsavedView && !savingPositions, () => void arrangement.savePositions()),
    'view.auto-arrange': on(viewChips && hasSavedPositions, arrangement.toggleAutoArrange),
  } satisfies Handlers;
}

function arrangeKeys(c: HotkeyContext) {
  const canvasCmd = canvasCommand(c);
  return {
    'arrange.align-left': canvasCmd((c) => c.align('left')),
    'arrange.align-center': canvasCmd((c) => c.align('centerX')),
    'arrange.align-right': canvasCmd((c) => c.align('right')),
    'arrange.align-top': canvasCmd((c) => c.align('top')),
    'arrange.align-middle': canvasCmd((c) => c.align('middle')),
    'arrange.align-bottom': canvasCmd((c) => c.align('bottom')),
    'arrange.distribute-x': canvasCmd((c) => c.distribute('x')),
    'arrange.distribute-y': canvasCmd((c) => c.distribute('y')),
  } satisfies Handlers;
}

function windowKeys({ hasModel, editing, dock, prefs, openHotkeysDialog }: HotkeyContext) {
  return {
    'window.left-dock': on(hasModel, dock.toggleLeft),
    'window.right-dock': on(hasModel, dock.toggleRight),
    'window.inspector-properties': on(editing, () => dock.showInspectorTab('properties')),
    'window.inspector-library': on(editing, () => dock.showInspectorTab('library')),
    'window.theme': prefs.toggleTheme,
    'window.snap': prefs.toggleSnap,
    'window.hotkeys': openHotkeysDialog,
  } satisfies Handlers;
}

/**
 * What each hotkey does right now (hotkeys/useHotkeys reads the result on every
 * key), grouped by the action's prefix. The rule: a handler is present exactly
 * while its button would be shown and enabled, so a key can never do what the
 * UI would refuse — and a key with no handler keeps whatever meaning the browser
 * gives it.
 */
export function buildHotkeyHandlers(c: HotkeyContext): Handlers {
  return {
    ...diagramKeys(c),
    ...editKeys(c),
    ...toolKeys(c),
    ...canvasKeys(c),
    ...viewKeys(c),
    ...arrangeKeys(c),
    ...windowKeys(c),
  };
}
