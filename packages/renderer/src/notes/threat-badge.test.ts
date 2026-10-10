import { describe, expect, it } from 'vitest';
import { threatBadgeProps } from './threat-badge';

describe('threatBadgeProps', () => {
  it('counts what is open while anything is', () => {
    expect(threatBadgeProps({ open: 2, total: 3 })).toEqual({
      state: 'open',
      text: '2',
      title: '2 open of 3 threats',
    });
  });

  it('turns into a tick once every threat is handled', () => {
    // zero open is the whole point of the green state — the count would read
    // as "nothing here" rather than "nothing left"
    expect(threatBadgeProps({ open: 0, total: 4 })).toEqual({
      state: 'handled',
      text: '✓',
      title: '0 open of 4 threats',
    });
  });

  it('says `threat` in the singular', () => {
    expect(threatBadgeProps({ open: 1, total: 1 }).title).toBe('1 open of 1 threat');
    expect(threatBadgeProps({ open: 0, total: 1 }).title).toBe('0 open of 1 threat');
  });

  it('pluralises zero, the same as every other count', () => {
    // total 0 never reaches a badge (both call sites gate on it), but the
    // grammar must not depend on that gate holding
    expect(threatBadgeProps({ open: 0, total: 0 }).title).toBe('0 open of 0 threats');
  });
});
