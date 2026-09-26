import type { Chord } from './chord';

/** where a key is live: the two studio modes, or both */
export type Scope = 'view' | 'edit' | 'both';
export type ActionGroup = 'Diagram' | 'Editing' | 'Tools' | 'Canvas' | 'Arrange' | 'Window';
/** dialog order */
export const GROUPS: readonly ActionGroup[] = ['Diagram', 'Editing', 'Tools', 'Canvas', 'Arrange', 'Window'];

interface ActionShape {
  id: string;
  label: string;
  group: ActionGroup;
  scope: Scope;
  defaults: readonly Chord[];
  /** a held key keeps firing; everything else ignores auto-repeat */
  repeat?: true;
  /** Reachable while typing in a field — and then only through a chord with
   *  Ctrl/Cmd/Alt, which no field would type. The picker alone: focus sits in its
   *  search box while it is open, and the same key has to close it from there. */
  inFields?: true;
}

// The one list of what a key can do. The dispatcher, the settings dialog and the
// reference docs all read this, so a new studio action becomes bindable by adding
// a row here and a handler in App — nowhere else.
//
// Deliberately absent: anything that takes an argument (a colour swatch, the
// Style and layout selects, a plane, a layer, a dock section) and the gestures
// and cancels listed in FIXED_KEYS.
const DEFS = [
  { id: 'diagram.picker', label: 'Open diagram picker', group: 'Diagram', scope: 'both', defaults: ['Mod+K'], inFields: true },
  { id: 'diagram.toggle-edit', label: 'Edit / Done', group: 'Diagram', scope: 'both', defaults: ['Mod+Enter'] },
  { id: 'diagram.rename', label: 'Rename diagram', group: 'Diagram', scope: 'view', defaults: ['F2'] },
  { id: 'diagram.new', label: 'New diagram', group: 'Diagram', scope: 'both', defaults: [] },
  { id: 'diagram.duplicate', label: 'Duplicate diagram', group: 'Diagram', scope: 'view', defaults: [] },
  { id: 'diagram.eject', label: 'Eject to TypeScript', group: 'Diagram', scope: 'view', defaults: [] },

  { id: 'edit.add-node', label: 'Add node', group: 'Editing', scope: 'edit', defaults: ['N'] },
  { id: 'edit.add-child', label: 'Add the expected child', group: 'Editing', scope: 'edit', defaults: ['Tab'] },
  { id: 'edit.undo', label: 'Undo', group: 'Editing', scope: 'edit', defaults: ['Mod+Z'], repeat: true },
  { id: 'edit.redo', label: 'Redo', group: 'Editing', scope: 'edit', defaults: ['Mod+Shift+Z', 'Mod+Y'], repeat: true },
  { id: 'edit.save', label: 'Save', group: 'Editing', scope: 'edit', defaults: ['Mod+S'] },
  { id: 'edit.group', label: 'Group selection', group: 'Editing', scope: 'edit', defaults: ['Mod+G'] },
  { id: 'edit.relayout', label: 'Re-layout', group: 'Editing', scope: 'edit', defaults: [] },
  { id: 'edit.toggle-auto-layout', label: 'Auto-layout on/off', group: 'Editing', scope: 'edit', defaults: [] },
  { id: 'edit.toggle-notes', label: 'Open/close all threat notes', group: 'Editing', scope: 'edit', defaults: [] },

  { id: 'tool.select', label: 'Select', group: 'Tools', scope: 'edit', defaults: ['V'] },
  { id: 'tool.pen', label: 'Pen', group: 'Tools', scope: 'edit', defaults: ['P'] },
  { id: 'tool.eraser', label: 'Eraser', group: 'Tools', scope: 'edit', defaults: ['E'] },
  { id: 'pen.thin', label: 'Pen width: thin', group: 'Tools', scope: 'edit', defaults: [] },
  { id: 'pen.medium', label: 'Pen width: medium', group: 'Tools', scope: 'edit', defaults: [] },
  { id: 'pen.thick', label: 'Pen width: thick', group: 'Tools', scope: 'edit', defaults: [] },

  { id: 'canvas.fit', label: 'Fit view', group: 'Canvas', scope: 'both', defaults: ['F'] },
  { id: 'canvas.zoom-in', label: 'Zoom in', group: 'Canvas', scope: 'both', defaults: ['=', '+'], repeat: true },
  { id: 'canvas.zoom-out', label: 'Zoom out', group: 'Canvas', scope: 'both', defaults: ['-'], repeat: true },
  { id: 'canvas.laser', label: 'Laser pointer', group: 'Canvas', scope: 'both', defaults: ['L'] },
  { id: 'canvas.legend', label: 'Show/hide legend', group: 'Canvas', scope: 'both', defaults: ['Shift+L'] },
  { id: 'canvas.dim', label: 'Dim unconnected on select', group: 'Canvas', scope: 'both', defaults: [] },
  { id: 'canvas.drawings', label: 'Show/hide drawings', group: 'Canvas', scope: 'both', defaults: [] },
  { id: 'canvas.loops', label: 'Show/hide loop badges', group: 'Canvas', scope: 'both', defaults: [] },
  { id: 'view.freeze', label: 'Freeze / unfreeze layout', group: 'Canvas', scope: 'view', defaults: [] },
  { id: 'view.save-positions', label: 'Save positions', group: 'Canvas', scope: 'view', defaults: [] },
  { id: 'view.auto-arrange', label: 'Auto-arrange', group: 'Canvas', scope: 'view', defaults: [] },

  { id: 'arrange.align-left', label: 'Align left', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.align-center', label: 'Align centre', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.align-right', label: 'Align right', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.align-top', label: 'Align top', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.align-middle', label: 'Align middle', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.align-bottom', label: 'Align bottom', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.distribute-x', label: 'Distribute horizontally', group: 'Arrange', scope: 'both', defaults: [] },
  { id: 'arrange.distribute-y', label: 'Distribute vertically', group: 'Arrange', scope: 'both', defaults: [] },

  { id: 'window.left-dock', label: 'Show/hide left panel', group: 'Window', scope: 'both', defaults: ['['] },
  { id: 'window.right-dock', label: 'Show/hide right panel', group: 'Window', scope: 'both', defaults: [']'] },
  { id: 'window.inspector-properties', label: 'Inspector: Properties', group: 'Window', scope: 'edit', defaults: [] },
  { id: 'window.inspector-library', label: 'Inspector: Library', group: 'Window', scope: 'edit', defaults: [] },
  { id: 'window.theme', label: 'Light / dark', group: 'Window', scope: 'both', defaults: ['Shift+T'] },
  { id: 'window.snap', label: 'Snap to grid', group: 'Window', scope: 'both', defaults: ['Shift+S'] },
  { id: 'window.hotkeys', label: 'Keyboard shortcuts', group: 'Window', scope: 'both', defaults: ['?'] },
] as const satisfies readonly ActionShape[];

export type ActionId = (typeof DEFS)[number]['id'];
export interface ActionDef extends ActionShape {
  id: ActionId;
}
export const ACTIONS: readonly ActionDef[] = DEFS;

const BY_ID = new Map<ActionId, ActionDef>(ACTIONS.map((a) => [a.id, a]));
export const actionOf = (id: ActionId): ActionDef => BY_ID.get(id)!;

/** Gestures and cancels: not rebindable, listed so the dialog is the whole cheat sheet. */
export const FIXED_KEYS: readonly { label: string; keys: string }[] = [
  { label: 'Back to Select, laser off, cancel', keys: 'Esc' },
  { label: 'Delete the selection (edit mode)', keys: 'Delete / Backspace' },
  { label: 'Copy / paste the selection (edit mode)', keys: 'Ctrl/Cmd + C / V' },
  { label: 'Nudge the selection', keys: 'Arrows (Shift = ×4)' },
  { label: 'Add to the selection, marquee-select', keys: 'Shift + click / drag' },
  { label: 'Move a box or an edge label in view mode', keys: 'Alt + drag' },
  { label: 'Commit / cancel a name being typed', keys: 'Enter / Esc' },
  { label: 'Bold / italic in a label', keys: 'Ctrl/Cmd + B / I' },
];
