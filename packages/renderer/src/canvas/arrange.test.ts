import { describe, expect, it } from 'vitest';
import type { Box } from './box';
import { alignBoxes, distributeBoxes, dropDescendants } from './arrange';

const b = (id: string, x: number, y: number, w = 100, h = 50): Box => ({ id, x, y, w, h });

describe('alignBoxes', () => {
  const boxes = [b('a', 0, 0), b('c', 40, 80, 200, 100), b('d', 10, 30)];

  it('left/top move every box to the smallest edge', () => {
    expect(alignBoxes(boxes, 'left')).toEqual({ c: { dx: -40, dy: 0 }, d: { dx: -10, dy: 0 } });
    expect(alignBoxes(boxes, 'top')).toEqual({ c: { dx: 0, dy: -80 }, d: { dx: 0, dy: -30 } });
  });

  it('right/bottom move every box to the largest far edge', () => {
    // far right = c at 240; a's right 100 → +140, d's right 110 → +130
    expect(alignBoxes(boxes, 'right')).toEqual({ a: { dx: 140, dy: 0 }, d: { dx: 130, dy: 0 } });
    expect(alignBoxes(boxes, 'bottom')).toEqual({ a: { dx: 0, dy: 130 }, d: { dx: 0, dy: 100 } });
  });

  it('centre modes align on the mean of the centres', () => {
    // centres x: 50, 140, 60 → mean 83.333…
    const r = alignBoxes(boxes, 'centerX');
    expect(r['a']!.dx).toBeCloseTo(33.333, 2);
    expect(r['c']!.dx).toBeCloseTo(-56.667, 2);
    expect(r['d']!.dx).toBeCloseTo(23.333, 2);
    expect(Object.values(r).every((d) => d.dy === 0)).toBe(true);
  });

  it('omits boxes that would not move, and needs at least two boxes', () => {
    expect(alignBoxes([b('a', 0, 0), b('z', 0, 99)], 'left')).toEqual({});
    expect(alignBoxes([b('a', 5, 5)], 'left')).toEqual({});
  });
});

describe('distributeBoxes', () => {
  it('keeps the outermost boxes and equalises the gaps between edges', () => {
    // a [0..100], m [110..210], z [400..500]: span 500, boxes 300 → gap 100
    const r = distributeBoxes([b('a', 0, 0), b('m', 110, 0), b('z', 400, 0)], 'x');
    expect(r).toEqual({ m: { dx: 90, dy: 0 } });
  });

  it('sorts by position, so input order does not matter, and works vertically', () => {
    const r = distributeBoxes([b('z', 0, 400), b('a', 0, 0), b('m', 0, 90)], 'y');
    expect(r).toEqual({ m: { dx: 0, dy: 110 } }); // span 450, boxes 150 → gap 150 → m at 200
  });

  it('needs at least three boxes', () => {
    expect(distributeBoxes([b('a', 0, 0), b('z', 300, 0)], 'x')).toEqual({});
  });
});

describe('dropDescendants', () => {
  const parentOf = (id: string) => ({ child: 'group', grandchild: 'child' })[id];
  it('removes ids whose ancestor is also selected', () => {
    expect(dropDescendants(['group', 'child', 'grandchild', 'other'], parentOf)).toEqual(['group', 'other']);
  });
  it('keeps a child whose parent is not selected', () => {
    expect(dropDescendants(['child', 'other'], parentOf)).toEqual(['child', 'other']);
  });
});
