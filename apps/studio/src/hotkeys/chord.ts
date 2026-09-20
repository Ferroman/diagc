/** A key binding as one canonical string: modifiers in the fixed order Mod,
 *  Ctrl|Meta, Alt, Shift, then the key — 'Mod+Shift+Z', 'F2', '?', '['. `Mod` is
 *  Cmd on a Mac and Ctrl everywhere else, so one default table serves both. */
export type Chord = string;

// Presses that are not a key to bind: a modifier on its own, or a key the
// platform has not resolved yet.
const NOT_A_KEY = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Dead', 'Unidentified', '']);

// e.code → [plain, shifted] on a US-QWERTY board: what a key MEANS when the
// active layout types something that is not ASCII (Cyrillic, Greek, …).
const CODE_SYMBOLS: Readonly<Record<string, readonly [string, string]>> = {
  Slash: ['/', '?'],
  Equal: ['=', '+'],
  Minus: ['-', '_'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Backquote: ['`', '~'],
};
const DIGIT_SHIFTED = ')!@#$%^&*(';

/** The key half of a chord, and whether Shift was spent producing it. */
function keyOf(e: KeyboardEvent): { key: string; shiftSpent: boolean } | null {
  const k = e.key;
  if (NOT_A_KEY.has(k)) return null;
  if (k === ' ') return { key: 'Space', shiftSpent: false };
  if (k.length > 1) return { key: k, shiftSpent: false }; // 'Enter', 'F2', 'ArrowUp'
  if (/^[a-zA-Z]$/.test(k)) return { key: k.toUpperCase(), shiftSpent: false };
  // Another ASCII printable: the character IS the binding, and Shift (if held)
  // is how it was typed — '?' rather than 'Shift+/'.
  if (k.charCodeAt(0) < 128) return { key: k, shiftSpent: true };
  // Not ASCII: a layout that types another script. Matching the character would
  // leave every default dead there, so read the physical key as US-QWERTY. A
  // remapped LATIN layout never gets here — it still follows the typed letter.
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter !== null) return { key: letter[1]!, shiftSpent: false };
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit !== null) {
    return e.shiftKey ? { key: DIGIT_SHIFTED[Number(digit[1])]!, shiftSpent: true } : { key: digit[1]!, shiftSpent: false };
  }
  const symbol = CODE_SYMBOLS[e.code];
  if (symbol !== undefined) return { key: e.shiftKey ? symbol[1] : symbol[0], shiftSpent: true };
  return null;
}

/** null for a press that is not a key to bind (a bare modifier, a dead key) */
export function chordOf(e: KeyboardEvent, mac: boolean): Chord | null {
  const k = keyOf(e);
  if (k === null) return null;
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (mac ? e.ctrlKey : e.metaKey) parts.push(mac ? 'Ctrl' : 'Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !k.shiftSpent) parts.push('Shift');
  parts.push(k.key);
  return parts.join('+');
}

// '+' is both the separator and a bindable key, so a plain split would lose it.
function splitChord(chord: Chord): { mods: string[]; key: string } {
  if (chord === '+') return { mods: [], key: '+' };
  if (chord.endsWith('++')) return { mods: chord.slice(0, -2).split('+'), key: '+' };
  const parts = chord.split('+');
  return { mods: parts.slice(0, -1), key: parts[parts.length - 1] ?? '' };
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const MAC_GLYPHS: Readonly<Record<string, string>> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' };
const MAC_ORDER = ['Ctrl', 'Alt', 'Shift', 'Mod'];

/** A chord as the user reads it: 'Ctrl+Shift+Z' off a Mac, '⇧⌘Z' on one. */
export function formatChord(chord: Chord, mac: boolean): string {
  const { mods, key } = splitChord(chord);
  const name = KEY_NAMES[key] ?? key;
  if (mac) return MAC_ORDER.filter((m) => mods.includes(m)).map((m) => MAC_GLYPHS[m]!).join('') + name;
  return [...mods.map((m) => (m === 'Mod' ? 'Ctrl' : m)), name].join('+');
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
