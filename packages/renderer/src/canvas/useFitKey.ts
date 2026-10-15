import { useEffect, useRef } from 'react';

/**
 * Whether a key press is the canvas's to act on: not typed into a field, and
 * with no modifier held (Ctrl+L is the browser's address bar, Ctrl+F its find).
 * Window-level listeners share it, so every built-in key yields the same way.
 */
export function isPlainKey(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true) return false;
  return !(e.metaKey || e.ctrlKey || e.altKey);
}

export interface FitKeyInput {
  /** the export render: no one is at the keyboard */
  chromeless: boolean;
  /** false = a host dispatches the canvas keys itself (the studio's configurable hotkeys) */
  builtinKeys: boolean;
  /** what F does: the canvas's own fit (nodes ∪ drawings) */
  fit: () => void;
}

/**
 * F fits the view — the built-in key a page with no host keymap gets (the
 * published page, an embed), as L is the laser's. Window-level like the L
 * listener and yielding by the same rule (isPlainKey), and not for a held key:
 * the fit is a jump, and a repeat would only restart it.
 */
export function useFitKey(input: FitKeyInput): void {
  // the latest fit, so the listener stays installed across renders while the
  // host rebuilds the callback every one of them
  const fitRef = useRef(input.fit);
  fitRef.current = input.fit;
  useEffect(() => {
    if (input.chromeless || !input.builtinKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.key.toLowerCase() !== 'f' || !isPlainKey(e)) return;
      e.preventDefault();
      fitRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input.chromeless, input.builtinKeys]);
}
