import type { DiagramModel } from './types';
import { ACTIVITY_FRAME_TYPE } from './activity/activity';
import { SM_NOTATION } from './notations/state-machine/state-machine';
import { viewedPlane } from './planes';

export type LayoutDirection = 'DOWN' | 'RIGHT' | 'LEFT' | 'UP';

/**
 * The flow direction an automatically laid-out plane takes when its settings
 * name none.
 *
 * Down. A diagram is read on a page and embedded in documents, where height
 * scrolls and width does not: a left-to-right chain of a dozen boxes becomes a
 * ribbon that has to be shrunk until its labels are unreadable, the same chain
 * top-to-bottom is a column read at full size. Boxes are also wide and short, so
 * stacking them wastes far less room than queueing them.
 *
 * The exception is a model that draws activity frames: their lanes are
 * horizontal bands (vertical lanes are a recorded deferral), and a flow that ran
 * ACROSS the bands would make every lane as tall as the whole activity.
 *
 * A state machine is the other: transitions read as a story told left to right,
 * and a machine's states are few and wide enough that a column of them would
 * stack the labels the arrows carry on top of each other. Unlike the activity
 * exception this one is per plane — `plane` is the one being viewed, absent for
 * the first-declared — because a machine drawn on a plane of its own must not
 * turn the architecture planes beside it on their side.
 *
 * In core so the renderer (which lays out) and the studio (whose direction
 * picker shows the default as selected) cannot drift.
 */
export function defaultLayoutDirection(
  model: Pick<DiagramModel, 'nodes' | 'planes' | 'notation'>,
  plane?: string,
): LayoutDirection {
  if (model.nodes.some((n) => n.type === ACTIVITY_FRAME_TYPE)) return 'RIGHT';
  const notation = viewedPlane(model.planes ?? [], plane)?.notation ?? model.notation;
  return notation === SM_NOTATION ? 'RIGHT' : 'DOWN';
}
