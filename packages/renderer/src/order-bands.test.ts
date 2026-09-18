import { describe, expect, it } from 'vitest';
import { BAND_PAD, HEADER_W, bandLabel, computeBands } from './order-bands';

const rect = (x: number, y: number, width = 180, height = 48) => ({ x, y, width, height });

describe('bandLabel', () => {
  it('names band 0 after the decision(s) and the rest by ordinal', () => {
    expect(bandLabel(0, 1)).toBe('Decision');
    expect(bandLabel(0, 2)).toBe('Decisions');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((n) => bandLabel(n, 1))).toEqual([
      '1st order', '2nd order', '3rd order', '4th order', '11th order', '12th order', '13th order', '21st order', '22nd order', '23rd order', '101st order',
    ]);
  });
});

describe('computeBands', () => {
  const rects = new Map([
    ['d', rect(200, 0)],
    ['a', rect(0, 88)],
    ['b', rect(400, 88)],
    ['c', rect(0, 176)],
    ['c2', rect(400, 244)], // pushed a row down by a labelled arrow: same band, taller
  ]);
  const orders = new Map([['d', 0], ['a', 1], ['b', 1], ['c', 2], ['c2', 2]]);

  it('spans each band over where its nodes actually landed, padded along the flow', () => {
    const bands = computeBands(rects, orders, 'DOWN');
    expect(bands.map((b) => b.order)).toEqual([0, 1, 2]);
    expect(bands[1]).toMatchObject({ y: 88 - BAND_PAD, height: 48 + 2 * BAND_PAD });
    expect(bands[2]).toMatchObject({ y: 176 - BAND_PAD, height: 244 + 48 - 176 + 2 * BAND_PAD });
  });
  it('runs every band across the whole content, with room for the header on the left', () => {
    const [first] = computeBands(rects, orders, 'DOWN');
    expect(first!.x).toBe(0 - BAND_PAD - HEADER_W);
    expect(first!.x + first!.width).toBe(580 + BAND_PAD);
    expect(first!.header.x).toBe(first!.x + 8);
  });
  it('turns into columns for a left-to-right flow, headers on top', () => {
    const sideways = new Map([['d', rect(0, 100)], ['a', rect(260, 0)], ['b', rect(260, 200)]]);
    const bands = computeBands(sideways, new Map([['d', 0], ['a', 1], ['b', 1]]), 'RIGHT');
    expect(bands[1]).toMatchObject({ x: 260 - BAND_PAD, width: 180 + 2 * BAND_PAD });
    expect(bands[1]!.y).toBeLessThan(0);
    expect(bands[1]!.header.y).toBeLessThan(0);
  });
  it('skips nodes that are not on screen and returns nothing when none are', () => {
    expect(computeBands(new Map(), orders, 'DOWN')).toEqual([]);
    expect(computeBands(new Map([['d', rect(0, 0)]]), orders, 'DOWN')).toHaveLength(1);
  });
});
