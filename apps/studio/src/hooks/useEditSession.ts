import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { errMessage, type DiagramModel, type Drawings, type LayoutOverlay } from '@diagramming/core';
import type { DrawTool, LayoutApi } from '@diagramming/renderer';
import type { LoadedArtifact } from '../artifacts';
import { useEditor } from '../editor/useEditor';

export interface UseEditSessionOptions {
  /** App-owned artifact store: shadow a finished session's model+layout (and a
   *  successful save's) so view mode shows the latest edits immediately,
   *  bypassing the persisted-artifact round-trip. */
  setDrafts: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  /** App-owned: reset the left inspector to its default tab on leave (re-entry
   *  then starts on Properties). */
  resetInspector: () => void;
  /** App-owned whiteboard add-node (Library Add button / N key). Read through
   *  a ref because the keydown handler subscribes once per edit session. */
  addNodeRef: MutableRefObject<() => void>;
  /** App-owned tool switch for the P / E / Escape keys; a ref for the same
   *  reason as addNodeRef (the keydown handler subscribes once per session). */
  toolKeyRef: MutableRefObject<(tool: DrawTool) => void>;
  /** App-owned, shared with useDeepLink: a cross-diagram hashchange must close
   *  any open edit session first (like every other diagram-switch path). The
   *  keydown/hashchange listeners subscribe once, so both read it through a
   *  ref — leaveEdit assigns `.current` on every render. */
  leaveEditRef: RefObject<() => boolean>;
}

export interface EditSession {
  editing: boolean;
  setEditing: Dispatch<SetStateAction<boolean>>;
  editor: ReturnType<typeof useEditor>;
  /** Populated by DiagramView in edit mode: reads current/auto positions and
   * the viewport center for the auto-layout toggle and manual new-node
   * placement. */
  layoutApiRef: MutableRefObject<LayoutApi | null>;
  /** save issues surfaced by the save flow (null = none) */
  saveIssues: { message: string }[] | null;
  setSaveIssues: Dispatch<SetStateAction<{ message: string }[] | null>>;
  saving: boolean;
  /** Single save path shared by the toolbar button and Ctrl/Cmd+S. */
  doSave: () => Promise<void>;
  /** Begin an edit session over `name`'s model+layout+drawings. */
  enterEdit: (name: string, model: DiagramModel, layout: LayoutOverlay, drawings: Drawings) => void;
  /** End the edit session (shadowing drafts + flushing a final save), returning
   * true when the caller may proceed (it always can today; the return keeps the
   * "confirm-discard handled by the caller" contract). */
  leaveEdit: () => boolean;
}

/**
 * Edit-session domain: the editor + save + autosave + keyboard shortcuts. This
 * is where the session's refs that mirror state (editorRef, doSaveRef,
 * leaveEditRef, savingRef) live — each justified by a stale-closure comment —
 * instead of crowding the App component.
 */
export function useEditSession({
  setDrafts,
  resetInspector,
  addNodeRef,
  toolKeyRef,
  leaveEditRef,
}: UseEditSessionOptions): EditSession {
  const [editing, setEditing] = useState(false);
  const [saveIssues, setSaveIssues] = useState<{ message: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const editor = useEditor();
  const editorRef = useRef(editor);
  editorRef.current = editor;
  // Synchronous re-entrancy guard: overlapping autosaves would double-POST.
  // Edits landing mid-save stay dirty and are picked up by the next tick.
  const savingRef = useRef(false);
  // Kept in a ref so the keydown handler (bound once per edit session) always
  // calls the latest doSave without re-subscribing on every render.
  const doSaveRef = useRef<() => void>(() => {});
  // Populated by DiagramView in edit mode: reads current/auto positions and the
  // viewport center for the auto-layout toggle and manual new-node placement.
  const layoutApiRef = useRef<LayoutApi | null>(null);
  const session = editor.session;

  // Single save path shared by the toolbar button and Ctrl/Cmd+S. Surfaces
  // issues (validation/HTTP/throw) uniformly and, on success, shadows the
  // compiled artifact with exactly what was saved so leaving edit shows it —
  // the creation-time draft (empty model) no longer wins forever.
  const doSave = async () => {
    if (!editor.dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const snapshot = editor.session;
    try {
      const res = await editor.save();
      if (!res.ok) {
        setSaveIssues(res.issues ?? [{ message: 'Save failed' }]);
        return;
      }
      setSaveIssues(null);
      if (snapshot !== null) {
        const { name, state } = snapshot;
        setDrafts((d) => ({
          ...d,
          [name]: { name, model: state.model, layout: state.layout, drawings: state.drawings, issues: [] },
        }));
      }
    } catch (e) {
      setSaveIssues([{ message: errMessage(e) }]);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  doSaveRef.current = () => void doSave();

  const leaveEdit = (): boolean => {
    if (!editing) return true;
    // Autosave replaces the old discard prompt (undo covers mistakes). Shadow the
    // compiled artifact with the latest edits so view mode shows them immediately,
    // and flush a final save — a failure re-surfaces the banner in view mode.
    const snap = editor.session;
    if (editor.dirty && snap !== null) {
      setDrafts((d) => ({
        ...d,
        [snap.name]: {
          name: snap.name,
          model: snap.state.model,
          layout: snap.state.layout,
          drawings: snap.state.drawings,
          issues: [],
        },
      }));
      void doSave();
    }
    editor.stop();
    setEditing(false);
    resetInspector(); // re-entering edit starts on Properties
    setSaveIssues(null);
    return true;
  };
  leaveEditRef.current = leaveEdit;

  const enterEdit = (name: string, model: DiagramModel, layout: LayoutOverlay, drawings: Drawings) => {
    if (model === undefined) return;
    editor.start(name, { model, layout, drawings });
    setSaveIssues(null);
    setEditing(true);
  };

  // Undo/redo/save keys, edit-mode only, ignored inside form fields.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey || e.altKey) && key === 'n') {
        e.preventDefault();
        addNodeRef.current();
        return;
      }
      if (!(e.metaKey || e.ctrlKey || e.altKey) && (key === 'p' || key === 'e' || e.key === 'Escape')) {
        e.preventDefault();
        toolKeyRef.current(key === 'p' ? 'pen' : key === 'e' ? 'eraser' : 'select');
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editorRef.current.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        editorRef.current.redo();
      } else if (key === 's') {
        e.preventDefault();
        doSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, addNodeRef, toolKeyRef]);

  // Autosave: a short debounce after the last edit. `session` changes identity on
  // every dispatch, so each edit reschedules; once a save clears `dirty`, the
  // effect re-runs and stops. A failed save still surfaces in the banner — undo
  // reverses edits, but it cannot recover a save that never reached disk.
  useEffect(() => {
    if (!editing || !editor.dirty) return;
    const t = setTimeout(() => doSaveRef.current(), 300);
    return () => clearTimeout(t);
  }, [editing, session, editor.dirty]);

  return {
    editing,
    setEditing,
    editor,
    layoutApiRef,
    saveIssues,
    setSaveIssues,
    saving,
    doSave,
    enterEdit,
    leaveEdit,
  };
}
