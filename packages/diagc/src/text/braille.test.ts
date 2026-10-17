import { describe, expect, it } from 'vitest';
import { Dots } from './braille';

const row = (dots: Dots, r = 0): string => Array.from({ length: dots.columns }, (_, c) => dots.char(c, r)).join('');

describe('Dots', () => {
  it('is two dots across and four down per cell', () => {
    const dots = new Dots(3, 2);
    expect([dots.width, dots.height]).toEqual([6, 8]);
  });

  it('leaves a cell with no dots blank', () => {
    expect(row(new Dots(2, 1))).toBe('  ');
  });

  it('sets each of a cell’s eight dots to its braille dot', () => {
    const at = (x: number, y: number): string => {
      const dots = new Dots(1, 1);
      dots.set(x, y);
      return dots.char(0, 0);
    };
    expect([at(0, 0), at(0, 1), at(0, 2), at(0, 3)]).toEqual(['⠁', '⠂', '⠄', '⡀']);
    expect([at(1, 0), at(1, 1), at(1, 2), at(1, 3)]).toEqual(['⠈', '⠐', '⠠', '⢀']);
  });

  it('merges the dots set in one cell', () => {
    const dots = new Dots(1, 1);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) dots.set(x, y);
    expect(dots.char(0, 0)).toBe('⣿');
  });

  it('finds a dot’s cell', () => {
    const dots = new Dots(2, 2);
    dots.set(2, 4);
    expect([row(dots, 0), row(dots, 1)]).toEqual(['  ', ' ⠁']);
  });

  it('drops dots outside the grid', () => {
    const dots = new Dots(1, 1);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 4],
    ] as const)
      dots.set(x, y);
    expect(dots.char(0, 0)).toBe(' ');
  });

  it('outlines a rectangle', () => {
    const dots = new Dots(2, 1);
    dots.outline({ x: 0, y: 0, width: 4, height: 4 });
    expect(row(dots)).toBe('⣏⣹');
  });

  it('outlines a rectangle one dot across as a line, and one dot as a dot', () => {
    const line = new Dots(1, 1);
    line.outline({ x: 1, y: 0, width: 1, height: 4 });
    expect(line.char(0, 0)).toBe('⢸');
    const dot = new Dots(1, 1);
    dot.outline({ x: 0, y: 0, width: 1, height: 1 });
    expect(dot.char(0, 0)).toBe('⠁');
  });

  it('outlines nothing for an empty rectangle', () => {
    const dots = new Dots(1, 1);
    dots.outline({ x: 0, y: 0, width: 0, height: 3 });
    expect(dots.char(0, 0)).toBe(' ');
  });
});
