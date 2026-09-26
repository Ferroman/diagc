import { useEffect, useRef, type RefObject } from 'react';
import type { DiagramSelection, LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../editor/useEditor';
import { copySelection, parseClipboard, pasteCommand, serializeClipboard } from '../editor/clipboard';

export interface UseClipboardOptions {
  editing: boolean;
  editor: EditorApi;
  layoutApiRef: RefObject<LayoutApi | null>;
  activePlane: string | undefined;
  activePlaneBorrowsContainment: boolean;
  /** elk will not place a paste on a manual plane, so a copy there records
   * where things stand on screen */
  activePlaneManual: boolean;
  penLayer: string | null;
  /** the single selection (a click) … */
  selection: DiagramSelection | null;
  /** … and the canvas multi-selection (Shift+click / marquee), which wins when set */
  multiSelection: readonly string[];
  select: (sel: DiagramSelection | null) => void;
}

/** A field, or text the user has highlighted: the browser's own copy/paste. */
function isTextTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]') !== null)) {
    return true;
  }
  const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
  return sel !== null && !sel.isCollapsed && sel.toString() !== '';
}

/**
 * Ctrl/⌘+C and Ctrl/⌘+V on the canvas, in edit mode: copy the selected nodes
 * (with what they contain and the relations among them) to the system
 * clipboard, and paste a copy — from this diagram, another one, or another
 * studio tab — as one undoable batch (see editor/clipboard.ts for the rules).
 *
 * Bound to the DOM `copy`/`paste` events rather than to keys: reading the
 * clipboard from a key handler needs a permission prompt, the paste event hands
 * it over for free — and the browser's Edit menu works too. Not rebindable for
 * the same reason (listed under the fixed keys). A field, or highlighted text,
 * keeps the browser's own behaviour; so does clipboard text that is not ours.
 */
export function useClipboard(opts: UseClipboardOptions): void {
  // Read through a ref: the listeners are bound once per edit session, and must
  // still see this render's selection and layout.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // How often the current clipboard text was pasted, so each paste steps
  // further — and what the last paste made, so a paste over it (it is selected
  // afterwards) repeats beside it rather than nesting into it.
  const pastedRef = useRef<{ text: string; count: number; roots: readonly string[] } | null>(null);

  useEffect(() => {
    if (!opts.editing) return;
    const onCopy = (e: ClipboardEvent) => {
      const o = optsRef.current;
      if (e.clipboardData === null || isTextTarget(e.target)) return;
      const m = o.editor.peek()?.state.model;
      if (m === undefined) return;
      const ids =
        o.multiSelection.length > 0 ? o.multiSelection : o.selection?.kind === 'node' ? [o.selection.id] : [];
      const onScreen = o.activePlaneManual ? (o.layoutApiRef.current?.snapshotPositions() ?? {}) : {};
      const payload = copySelection(m, o.editor.peek()?.state.layout, o.activePlane, ids, onScreen);
      if (payload === null) return;
      const text = serializeClipboard(payload);
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      pastedRef.current = { text, count: 0, roots: [] };
    };
    const onPaste = (e: ClipboardEvent) => {
      const o = optsRef.current;
      if (e.clipboardData === null || isTextTarget(e.target)) return;
      const text = e.clipboardData.getData('text/plain');
      const payload = parseClipboard(text);
      const m = o.editor.peek()?.state.model;
      if (payload === null || m === undefined) return;
      e.preventDefault();
      const last = pastedRef.current?.text === text ? pastedRef.current : null;
      const repeat = last?.count ?? 0;
      const selected = o.selection?.kind === 'node' ? o.selection.id : undefined;
      const out = pasteCommand(m, payload, {
        plane: o.activePlane,
        borrowsContainment: o.activePlaneBorrowsContainment,
        penLayer: o.penLayer,
        selected: selected !== undefined && last?.roots.includes(selected) === true ? undefined : selected,
        repeat,
      });
      if (out === null) return;
      o.editor.dispatch(out.command);
      pastedRef.current = { text, count: repeat + 1, roots: out.roots };
      const first = out.roots[0];
      if (first !== undefined) o.select({ kind: 'node', id: first });
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [opts.editing]);
}
