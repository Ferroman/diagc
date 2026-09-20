import { useEffect, useRef, type RefObject } from 'react';
import { actionOf, type ActionId } from './actions';
import { chordOf, isMac, type Chord } from './chord';
import { lookup, type Keymap, type Mode } from './keymap';

/** What each action does right now. An action is ABSENT while its button would be
 *  hidden or disabled — the key then keeps whatever meaning the browser gives it.
 *  A handler returning `false` means "nothing to do this time", with the same effect. */
export type Handlers = Partial<Record<ActionId, (() => boolean | void) | undefined>>;

export interface UseHotkeysOptions {
  /** the studio's root element: a key aimed at anything else in the document is not ours */
  rootRef: RefObject<HTMLElement | null>;
  keymap: Keymap;
  mode: Mode;
  /** assigned by the host on every render, so the listener never goes stale */
  handlersRef: RefObject<Handlers>;
  /** the shortcuts dialog is open and recording keys */
  suspended: boolean;
  mac?: boolean;
}

// jsdom has no isContentEditable, and a real browser reports it on the inner
// element too — so look for the attribute on the way up as well.
const isEditable = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return t.isContentEditable === true || t.closest('[contenteditable=""], [contenteditable="true"]') !== null;
};

// The Obsidian plugin mounts the studio in the same document as the notes. A key
// pressed with focus in another pane belongs to that pane; one pressed with
// nothing focused (the target is the page itself) is fair game.
const isForeign = (t: EventTarget | null, root: HTMLElement | null): boolean =>
  t instanceof Element && t !== document.body && t !== document.documentElement && root !== null && !root.contains(t);

/** The studio's only keyboard-shortcut listener: chord → action → handler. */
export function useHotkeys({ rootRef, keymap, mode, handlersRef, suspended, mac = isMac() }: UseHotkeysOptions): void {
  // Render-phase mirror (the useEditSession pattern): the listener subscribes
  // once and still reads this render's keymap, mode and suspension.
  const now = useRef({ keymap, mode, suspended });
  now.current = { keymap, mode, suspended };
  // Whether the non-repeat press of the chord now being held was claimed — its
  // auto-repeats are swallowed only if so (Ctrl+S held must not open the
  // browser's Save dialog; Tab held with nothing to add must still walk focus).
  const held = useRef<{ chord: Chord; claimed: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { keymap, mode, suspended } = now.current;
      if (suspended || e.defaultPrevented) return;
      if (isForeign(e.target, rootRef.current)) return;
      const chord = chordOf(e, mac);
      if (chord === null) return;
      const id = lookup(keymap, chord, mode);
      if (id === undefined) return;
      const action = actionOf(id);
      // Typing wins over shortcuts — except for an action that asks to be reachable
      // from a field, and then only on a chord no field would type (a rebind to a
      // bare key must not start eating letters).
      if (isEditable(e.target) && !(action.inFields === true && (e.ctrlKey || e.metaKey || e.altKey))) return;
      if (e.repeat && action.repeat !== true) {
        if (held.current?.chord === chord && held.current.claimed) e.preventDefault();
        return;
      }
      const handler = handlersRef.current?.[id];
      const claimed = handler !== undefined && handler() !== false;
      if (!e.repeat) held.current = { chord, claimed };
      if (claimed) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rootRef, handlersRef, mac]);
}
