import {
  applyCommandWithResult,
  CommandError,
  type EditorCommand,
  type EditorState,
} from '@diagramming/core';

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
  try {
    const hadPlanes = (s.state.model.planes ?? []).length > 0;
    const { state, relationId } = applyCommandWithResult(s.state, command);
    let nextState = state;
    // obligation: plane-less model gains its first plane -> migrate 'default' buckets
    // (positions AND drawings: both sidecars key by the same plane id)
    if (!hadPlanes && command.type === 'upsert-plane' && (state.model.planes ?? []).length === 1) {
      const bucket = state.layout.planes['default'];
      if (bucket !== undefined) {
        const { default: _def, ...rest } = state.layout.planes;
        nextState = {
          ...nextState,
          layout: { ...state.layout, planes: { ...rest, [command.plane.id]: bucket } },
        };
      }
      const strokes = state.drawings.planes['default'];
      if (strokes !== undefined) {
        const { default: _def, ...rest } = state.drawings.planes;
        nextState = {
          ...nextState,
          drawings: { ...state.drawings, planes: { ...rest, [command.plane.id]: strokes } },
        };
      }
    }
    const past = [...s.past, { command, stateBefore: s.state }].slice(-HISTORY_CAP);
    return {
      ...s,
      state: nextState,
      past,
      future: [],
      ...(relationId !== undefined ? { lastRelationId: relationId } : {}),
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
