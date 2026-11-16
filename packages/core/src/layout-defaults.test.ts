import { describe, expect, it } from 'vitest';
import { model } from './builder/index';
import { defaultLayoutDirection } from './layout-defaults';

describe('defaultLayoutDirection', () => {
  it('flows down: a page scrolls vertically, and boxes are wide and short', () => {
    const m = model('d');
    m.node('a', { type: 'service' });
    expect(defaultLayoutDirection(m.toJSON())).toBe('DOWN');
    expect(defaultLayoutDirection({ nodes: [], planes: [] })).toBe('DOWN');
  });

  it('flows right where activity frames are drawn — their lanes are horizontal bands', () => {
    const m = model('act');
    m.activity('flow').lane('a', { name: 'A' }).action('x', 'Do it');
    expect(defaultLayoutDirection(m.toJSON())).toBe('RIGHT');
  });

  it('flows right for a state machine: transitions read as a left-to-right story', () => {
    const m = model('sm');
    m.stateMachine('machine');
    expect(m.toJSON().planes).toEqual([]);
    expect(defaultLayoutDirection(m.toJSON())).toBe('RIGHT');
  });

  it('flows right only on the plane that draws the machine', () => {
    const m = model('both');
    m.plane('arch', { name: 'Architecture', notation: 'c4' });
    m.node('api', { type: 'service', plane: 'arch' });
    m.stateMachine('order', { plane: 'life' });
    const json = m.toJSON();
    expect(defaultLayoutDirection(json, 'arch')).toBe('DOWN');
    expect(defaultLayoutDirection(json)).toBe('DOWN'); // the first-declared plane is viewed
    expect(defaultLayoutDirection(json, 'life')).toBe('RIGHT');
  });

  it('keeps an activity frame model-wide', () => {
    const m = model('act');
    m.plane('arch', { name: 'Architecture', notation: 'c4' });
    m.activity('flow').lane('a', { name: 'A' }).action('x', 'Do it');
    expect(defaultLayoutDirection(m.toJSON(), 'arch')).toBe('RIGHT');
  });
});
