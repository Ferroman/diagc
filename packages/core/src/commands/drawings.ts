import type { Stroke } from '../types';
import { addStroke, deleteStroke } from '../drawings';
import { layoutPlaneKey } from '../planes';
import type { Handlers } from './index';

/** Commands on the freehand-drawings sidecar, which files strokes by plane like the layout. */
export type DrawingCommand =
  { type: 'add-stroke'; plane?: string; stroke: Stroke } | { type: 'delete-stroke'; plane?: string; id: string };

export const DRAWING_HANDLERS: Handlers<DrawingCommand> = {
  'add-stroke': (state, { plane, stroke }) => ({
    state: { ...state, drawings: addStroke(state.drawings, layoutPlaneKey(state.model, plane), stroke) },
  }),
  'delete-stroke': (state, { plane, id }) => ({
    state: { ...state, drawings: deleteStroke(state.drawings, layoutPlaneKey(state.model, plane), id) },
  }),
};
