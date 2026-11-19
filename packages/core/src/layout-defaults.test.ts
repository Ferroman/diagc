import { describe, expect, it } from 'vitest';
import { model } from './builder/index';
import { defaultLayoutDirection } from './layout-defaults';

describe('defaultLayoutDirection', () => {
  it('flows down: a page scrolls vertically, and boxes are wide and short', () => {
    const m = model('d');
    m.node('a', { type: 'service' });
    expect(defaultLayoutDirection(m.toJSON())).toBe('DOWN');
    expect(defaultLayoutDirection({ nodes: [] })).toBe('DOWN');
  });

  it('flows down for an activity too: its lanes are columns', () => {
    const m = model('act');
    m.activity('flow').lane('a', { name: 'A' }).action('x', 'Do it');
    expect(defaultLayoutDirection(m.toJSON())).toBe('DOWN');
  });

  it('flows down for a state machine, like any other diagram', () => {
    const m = model('sm');
    m.stateMachine('machine');
    expect(defaultLayoutDirection(m.toJSON())).toBe('DOWN');
  });
});
