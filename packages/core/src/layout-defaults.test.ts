import { describe, expect, it } from 'vitest';
import { model } from './builder';
import { defaultLayoutDirection } from './layout-defaults';

describe('defaultLayoutDirection', () => {
  it('flows down: a page scrolls vertically, and boxes are wide and short', () => {
    const m = model('d');
    m.node('a', { type: 'service' });
    expect(defaultLayoutDirection(m.toJSON())).toBe('DOWN');
    expect(defaultLayoutDirection({ nodes: [] })).toBe('DOWN');
  });

  it('flows right where activity frames are drawn — their lanes are horizontal bands', () => {
    const m = model('act');
    m.activity('flow').lane('a', { name: 'A' }).action('x', 'Do it');
    expect(defaultLayoutDirection(m.toJSON())).toBe('RIGHT');
  });
});
