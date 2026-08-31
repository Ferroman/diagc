import type { DiagramModel } from '@diagramming/core';
import type { DiagramViewProps } from './view-types';

// Cut a drill path at the first id the model doesn't know — applying a stale
// deep link lands on the deepest surviving prefix instead of a blank canvas.
export function pruneToModel(path: string[], m: DiagramModel): string[] {
  const exists = new Set(m.nodes.map((n) => n.id));
  const cut = path.findIndex((id) => !exists.has(id));
  return cut < 0 ? path : path.slice(0, cut);
}

// ---------------------------------------------------------------------------
// Render-phase navigation sync (useReducer). The view keeps a snapshot of the
// props that drive navigation (model id / model object / plane / enteredPath
// prop) and, during render, compares the current props against it to decide
// which of the four transitions applies. The reducer owns that snapshot so the
// transitions are visible as data: every branch dispatches the SAME `sync`
// action with the current props snapshot, and the reducer classifies which
// transition it was. The dispatched snapshot is never read back in the same
// render (dispatching during render re-renders), which is exactly the ref
// mutation it replaces — later branches read the stale snapshot, and only the
// next render sees the updated one.
// ---------------------------------------------------------------------------

export interface SeenKey {
  modelId: string;
  model: DiagramModel;
  plane: string | undefined;
  enteredPathProp: string[] | undefined;
}

export type SyncTransition = 'model-switch' | 'plane-switch' | 'model-edit' | 'entered-path' | 'none';

export interface SyncState {
  seen: SeenKey;
  /** which transition the last sync action classified. Data, not behavior —
   * the render branches below still do their own comparisons; this just makes
   * the four transitions visible in one place (and lets the reducer be the
   * single authority on their precedence). */
  transition: SyncTransition;
}

export type SyncAction = { type: 'sync'; next: SeenKey };

export function syncReducer(prev: SyncState, action: SyncAction): SyncState {
  const seen = action.next;
  if (prev.seen.modelId !== seen.modelId) return { seen, transition: 'model-switch' };
  if (prev.seen.plane !== seen.plane) return { seen, transition: 'plane-switch' };
  if (prev.seen.model !== seen.model) return { seen, transition: 'model-edit' };
  if (prev.seen.enteredPathProp !== seen.enteredPathProp) return { seen, transition: 'entered-path' };
  return { seen, transition: 'none' };
}

export const seenKeyOf = (props: DiagramViewProps): SeenKey => ({
  modelId: props.model.id,
  model: props.model,
  plane: props.plane,
  enteredPathProp: props.enteredPath,
});
