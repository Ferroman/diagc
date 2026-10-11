import { describe, expect, it, vi } from 'vitest';
import type { CanvasCommands } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import { buildHotkeyHandlers, type HotkeyContext } from './buildHotkeyHandlers';
import type { Handlers } from './useHotkeys';

const context = (over: Partial<HotkeyContext> = {}): HotkeyContext => ({
  hasModel: true,
  owned: true,
  canDesign: true,
  editing: false,
  drilled: false,
  hasSavedPositions: false,
  session: {
    editor: { undo: vi.fn(), redo: vi.fn(), dispatch: vi.fn(), session: null } as unknown as EditorApi,
    doSave: vi.fn(async () => true),
    leaveEdit: vi.fn(() => true),
    layoutApiRef: { current: null },
  },
  enterEditFromSource: vi.fn(async () => {}),
  actions: {
    newDiagram: vi.fn(async () => {}),
    renameDiagram: vi.fn(async () => {}),
    duplicateDiagram: vi.fn(async () => {}),
    ejectDiagram: vi.fn(async () => {}),
  },
  selection: { selection: null, groupSel: [] },
  canvasEditing: {
    placement: { addNode: vi.fn() } as unknown as HotkeyContext['canvasEditing']['placement'],
    runQuickAdd: vi.fn(() => true),
    groupSelected: vi.fn(async () => {}),
    toggleAutoLayout: vi.fn(),
    notes: { offered: false, anyThreats: false, allOpen: false, toggleAll: vi.fn() },
  },
  nav: { activePlane: undefined, activePlaneManual: false },
  draw: { tool: 'select', setTool: vi.fn(), setPen: vi.fn(), drawWith: () => () => true },
  arrangement: {
    savingPositions: false,
    unsavedView: false,
    savePositions: vi.fn(async () => {}),
    toggleFreeze: vi.fn(async () => {}),
    toggleAutoArrange: vi.fn(),
  },
  dock: { toggleLeft: vi.fn(), toggleRight: vi.fn(), showInspectorTab: vi.fn() },
  prefs: { toggleTheme: vi.fn(), toggleSnap: vi.fn() },
  openHotkeysDialog: vi.fn(),
  pickerToggleRef: { current: null },
  canvasCommandsRef: { current: null },
  ...over,
});

/** the actions with a handler, among those starting with `prefix` */
const present = (handlers: Handlers, prefix = '') =>
  Object.entries(handlers)
    .filter(([id, h]) => id.startsWith(prefix) && h !== undefined)
    .map(([id]) => id)
    .sort();

describe('buildHotkeyHandlers: the diagram actions', () => {
  it('offers Edit, Rename and Eject on an owned diagram only, Duplicate and New wherever the design API is up', () => {
    // Breaks if a diagram action loses its owned or design-API gate.
    expect(present(buildHotkeyHandlers(context()), 'diagram.')).toEqual([
      'diagram.duplicate',
      'diagram.eject',
      'diagram.new',
      'diagram.picker',
      'diagram.rename',
      'diagram.toggle-edit',
    ]);
    expect(present(buildHotkeyHandlers(context({ owned: false })), 'diagram.')).toEqual([
      'diagram.duplicate',
      'diagram.new',
      'diagram.picker',
    ]);
    expect(present(buildHotkeyHandlers(context({ canDesign: false, owned: false })), 'diagram.')).toEqual([
      'diagram.picker',
    ]);
  });

  it('in edit mode keeps Edit (to leave) and New, and drops what the menu hides', () => {
    // Breaks if Rename, Duplicate or Eject stay reachable while editing.
    const c = context({ editing: true });
    expect(present(buildHotkeyHandlers(c), 'diagram.')).toEqual([
      'diagram.new',
      'diagram.picker',
      'diagram.toggle-edit',
    ]);
    buildHotkeyHandlers(c)['diagram.toggle-edit']?.();
    expect(c.session.leaveEdit).toHaveBeenCalled();
    const v = context();
    buildHotkeyHandlers(v)['diagram.toggle-edit']?.();
    expect(v.enterEditFromSource).toHaveBeenCalled();
  });

  it("opens the picker through the picker's own toggle, read when the key is pressed", () => {
    // Breaks if the toggle is read when the handlers are built (the picker hands it over after).
    const c = context();
    const handlers = buildHotkeyHandlers(c);
    const toggle = vi.fn();
    c.pickerToggleRef.current = toggle;
    handlers['diagram.picker']?.();
    expect(toggle).toHaveBeenCalled();
  });
});

describe('buildHotkeyHandlers: editing', () => {
  it('offers the edit actions while editing only', () => {
    // Breaks if an edit action loses its edit gate.
    expect(present(buildHotkeyHandlers(context()), 'edit.')).toEqual([]);
    expect(present(buildHotkeyHandlers(context({ editing: true })), 'edit.')).toEqual([
      'edit.add-child',
      'edit.add-node',
      'edit.redo',
      'edit.relayout',
      'edit.save',
      'edit.toggle-auto-layout',
      'edit.undo',
    ]);
  });

  it('Group with two or more nodes selected; the notes key where a threat exists to open', () => {
    // Breaks if Group or the notes key lose their gates.
    const c = context({
      editing: true,
      selection: { selection: null, groupSel: ['a', 'b'] },
    });
    c.canvasEditing.notes = { offered: true, anyThreats: false, allOpen: false, toggleAll: vi.fn() };
    expect(present(buildHotkeyHandlers(c), 'edit.')).toContain('edit.group');
    expect(present(buildHotkeyHandlers(c), 'edit.')).not.toContain('edit.toggle-notes');
    c.canvasEditing.notes = { ...c.canvasEditing.notes, anyThreats: true };
    expect(buildHotkeyHandlers(c)['edit.toggle-notes']).toBe(c.canvasEditing.notes.toggleAll);
  });

  it('Tab extends the selected node, and answers false with nothing to extend', () => {
    // Breaks if add-child stops returning quick add's answer (Tab's focus move hangs on it).
    const c = context({ editing: true });
    expect(buildHotkeyHandlers(c)['edit.add-child']?.()).toBe(false);
    const selected = context({ editing: true, selection: { selection: { kind: 'node', id: 'a' }, groupSel: [] } });
    expect(buildHotkeyHandlers(selected)['edit.add-child']?.()).toBe(true);
    expect(selected.canvasEditing.runQuickAdd).toHaveBeenCalledWith('a');
  });

  it('the pen widths only while the pen is out', () => {
    // Breaks if a width key works without the pen.
    expect(present(buildHotkeyHandlers(context({ editing: true })), 'pen.')).toEqual([]);
    const c = context({ editing: true });
    c.draw = { ...c.draw, tool: 'pen' };
    buildHotkeyHandlers(c)['pen.thick']?.();
    expect(c.draw.setPen).toHaveBeenCalledWith({ width: 6 });
  });
});

describe('buildHotkeyHandlers: the canvas and the view', () => {
  it('runs a canvas command once the canvas has handed them over, answering false before', () => {
    // Breaks if a canvas key claims the key with no canvas to run it.
    const c = context();
    expect(buildHotkeyHandlers(c)['canvas.fit']?.()).toBe(false);
    const fitView = vi.fn(() => true);
    const align = vi.fn(() => true);
    c.canvasCommandsRef.current = { fitView, align } as unknown as CanvasCommands;
    expect(buildHotkeyHandlers(c)['canvas.fit']?.()).toBe(true);
    buildHotkeyHandlers(c)['arrange.align-center']?.();
    expect(align).toHaveBeenCalledWith('centerX');
    expect(present(buildHotkeyHandlers(context({ hasModel: false })), 'canvas.')).toEqual([]);
  });

  it('Freeze at the top level while no save is in flight; Save positions with moves to save; Auto-arrange with saved positions', () => {
    // Breaks if a view chip's key loses the chip's gate.
    expect(present(buildHotkeyHandlers(context()), 'view.')).toEqual(['view.freeze']);
    expect(present(buildHotkeyHandlers(context({ drilled: true })), 'view.')).toEqual([]);
    const c = context({ hasSavedPositions: true });
    c.arrangement = { ...c.arrangement, unsavedView: true };
    expect(present(buildHotkeyHandlers(c), 'view.')).toEqual([
      'view.auto-arrange',
      'view.freeze',
      'view.save-positions',
    ]);
    c.arrangement = { ...c.arrangement, savingPositions: true };
    expect(present(buildHotkeyHandlers(c), 'view.')).toEqual(['view.auto-arrange']);
    expect(present(buildHotkeyHandlers(context({ editing: true, hasSavedPositions: true })), 'view.')).toEqual([]);
  });

  it('the inspector tabs while editing; the docks while a diagram is on screen; theme, snap and the dialog always', () => {
    // Breaks if a window key loses or gains a gate.
    expect(present(buildHotkeyHandlers(context({ hasModel: false })), 'window.')).toEqual([
      'window.hotkeys',
      'window.snap',
      'window.theme',
    ]);
    const c = context({ editing: true });
    buildHotkeyHandlers(c)['window.inspector-library']?.();
    expect(c.dock.showInspectorTab).toHaveBeenCalledWith('library');
    expect(buildHotkeyHandlers(c)['window.theme']).toBe(c.prefs.toggleTheme);
  });
});
