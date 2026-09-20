import {
  applyCommandWithResult,
  CommandError,
  type EditorCommand,
  type EditorState,
} from '@diagc/core';

export interface HistoryEntry {
  command: EditorCommand;
  stateBefore: EditorState;
}

export interface EditorSession {
  name: string;
  state: EditorState;
  savedState: EditorState;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastRelationId?: string;
  error?: string;
}

export const HISTORY_CAP = 100;

export function startSession(name: string, state: EditorState): EditorSession {
  return { name, state, savedState: state, past: [], future: [] };
}

export const isDirty = (s: EditorSession): boolean => s.state !== s.savedState;

export function dispatch(s: EditorSession, command: EditorCommand): EditorSession {
  // An empty batch changes nothing; recording it would add an undo step that
  // undoes nothing.
  if (command.type === 'batch' && command.commands.length === 0) return s;
  try {
    const hadPlanes = (s.state.model.planes ?? []).length > 0;
    const { state, relationId } = applyCommandWithResult(s.state, command);
    let nextState = state;
    // obligation: plane-less model gains its first plane -> migrate 'default' buckets
    // (positions AND drawings: both sidecars key by the same plane id). Keyed on the
    // state transition, not on `command.type === 'upsert-plane'` — the upsert can arrive
    // nested inside a batch (or any future composite command), so only "no planes before,
    // exactly one after" reliably detects it.
    const newPlanes = state.model.planes ?? [];
    if (!hadPlanes && newPlanes.length === 1) {
      const planeId = newPlanes[0]!.id;
      const bucket = state.layout.planes['default'];
      if (bucket !== undefined) {
        const { default: _def, ...rest } = state.layout.planes;
        nextState = {
          ...nextState,
          layout: { ...state.layout, planes: { ...rest, [planeId]: bucket } },
        };
      }
      const strokes = state.drawings.planes['default'];
      if (strokes !== undefined) {
        const { default: _def, ...rest } = state.drawings.planes;
        nextState = {
          ...nextState,
          drawings: { ...state.drawings, planes: { ...rest, [planeId]: strokes } },
        };
      }
    }
    const past = [...s.past, { command, stateBefore: s.state }].slice(-HISTORY_CAP);
    // lastRelationId exists solely so App.tsx can select the edge a canvas
    // connect gesture just drew — it must fire only for that exact gesture
    // shape (a bare add-relation), never for a batch. applyCommandWithResult
    // surfaces relationId for any relation-ending batch too (by design, for
    // programmatic callers), but a panel like GitPanel that ends its own
    // batch in add-relation and then calls onSelect itself would otherwise
    // have that selection clobbered one tick later by the connect-gesture
    // effect. Keyed on `command.type`, not on whether relationId came back.
    const surfacesRelationId = command.type === 'add-relation';
    return {
      ...s,
      state: nextState,
      past,
      future: [],
      ...(surfacesRelationId && relationId !== undefined ? { lastRelationId: relationId } : {}),
      error: undefined,
    };
  } catch (e) {
    if (e instanceof CommandError) return { ...s, error: e.message };
    throw e;
  }
}

export function undo(s: EditorSession): EditorSession {
  const entry = s.past.at(-1);
  if (entry === undefined) return s;
  return {
    ...s,
    state: entry.stateBefore,
    past: s.past.slice(0, -1),
    future: [...s.future, { command: entry.command, stateBefore: s.state }],
    error: undefined,
  };
}

export function redo(s: EditorSession): EditorSession {
  const entry = s.future.at(-1);
  if (entry === undefined) return s;
  return {
    ...s,
    state: entry.stateBefore,
    past: [...s.past, { command: entry.command, stateBefore: s.state }].slice(-HISTORY_CAP),
    future: s.future.slice(0, -1),
    error: undefined,
  };
}
