import { describe, expect, it } from 'vitest';
import type { Cell } from '../text/canvas';
import type { TextLayout } from '../text/layout';
import { onOverview, overviewCells, overviewJump, overviewPlace, type OverviewPlace } from './overview';

const text = (rows: Cell[][]): string[] => rows.map((r) => r.map((c) => c.ch).join(''));

// an 8×4 picture drawn at half size: 4×2 cells of 8×8 dots, a box in its top-left quarter
const layout: TextLayout = {
  width: 8,
  height: 4,
  boxes: new Map([['a', { x: 0, y: 0, width: 4, height: 2 }]]),
  routes: new Map(),
};
const half: OverviewPlace = { x: 0, y: 0, width: 4, height: 2, scale: 0.5 };
const bottomRight = { scroll: { x: 4, y: 2 }, width: 4, height: 2 };

describe('overviewPlace', () => {
  it('is nowhere when the whole picture is on screen', () => {
    expect(overviewPlace({ width: 120, height: 40 }, { top: 1, width: 120, height: 40 })).toBeUndefined();
  });

  it('is nowhere when the screen has no room for it', () => {
    expect(overviewPlace({ width: 300, height: 100 }, { top: 1, width: 20, height: 6 })).toBeUndefined();
  });

  it('sits in the canvas’s bottom-right corner inside its border, the picture’s shape kept', () => {
    const place = overviewPlace({ width: 300, height: 100 }, { top: 1, width: 120, height: 40 })!;
    // room is a third of the width and half the height, less the border: 38 × 18
    expect(place).toMatchObject({ x: 81, y: 27, width: 38, height: 13 });
    expect(place.scale).toBeCloseTo(38 / 300);
    // the border's right column and bottom row are the canvas's last
    expect(place.x + place.width).toBe(119);
    expect(place.y + place.height).toBe(40);
  });

  it('is as narrow as a tall picture makes it', () => {
    expect(overviewPlace({ width: 50, height: 400 }, { top: 1, width: 120, height: 40 })).toMatchObject({
      width: 3,
      height: 18,
    });
  });
});

describe('overviewCells', () => {
  it('draws each box’s outline and the screen’s, the picture scaled down', () => {
    expect(text(overviewCells(layout, half, bottomRight))).toEqual(['⣏⣹  ', '  ⣏⣹']);
  });

  it('dims what is off screen', () => {
    const rows = overviewCells(layout, half, bottomRight);
    expect(rows.map((r) => r.map((c) => c.style.dim === true))).toEqual([
      [true, true, true, true],
      [true, true, false, false],
    ]);
  });

  it('draws the selected box inverse, off screen or not', () => {
    const rows = overviewCells(layout, half, bottomRight, 'a');
    expect(rows[0]!.slice(0, 2).map((c) => c.style)).toEqual([{ inverse: true }, { inverse: true }]);
    expect(rows[0]![2]!.style).toEqual({ dim: true });
  });

  it('cuts the screen’s outline at the picture’s edge, where it still shows', () => {
    const past = { scroll: { x: 6, y: 0 }, width: 4, height: 2 };
    expect(text(overviewCells({ ...layout, boxes: new Map() }, half, past))[0]).toBe('   ⣿');
  });
});

describe('overviewJump', () => {
  // an 80×40 picture at a tenth: 8×4 cells from screen cell (30, 10)
  const place: OverviewPlace = { x: 30, y: 10, width: 8, height: 4, scale: 0.1 };
  const picture = { width: 80, height: 40 };
  const window = { width: 20, height: 10 };

  it('centres the screen on the part of the picture under the click', () => {
    expect(overviewJump(place, { x: 34, y: 12 }, window, picture)).toEqual({ x: 35, y: 20 });
  });

  it('takes a click on the border, or a drag past it, as the nearest cell inside', () => {
    expect(overviewJump(place, { x: 29, y: 9 }, window, picture)).toEqual({ x: 0, y: 0 });
    expect(overviewJump(place, { x: 90, y: 30 }, window, picture)).toEqual({ x: 60, y: 30 });
  });
});

describe('onOverview', () => {
  const place: OverviewPlace = { x: 30, y: 10, width: 8, height: 4, scale: 0.1 };

  it('holds the overview and its border', () => {
    expect([onOverview(place, { x: 30, y: 10 }), onOverview(place, { x: 29, y: 9 })]).toEqual([true, true]);
    expect([onOverview(place, { x: 38, y: 14 }), onOverview(place, { x: 39, y: 10 })]).toEqual([true, false]);
    expect(onOverview(place, { x: 28, y: 12 })).toBe(false);
  });
});
