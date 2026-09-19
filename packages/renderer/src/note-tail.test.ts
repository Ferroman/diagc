import { describe, expect, it } from 'vitest';
import { tailGeometry } from './note-tail';

// a 220×80 bubble; the badge is given in the bubble's own space (0,0 = top-left)
const size = { width: 220, height: 80 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('tailGeometry', () => {
  it('leaves from the bottom edge, near the corner closest to a badge below-right, and stops at the pill', () => {
    const tail = tailGeometry({ x: 240, y: 100 }, size);
    expect(tail?.side).toBe('bottom');
    // the base sits just inside the border so its fill covers the border line
    expect(tail?.base[0].y).toBe(78);
    expect(tail?.base[1].y).toBe(78);
    // clamped clear of the rounded corner: the base ends before the 12px radius zone
    expect(tail?.base[1].x).toBeLessThanOrEqual(208);
    expect(tail?.base[0].x).toBeGreaterThanOrEqual(12);
    // the tip stops short of the badge centre by the pill's radius plus a hair
    expect(dist(tail!.tip, { x: 240, y: 100 })).toBeCloseTo(11, 5);
    expect(tail!.tip.y).toBeLessThan(100);
  });

  it('leaves from the left edge, level with a badge to the left', () => {
    const tail = tailGeometry({ x: -30, y: 40 }, size);
    expect(tail?.side).toBe('left');
    expect(tail?.base.map((p) => p.x)).toEqual([2, 2]);
    expect(tail?.base.map((p) => p.y)).toEqual([33, 47]);
  });

  it('prefers a vertical side on a diagonal tie', () => {
    expect(tailGeometry({ x: -14, y: -14 }, size)?.side).toBe('top');
    expect(tailGeometry({ x: 234, y: 94 }, size)?.side).toBe('bottom');
  });

  it('draws nothing for a badge under the bubble, or one too close for a tail to show', () => {
    expect(tailGeometry({ x: 100, y: 40 }, size)).toBeNull();
    expect(tailGeometry({ x: 222, y: 40 }, size)).toBeNull();
  });
});
