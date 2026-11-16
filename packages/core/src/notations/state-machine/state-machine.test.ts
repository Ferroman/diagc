import { describe, expect, it } from 'vitest';
import {
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TYPES,
  isPseudoState,
  isStateMachineType,
} from './state-machine';

describe('isStateMachineType', () => {
  it('knows the sm- types and nothing else', () => {
    expect(isStateMachineType('sm-state')).toBe(true);
    expect(isStateMachineType('activity-start')).toBe(false);
    expect(isStateMachineType(undefined)).toBe(false);
  });
});

describe('isPseudoState', () => {
  it('is false for machine, state and region and true for the other ten', () => {
    expect(SM_TYPES.filter(isPseudoState)).toHaveLength(10);
    for (const t of [SM_MACHINE_TYPE, SM_STATE_TYPE, SM_REGION_TYPE]) expect(isPseudoState(t)).toBe(false);
    expect(isPseudoState(undefined)).toBe(false);
    expect(isPseudoState('activity-start')).toBe(false);
  });
});
