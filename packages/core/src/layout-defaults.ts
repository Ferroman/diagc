import type { DiagramModel } from './types';
import { ACTIVITY_FRAME_TYPE } from './activity/activity';
import { SM_MACHINE_TYPE } from './notations/state-machine/state-machine';

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
 * stack the labels the arrows carry on top of each other.
 *
 * In core so the renderer (which lays out) and the studio (whose direction
 * picker shows the default as selected) cannot drift.
 */
export function defaultLayoutDirection(model: Pick<DiagramModel, 'nodes'>): LayoutDirection {
  return model.nodes.some((n) => n.type === ACTIVITY_FRAME_TYPE || n.type === SM_MACHINE_TYPE) ? 'RIGHT' : 'DOWN';
}
