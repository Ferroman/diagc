import { describe, expect, it } from 'vitest';
import { simplifyStroke, strokePath, strokesBounds } from './drawings';

describe('strokePath', () => {
  it('draws a single point as a zero-length segment so round caps make a dot', () => {
    expect(strokePath([10, 20])).toBe('M 10 20 L 10 20');
  });

  it('draws two points as one line', () => {
    expect(strokePath([0, 0, 10, 0])).toBe('M 0 0 L 10 0');
  });

  it('smooths three or more points through segment midpoints', () => {
    // M p0, Q p1 mid(p1,p2), then a final L to the last point
    expect(strokePath([0, 0, 10, 0, 10, 10])).toBe('M 0 0 Q 10 0 10 5 L 10 10');
  });
});

describe('simplifyStroke', () => {
  it('keeps endpoints and collapses collinear interior points', () => {
    expect(simplifyStroke([0, 0, 5, 0, 10, 0, 15, 0])).toEqual([0, 0, 15, 0]);
  });

  it('keeps a point that deviates more than epsilon', () => {
    expect(simplifyStroke([0, 0, 5, 3, 10, 0], 0.75)).toEqual([0, 0, 5, 3, 10, 0]);
  });

  it('leaves one- and two-point strokes alone', () => {
    expect(simplifyStroke([1, 1])).toEqual([1, 1]);
    expect(simplifyStroke([1, 1, 2, 2])).toEqual([1, 1, 2, 2]);
  });
});

describe('strokesBounds', () => {
  it('is undefined for no strokes and pads by half the width otherwise', () => {
    expect(strokesBounds([])).toBeUndefined();
    const b = strokesBounds([
      { id: 'a', points: [10, 10, 30, 20], width: 4 },
      { id: 'b', points: [0, 50] }, // default width 3 → pad 1.5
    ]);
    expect(b).toEqual({ x: -1.5, y: 8, width: 33.5, height: 43.5 });
  });
});
