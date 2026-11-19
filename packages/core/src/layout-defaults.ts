import type { DiagramModel } from './types';

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
 * An activity is no exception: its lanes run along the flow, so they stand as
 * columns under this default and lie as rows where the settings say `RIGHT`.
 *
 * In core so the renderer (which lays out) and the studio (whose direction
 * picker shows the default as selected) cannot drift. It takes the model because
 * the answer is the model's to give, though today every model gives the same.
 */
export function defaultLayoutDirection(_model: Pick<DiagramModel, 'nodes'>): LayoutDirection {
  return 'DOWN';
}
