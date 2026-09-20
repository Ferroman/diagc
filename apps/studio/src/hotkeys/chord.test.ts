// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chordOf, formatChord } from './chord';

const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('chordOf', () => {
  it('upper-cases a letter and keeps Shift as a modifier', () => {
    expect(chordOf(ev({ key: 'n' }), false)).toBe('N');
    expect(chordOf(ev({ key: 'L', shiftKey: true }), false)).toBe('Shift+L');
    expect(chordOf(ev({ key: 'N' }), false)).toBe('N'); // caps lock is not Shift
  });

  it('drops Shift from a symbol: Shift typed the character', () => {
    expect(chordOf(ev({ key: '?', shiftKey: true }), false)).toBe('?');
    expect(chordOf(ev({ key: '+', shiftKey: true }), false)).toBe('+');
    expect(chordOf(ev({ key: '[' }), false)).toBe('[');
    expect(chordOf(ev({ key: '1' }), false)).toBe('1');
  });

  it('names the named keys and keeps Shift on them', () => {
    expect(chordOf(ev({ key: 'F2' }), false)).toBe('F2');
    expect(chordOf(ev({ key: 'Tab', shiftKey: true }), false)).toBe('Shift+Tab');
    expect(chordOf(ev({ key: ' ' }), false)).toBe('Space');
    expect(chordOf(ev({ key: 'Enter', ctrlKey: true }), false)).toBe('Mod+Enter');
  });

  it('maps the platform command key to Mod, and spells out the other one', () => {
    expect(chordOf(ev({ key: 'z', ctrlKey: true }), false)).toBe('Mod+Z');
    expect(chordOf(ev({ key: 'z', metaKey: true }), true)).toBe('Mod+Z');
    expect(chordOf(ev({ key: 'z', ctrlKey: true }), true)).toBe('Ctrl+Z');
    expect(chordOf(ev({ key: 'z', metaKey: true }), false)).toBe('Meta+Z');
    expect(chordOf(ev({ key: 'z', ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe('Mod+Alt+Shift+Z');
  });

  it('reads the physical key when the layout types something that is not ASCII', () => {
    expect(chordOf(ev({ key: 'т', code: 'KeyN' }), false)).toBe('N');
    expect(chordOf(ev({ key: 'Я', code: 'KeyZ', ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+Z');
    expect(chordOf(ev({ key: 'х', code: 'BracketLeft' }), false)).toBe('[');
    expect(chordOf(ev({ key: 'Х', code: 'BracketLeft', shiftKey: true }), false)).toBe('{');
    expect(chordOf(ev({ key: '№', code: 'Digit3', shiftKey: true }), false)).toBe('#');
  });

  it('follows the typed letter on a remapped Latin layout (Dvorak), not the key position', () => {
    expect(chordOf(ev({ key: 'n', code: 'KeyL' }), false)).toBe('N');
  });

  it('is null for a bare modifier or a dead key — nothing to bind yet', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified']) {
      expect(chordOf(ev({ key }), false)).toBeNull();
    }
    expect(chordOf(ev({ key: 'ы', code: 'Unknown' }), false)).toBeNull();
  });
});

describe('formatChord', () => {
  it('spells modifiers out off a Mac', () => {
    expect(formatChord('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatChord('N', false)).toBe('N');
    expect(formatChord('Mod+Enter', false)).toBe('Ctrl+Enter');
  });
  it('uses the Mac glyphs in the Mac order, with no separators', () => {
    expect(formatChord('Mod+Shift+Z', true)).toBe('⇧⌘Z');
    expect(formatChord('Ctrl+Alt+K', true)).toBe('⌃⌥K');
  });
  it('survives a chord whose key is the plus sign', () => {
    expect(formatChord('+', false)).toBe('+');
    expect(formatChord('Mod++', false)).toBe('Ctrl++');
  });
  it('shortens the long key names', () => {
    expect(formatChord('Escape', false)).toBe('Esc');
    expect(formatChord('ArrowUp', false)).toBe('↑');
  });
});
