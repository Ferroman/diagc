// The activity diagram's node types. Activity is not a notation id: a frame is an
// ordinary container on whatever plane the model uses, and several frames can
// share a canvas, so these types mean the same under any notation.
export const ACTIVITY_FRAME_TYPE = 'activity-frame' as const;
export const ACTIVITY_LANE_TYPE = 'activity-lane' as const;
/** an interruptible region: a dashed container inside a lane */
export const ACTIVITY_REGION_TYPE = 'activity-region' as const;
export const ACTIVITY_ACTION_TYPE = 'activity-action' as const;
export const ACTIVITY_DECISION_TYPE = 'activity-decision' as const;
/** a fork or join */
export const ACTIVITY_BAR_TYPE = 'activity-bar' as const;
export const ACTIVITY_START_TYPE = 'activity-start' as const;
export const ACTIVITY_END_TYPE = 'activity-end' as const;
export const ACTIVITY_SEND_TYPE = 'activity-send' as const;
export const ACTIVITY_RECEIVE_TYPE = 'activity-receive' as const;
export const ACTIVITY_OBJECT_TYPE = 'activity-object' as const;
export const ACTIVITY_NOTE_TYPE = 'activity-note' as const;

/** every activity node type, the frame and its containers first */
export const ACTIVITY_TYPES = [
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_REGION_TYPE,
  ACTIVITY_ACTION_TYPE,
  ACTIVITY_DECISION_TYPE,
  ACTIVITY_BAR_TYPE,
  ACTIVITY_START_TYPE,
  ACTIVITY_END_TYPE,
  ACTIVITY_SEND_TYPE,
  ACTIVITY_RECEIVE_TYPE,
  ACTIVITY_OBJECT_TYPE,
  ACTIVITY_NOTE_TYPE,
] as const;

/** The activity chrome: the frame and the containers flow elements are placed in
 * (a lane, and a region inside a lane). Never a flow element itself. */
export const ACTIVITY_CHROME_TYPES: ReadonlySet<string> = new Set([
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_REGION_TYPE,
]);

export const isActivityChrome = (type: string | undefined): boolean =>
  type !== undefined && ACTIVITY_CHROME_TYPES.has(type);

/** The chrome laid out as bands: the frame and the lanes it stacks. A region is
 * chrome but not a band; it sits inside a lane. */
export const isActivityBand = (type: string | undefined): boolean =>
  type === ACTIVITY_FRAME_TYPE || type === ACTIVITY_LANE_TYPE;

/** any type in the `activity-` namespace, a type this version does not know included */
export const isActivityType = (type: string | undefined): boolean => type !== undefined && type.startsWith('activity-');
