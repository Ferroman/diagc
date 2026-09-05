import { useCallback, useRef, useState } from 'react';
import { validate, type EditorCommand, type EditorState } from '@diagramming/core';
import {
  dispatch as reduce,
  isDirty,
  redo as reduceRedo,
  startSession,
  undo as reduceUndo,
  type EditorSession,
} from './reducer';
import { getHost } from '../host';

export interface EditorApi {
  session: EditorSession | null;
  /** synchronous session read — unlike `session`, reflects dispatches made this tick */
  peek: () => EditorSession | null;
  start: (name: string, state: EditorState) => void;
  stop: () => void;
  dispatch: (c: EditorCommand) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  save: () => Promise<{ ok: boolean; issues?: { message: string }[] }>;
}

export function useEditor(): EditorApi {
  const [session, setSession] = useState<EditorSession | null>(null);
  // The ref is the synchronous source of truth so that mutators dispatched in the
  // same tick as save() (or during an in-flight save) are never lost: save reads a
  // snapshot at entry and, on success, marks only that snapshot saved — leaving any
  // edits that landed meanwhile still dirty.
  const sessionRef = useRef<EditorSession | null>(null);

  const set = useCallback((next: EditorSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const mutate = useCallback(
    (fn: (s: EditorSession) => EditorSession) => {
      const cur = sessionRef.current;
      if (cur === null) return;
      set(fn(cur));
    },
    [set],
  );

  const save = useCallback(async (): Promise<{ ok: boolean; issues?: { message: string }[] }> => {
    const snapshot = sessionRef.current;
    if (snapshot === null) return { ok: false, issues: [{ message: 'No editing session' }] };
    const issues = validate(snapshot.state.model);
    if (issues.length > 0) return { ok: false, issues };
    const post = async (kind: 'diagrams' | 'layouts' | 'drawings', body: unknown) => {
      const res = await getHost().apiFetch(`/api/${kind}/${snapshot.name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok ? null : ((await res.json()) as { issues?: { message: string }[] });
    };
    const modelErr = await post('diagrams', snapshot.state.model);
    if (modelErr !== null) return { ok: false, issues: modelErr.issues ?? [{ message: 'Save failed' }] };
    const layoutErr = await post('layouts', snapshot.state.layout);
    if (layoutErr !== null) return { ok: false, issues: layoutErr.issues ?? [{ message: 'Layout save failed' }] };
    // Structural sharing makes identity a precise "did anything change" test:
    // an untouched diagram never writes (or creates) its drawings sidecar.
    if (snapshot.state.drawings !== snapshot.savedState.drawings) {
      const drawingsErr = await post('drawings', snapshot.state.drawings);
      if (drawingsErr !== null) return { ok: false, issues: drawingsErr.issues ?? [{ message: 'Drawings save failed' }] };
    }
    // Mark exactly what was posted as saved. Reading the live session (not the
    // snapshot) keeps edits dispatched during the save dirty, since their state
    // differs from the posted savedState.
    const cur = sessionRef.current;
    if (cur !== null) set({ ...cur, savedState: snapshot.state });
    return { ok: true };
  }, [set]);

  return {
    session,
    peek: () => sessionRef.current,
    start: (name, state) => set(startSession(name, state)),
    stop: () => set(null),
    dispatch: (c) => mutate((s) => reduce(s, c)),
    undo: () => mutate((s) => reduceUndo(s)),
    redo: () => mutate((s) => reduceRedo(s)),
    canUndo: (session?.past.length ?? 0) > 0,
    canRedo: (session?.future.length ?? 0) > 0,
    dirty: session !== null && isDirty(session),
    save,
  };
}
