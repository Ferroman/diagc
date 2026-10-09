import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../vocabulary';
import { ACTIVITY_TYPES, isActivityChrome, isActivityType } from './activity';

describe('activity node types', () => {
  it('are all in the node vocabulary, in one run, frame first', () => {
    const at = NODE_TYPES.indexOf('activity-frame');
    expect(NODE_TYPES.slice(at, at + ACTIVITY_TYPES.length)).toEqual([...ACTIVITY_TYPES]);
    expect(NODE_TYPES.filter((t) => t.startsWith('activity-'))).toEqual([...ACTIVITY_TYPES]);
  });

  it('call the frame, a lane and a region chrome, and nothing else', () => {
    expect(ACTIVITY_TYPES.filter(isActivityChrome)).toEqual(['activity-frame', 'activity-lane', 'activity-region']);
    expect(isActivityChrome(undefined)).toBe(false);
    expect(isActivityChrome('branch')).toBe(false);
  });

  it('count any activity- type as one, a future one included', () => {
    expect(ACTIVITY_TYPES.every(isActivityType)).toBe(true);
    expect(isActivityType('activity-swimlane')).toBe(true);
    expect(isActivityType('action')).toBe(false);
    expect(isActivityType(undefined)).toBe(false);
  });
});
