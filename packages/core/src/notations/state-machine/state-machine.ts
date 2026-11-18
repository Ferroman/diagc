/** The notation id a plane (or the model) declares to be drawn as a UML state
 * machine. Pure — the renderer and the studio derive everything from here. */
export const SM_NOTATION = 'state-machine' as const;

export const SM_MACHINE_TYPE = 'sm-machine' as const;
export const SM_STATE_TYPE = 'sm-state' as const;
export const SM_REGION_TYPE = 'sm-region' as const;
/** A zone: a titled, tinted area of a machine that holds states. A drawing aid with no
 * meaning to the machine: every rule reads a zone's content as the machine's own. */
export const SM_ZONE_TYPE = 'sm-zone' as const;
export const SM_INITIAL_TYPE = 'sm-initial' as const;
export const SM_FINAL_TYPE = 'sm-final' as const;
export const SM_CHOICE_TYPE = 'sm-choice' as const;
export const SM_JUNCTION_TYPE = 'sm-junction' as const;
export const SM_BAR_TYPE = 'sm-bar' as const;
export const SM_HISTORY_TYPE = 'sm-history' as const;
export const SM_DEEP_HISTORY_TYPE = 'sm-deep-history' as const;
export const SM_ENTRY_TYPE = 'sm-entry' as const;
export const SM_EXIT_TYPE = 'sm-exit' as const;
export const SM_TERMINATE_TYPE = 'sm-terminate' as const;

export const SM_TYPES = [
  SM_MACHINE_TYPE,
  SM_STATE_TYPE,
  SM_REGION_TYPE,
  SM_ZONE_TYPE,
  SM_INITIAL_TYPE,
  SM_FINAL_TYPE,
  SM_CHOICE_TYPE,
  SM_JUNCTION_TYPE,
  SM_BAR_TYPE,
  SM_HISTORY_TYPE,
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_TERMINATE_TYPE,
] as const;
export type SmType = (typeof SM_TYPES)[number];

/** The one relation kind a state machine draws: a transition between two vertices. */
export const SM_TRANSITION_KIND = 'transition' as const;

const SM_TYPE_SET: ReadonlySet<string> = new Set(SM_TYPES);

export const isStateMachineType = (type: string | undefined): boolean => type !== undefined && SM_TYPE_SET.has(type);

/** every sm- type except machine, state, region and zone: a vertex that is not a box holding behaviour */
export const isPseudoState = (type: string | undefined): boolean =>
  isStateMachineType(type) &&
  type !== SM_MACHINE_TYPE &&
  type !== SM_STATE_TYPE &&
  type !== SM_REGION_TYPE &&
  type !== SM_ZONE_TYPE;
