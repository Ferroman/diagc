import { describe, expect, it } from 'vitest';
import { Pixels } from './pixels';

/** The mask as rows of digits, each pixel's share in tenths: `#` for all of it. */
const shares = (p: Pixels): string[] =>
  Array.from({ length: p.height }, (_, y) =>
    Array.from({ length: p.width }, (_, x) => {
      const a = p.at(x, y);
      return a >= 1 ? '#' : a === 0 ? '.' : String(Math.round(a * 10));
    }).join(''),
  );

describe('Pixels', () => {
  it('outlines and fills rectangles, keeping the most any one gave a pixel', () => {
    const p = new Pixels(6, 4);
    p.fill({ x: 1, y: 1, width: 4, height: 2 }, 0.5);
    p.outline({ x: 0, y: 0, width: 4, height: 3 }, 1);
    expect(shares(p)).toEqual(['####..', '#55#5.', '####5.', '......']);
  });

  it('draws a line between two pixels, either way and slanted', () => {
    const p = new Pixels(5, 3);
    p.line({ x: 4, y: 0 }, { x: 0, y: 0 }, 1);
    p.line({ x: 0, y: 1 }, { x: 4, y: 2 }, 0.3);
    expect(shares(p)).toEqual(['#####', '33...', '..333']);
  });

  it('rounds a line’s ends to whole pixels', () => {
    const p = new Pixels(4, 1);
    p.line({ x: 0.4, y: 0.2 }, { x: 2.6, y: 0 }, 1);
    expect(shares(p)).toEqual(['####']);
  });

  it('drops what falls outside', () => {
    const p = new Pixels(2, 2);
    p.outline({ x: -1, y: -1, width: 4, height: 4 }, 1);
    p.line({ x: -3, y: 0 }, { x: 5, y: 0 }, 1);
    expect(shares(p)).toEqual(['##', '..']);
  });

  it('dims what is outside a rectangle', () => {
    const p = new Pixels(4, 1);
    p.fill({ x: 0, y: 0, width: 4, height: 1 }, 1);
    p.dimOutside({ x: 1, y: 0, width: 2, height: 1 }, 0.4);
    expect(shares(p)).toEqual(['4##4']);
  });

  it('is a colour with each pixel’s share as its alpha, row by row', () => {
    const p = new Pixels(2, 1);
    p.fill({ x: 1, y: 0, width: 1, height: 1 }, 0.5);
    expect([...p.rgba([10, 20, 30])]).toEqual([10, 20, 30, 0, 10, 20, 30, 128]);
  });
});
