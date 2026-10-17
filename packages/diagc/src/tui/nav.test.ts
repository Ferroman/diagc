import { describe, expect, it } from 'vitest';
import type { BoxGeometry } from '../text/layout';
import { clampScroll, follow, hitTest, nearest, readingOrder } from './nav';

// a 3×3 grid of 10×3 boxes, 10 columns and 3 rows apart
const grid = new Map<string, BoxGeometry>();
for (const [r, row] of ['top', 'mid', 'bot'].entries()) {
  for (const [c, col] of ['l', 'c', 'r'].entries()) {
    grid.set(`${row}-${col}`, { x: c * 20, y: r * 6, width: 10, height: 3 });
  }
}

describe('nearest', () => {
  it('moves to the next box in the direction', () => {
    expect(nearest(grid, 'mid-c', 'up')).toBe('top-c');
    expect(nearest(grid, 'mid-c', 'down')).toBe('bot-c');
    expect(nearest(grid, 'mid-c', 'left')).toBe('mid-l');
    expect(nearest(grid, 'mid-c', 'right')).toBe('mid-r');
  });

  it('finds nothing past the edge', () => {
    expect(nearest(grid, 'top-c', 'up')).toBeUndefined();
    expect(nearest(grid, 'mid-r', 'right')).toBeUndefined();
  });

  it('prefers the box most in line over a nearer one off to the side', () => {
    const boxes = new Map<string, BoxGeometry>([
      ['from', { x: 0, y: 0, width: 10, height: 3 }],
      ['ahead', { x: 0, y: 20, width: 10, height: 3 }],
      ['aside', { x: 30, y: 6, width: 10, height: 3 }],
    ]);
    expect(nearest(boxes, 'from', 'down')).toBe('ahead');
  });

  it('finds nothing from a box it does not know', () => {
    expect(nearest(grid, 'nope', 'up')).toBeUndefined();
  });
});

describe('readingOrder', () => {
  it('reads top to bottom, then left to right', () => {
    expect(readingOrder(grid).slice(0, 4)).toEqual(['top-l', 'top-c', 'top-r', 'mid-l']);
  });
});

describe('hitTest', () => {
  it('finds the smallest box holding the cell', () => {
    const boxes = new Map<string, BoxGeometry>([
      ['outer', { x: 0, y: 0, width: 30, height: 10 }],
      ['inner', { x: 2, y: 2, width: 6, height: 3 }],
    ]);
    expect(hitTest(boxes, 3, 3)).toBe('inner');
    expect(hitTest(boxes, 20, 8)).toBe('outer');
    expect(hitTest(boxes, 40, 40)).toBeUndefined();
  });
});

describe('follow', () => {
  const view = { width: 20, height: 10 };
  it('scrolls just enough to show the box and a margin', () => {
    expect(follow({ x: 0, y: 0 }, { x: 30, y: 0, width: 5, height: 3 }, view)).toEqual({ x: 17, y: 0 });
    expect(follow({ x: 40, y: 20 }, { x: 30, y: 15, width: 5, height: 3 }, view)).toEqual({ x: 28, y: 13 });
  });

  it('leaves the scroll alone for a box in view', () => {
    expect(follow({ x: 0, y: 0 }, { x: 5, y: 2, width: 5, height: 3 }, view)).toEqual({ x: 0, y: 0 });
  });

  it('shows the top-left of a box bigger than the view', () => {
    expect(follow({ x: 0, y: 0 }, { x: 50, y: 30, width: 40, height: 30 }, view)).toEqual({ x: 48, y: 28 });
  });

  describe('with the overview over the corner', () => {
    // the overview's frame: the view's last 8 columns of its last 4 rows
    const covered = { ...view, corner: { width: 8, height: 4 } };

    it('moves a box out from under it the shorter way', () => {
      expect(follow({ x: 0, y: 0 }, { x: 30, y: 5, width: 5, height: 3 }, covered)).toEqual({ x: 17, y: 4 });
    });

    it('moves a box left of it where moving it up would lose its top', () => {
      expect(follow({ x: 0, y: 0 }, { x: 30, y: 0, width: 5, height: 8 }, covered)).toEqual({ x: 25, y: 0 });
    });

    it('leaves a box clear of it where it is', () => {
      expect(follow({ x: 0, y: 0 }, { x: 5, y: 2, width: 5, height: 3 }, covered)).toEqual({ x: 0, y: 0 });
    });
  });
});

describe('clampScroll', () => {
  it('keeps the scroll inside the content', () => {
    const content = { width: 100, height: 50 };
    const view = { width: 20, height: 10 };
    expect(clampScroll({ x: -5, y: -1 }, content, view)).toEqual({ x: 0, y: 0 });
    expect(clampScroll({ x: 500, y: 500 }, content, view)).toEqual({ x: 80, y: 40 });
    expect(clampScroll({ x: 5, y: 5 }, { width: 10, height: 5 }, view)).toEqual({ x: 0, y: 0 });
  });

  it('lets the scroll run past the right and the bottom as far as the overview covers, so nothing stays under it', () => {
    const view = { width: 20, height: 10, corner: { width: 8, height: 4 } };
    expect(clampScroll({ x: 500, y: 500 }, { width: 100, height: 50 }, view)).toEqual({ x: 88, y: 44 });
  });
});
