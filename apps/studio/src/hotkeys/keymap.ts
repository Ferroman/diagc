import { ACTIONS, actionOf, type ActionId, type Scope } from './actions';
import type { Chord } from './chord';

export const HOTKEYS_KEY = 'diagc.hotkeys';

/** What the user changed, and nothing else: an absent id keeps its defaults (so a
 *  default added in a later version still reaches them), `[]` is "unbound on purpose". */
export type Overrides = Partial<Record<ActionId, Chord[]>>;
export type Keymap = Readonly<Record<ActionId, readonly Chord[]>>;
export type Mode = 'view' | 'edit';

export function resolveKeymap(overrides: Overrides): Keymap {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, overrides[a.id] ?? a.defaults])) as Record<ActionId, readonly Chord[]>;
}

// Esc is a cancel, not a preference: it must always get you back to Select, so
// it is resolved ahead of the keymap where no override can remove or take it.
// (The laser half of Esc lives in the renderer — see useCanvasGestures.)
const FIXED_CHORDS: Readonly<Record<Chord, { id: ActionId; mode: Mode }>> = {
  Escape: { id: 'tool.select', mode: 'edit' },
};

const liveIn = (scope: Scope, mode: Mode): boolean => scope === 'both' || scope === mode;

/** the action `chord` runs in `mode`; table order breaks a (flagged) tie */
export function lookup(keymap: Keymap, chord: Chord, mode: Mode): ActionId | undefined {
  const fixed = FIXED_CHORDS[chord];
  if (fixed !== undefined) return fixed.mode === mode ? fixed.id : undefined;
  return ACTIONS.find((a) => liveIn(a.scope, mode) && keymap[a.id].includes(chord))?.id;
}

const overlaps = (a: Scope, b: Scope): boolean => a === 'both' || b === 'both' || a === b;

/** Other actions holding `chord` that can be live at the same time as `id`. A
 *  view-only and an edit-only action never meet, so they may share a key. */
export function conflictsOf(keymap: Keymap, id: ActionId, chord: Chord): ActionId[] {
  const scope = actionOf(id).scope;
  return ACTIONS.filter((a) => a.id !== id && overlaps(a.scope, scope) && keymap[a.id].includes(chord)).map((a) => a.id);
}

const FIXED = /^(Shift\+)?(Escape|Delete|Backspace|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
// copy/paste ride the browser's own clipboard events (useClipboard): a binding
// would swallow the keydown, and with it the event
const CLIPBOARD_CHORDS = new Set<Chord>(['Mod+C', 'Mod+V']);
const PRESSES_FOCUSED = new Set<Chord>(['Enter', 'Space']);
// Chromium and Firefox act on these before the page sees a keydown, or ignore
// preventDefault on them — a binding would simply never fire.
const BROWSER_OWNED = new Set<Chord>([
  'Mod+N',
  'Mod+T',
  'Mod+W',
  'Mod+Shift+N',
  'Mod+Shift+T',
  'Mod+Shift+W',
  'Mod+Tab',
  'Mod+Shift+Tab',
  'Mod+Q',
  'F11',
]);

/** why `chord` cannot be bound, or null when it can */
export function reservedReason(chord: Chord): string | null {
  if (FIXED.test(chord) || CLIPBOARD_CHORDS.has(chord)) return 'This key has a fixed meaning in the studio.';
  if (PRESSES_FOCUSED.has(chord)) return 'Enter and Space press the focused button, so the action would run twice.';
  if (BROWSER_OWNED.has(chord)) return 'The browser keeps this key for itself.';
  return null;
}

/** `overrides` with `id` bound to `chords` — dropped, not stored, when that is the default */
export function withBinding(overrides: Overrides, id: ActionId, chords: readonly Chord[]): Overrides {
  const next: Overrides = { ...overrides };
  const defaults = actionOf(id).defaults;
  if (chords.length === defaults.length && chords.every((c, i) => c === defaults[i])) delete next[id];
  else next[id] = [...chords];
  return next;
}

const KNOWN = new Set<string>(ACTIONS.map((a) => a.id));

/** usePersistedState's `read`: null (= use the fallback) for nothing stored or
 *  garbage; an id this build does not know, or a value that is not a string
 *  array, is dropped rather than failing the whole keymap. */
export function parseOverrides(raw: string | null): Overrides | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const out: Overrides = {};
    for (const [id, chords] of Object.entries(parsed)) {
      if (KNOWN.has(id) && Array.isArray(chords) && chords.every((c) => typeof c === 'string')) {
        out[id as ActionId] = chords as Chord[];
      }
    }
    return out;
  } catch {
    return null;
  }
}
