import { describe, expect, it } from 'vitest';
import { conflictsOf, lookup, parseOverrides, reservedReason, resolveKeymap, withBinding } from './keymap';

describe('resolveKeymap', () => {
  it('uses the defaults where nothing is overridden', () => {
    const k = resolveKeymap({});
    expect(k['edit.add-node']).toEqual(['N']);
    expect(k['arrange.align-left']).toEqual([]);
  });
  it('an override replaces the defaults; an empty one unbinds', () => {
    const k = resolveKeymap({ 'edit.add-node': ['A'], 'canvas.laser': [] });
    expect(k['edit.add-node']).toEqual(['A']);
    expect(k['canvas.laser']).toEqual([]);
  });
});

describe('lookup', () => {
  const k = resolveKeymap({});
  it('finds an action live in the mode', () => {
    expect(lookup(k, 'N', 'edit')).toBe('edit.add-node');
    expect(lookup(k, 'L', 'view')).toBe('canvas.laser');
    expect(lookup(k, 'Mod+Y', 'edit')).toBe('edit.redo');
  });
  it('ignores an action the mode does not have', () => {
    expect(lookup(k, 'N', 'view')).toBeUndefined();
    expect(lookup(k, 'F2', 'edit')).toBeUndefined();
  });
  it('resolves a bare Escape to Select in edit mode, whatever the keymap says', () => {
    expect(lookup(k, 'Escape', 'edit')).toBe('tool.select');
    expect(lookup(resolveKeymap({ 'tool.select': [] }), 'Escape', 'edit')).toBe('tool.select');
    expect(lookup(k, 'Escape', 'view')).toBeUndefined();
  });
  it('returns undefined for an unbound chord', () => {
    expect(lookup(k, 'Mod+Alt+Q', 'edit')).toBeUndefined();
  });
});

describe('conflictsOf', () => {
  it('reports another action with the chord when their scopes overlap', () => {
    const k = resolveKeymap({});
    expect(conflictsOf(k, 'edit.add-node', 'P')).toEqual(['tool.pen']); // edit vs edit
    expect(conflictsOf(k, 'edit.add-node', 'L')).toEqual(['canvas.laser']); // edit vs both
  });
  it('lets a view-only and an edit-only action share a chord', () => {
    expect(conflictsOf(resolveKeymap({}), 'edit.add-node', 'F2')).toEqual([]); // F2 = Rename, view only
  });
  it('never reports the action itself', () => {
    expect(conflictsOf(resolveKeymap({}), 'edit.add-node', 'N')).toEqual([]);
  });
});

describe('reservedReason', () => {
  it('refuses the fixed keys', () => {
    for (const c of ['Escape', 'Delete', 'Backspace', 'ArrowLeft', 'Shift+ArrowUp']) {
      expect(reservedReason(c)).toBe('This key has a fixed meaning in the studio.');
    }
  });
  it('refuses the keys that press the focused button', () => {
    expect(reservedReason('Enter')).toBe('Enter and Space press the focused button, so the action would run twice.');
    expect(reservedReason('Space')).toBe('Enter and Space press the focused button, so the action would run twice.');
  });
  it('refuses what the browser never hands to a page', () => {
    for (const c of ['Mod+N', 'Mod+T', 'Mod+W', 'Mod+Shift+T', 'Mod+Tab', 'F11']) {
      expect(reservedReason(c)).toBe('The browser keeps this key for itself.');
    }
  });
  it('allows everything else, modified Enter included', () => {
    for (const c of ['N', 'Mod+Enter', 'Shift+L', '?', 'F2', 'Tab']) expect(reservedReason(c)).toBeNull();
  });
});

describe('withBinding', () => {
  it('stores a change as an override', () => {
    expect(withBinding({}, 'edit.add-node', ['A'])).toEqual({ 'edit.add-node': ['A'] });
    expect(withBinding({}, 'edit.add-node', [])).toEqual({ 'edit.add-node': [] });
  });
  it('drops the entry when the binding is back at its default, so a reset leaves no residue', () => {
    expect(withBinding({ 'edit.add-node': ['A'] }, 'edit.add-node', ['N'])).toEqual({});
    expect(withBinding({ 'edit.redo': ['R'] }, 'edit.redo', ['Mod+Shift+Z', 'Mod+Y'])).toEqual({});
  });
  it('does not mutate its input', () => {
    const before = { 'edit.add-node': ['A'] };
    withBinding(before, 'edit.add-node', ['B']);
    expect(before).toEqual({ 'edit.add-node': ['A'] });
  });
});

describe('parseOverrides', () => {
  it('is null for nothing stored or for garbage — the caller falls back to no overrides', () => {
    expect(parseOverrides(null)).toBeNull();
    expect(parseOverrides('{not json')).toBeNull();
    expect(parseOverrides('[1,2]')).toBeNull();
    expect(parseOverrides('"x"')).toBeNull();
  });
  it('keeps known ids with string-array values and drops the rest', () => {
    const raw = JSON.stringify({ 'edit.add-node': ['A'], 'retired.action': ['B'], 'tool.pen': 'P', 'tool.eraser': [1] });
    expect(parseOverrides(raw)).toEqual({ 'edit.add-node': ['A'] });
  });
});
