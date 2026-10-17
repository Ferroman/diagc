import { describe, expect, it } from 'vitest';
import { ASCII, DOWN, LEFT, RIGHT, UNICODE, UP } from './glyphs';

const MASKS = Array.from({ length: 15 }, (_, i) => i + 1);

describe('glyphs', () => {
  it('has a box-drawing glyph for every mask and weight', () => {
    for (const weight of ['light', 'heavy', 'dashed', 'double'] as const) {
      for (const mask of MASKS) expect(UNICODE.line(mask, weight)).toMatch(/^[─-╿]$/);
    }
  });

  it('draws corners square, rounded or chamfered', () => {
    expect(UNICODE.line(DOWN | RIGHT, 'light')).toBe('┌');
    expect(UNICODE.line(DOWN | RIGHT, 'light', 'round')).toBe('╭');
    expect(UNICODE.line(UP | LEFT, 'light', 'round')).toBe('╯');
    expect(UNICODE.line(DOWN | RIGHT, 'light', 'chamfer')).toBe('╱');
    // a corner style means nothing on a mask that is not a corner
    expect(UNICODE.line(LEFT | RIGHT, 'light', 'round')).toBe('─');
  });

  it('draws a double line, and a single one meeting it as the mixed junction', () => {
    expect([DOWN | RIGHT, DOWN | LEFT, UP | RIGHT, UP | LEFT].map((m) => UNICODE.line(m, 'double'))).toEqual([
      '╔',
      '╗',
      '╚',
      '╝',
    ]);
    expect([LEFT | RIGHT, UP | DOWN, UP | DOWN | LEFT | RIGHT].map((m) => UNICODE.line(m, 'double'))).toEqual([
      '═',
      '║',
      '╬',
    ]);
    // `minor`: the directions drawn single, into the double line
    expect(UNICODE.line(LEFT | RIGHT | DOWN, 'double', undefined, DOWN)).toBe('╤');
    expect(UNICODE.line(LEFT | RIGHT | UP, 'double', undefined, UP)).toBe('╧');
    expect(UNICODE.line(UP | DOWN | LEFT, 'double', undefined, LEFT)).toBe('╢');
    expect(UNICODE.line(UP | DOWN | RIGHT, 'double', undefined, RIGHT)).toBe('╟');
    expect(UNICODE.line(UP | DOWN | LEFT | RIGHT, 'double', undefined, UP | DOWN)).toBe('╪');
    expect(UNICODE.line(UP | DOWN | LEFT | RIGHT, 'double', undefined, LEFT | RIGHT)).toBe('╫');
    // a corner one way double and the other single
    expect(UNICODE.line(DOWN | RIGHT, 'double', undefined, DOWN)).toBe('╒');
    expect(UNICODE.line(UP | LEFT, 'double', undefined, LEFT)).toBe('╜');
    // nothing double left: a single line
    expect(UNICODE.line(LEFT | RIGHT, 'double', undefined, LEFT | RIGHT)).toBe('─');
    // a corner style means nothing to a double line, which has no rounded corners
    expect(UNICODE.line(DOWN | RIGHT, 'double', 'round')).toBe('╔');
  });

  it('keeps ASCII to printable ASCII', () => {
    const all = [
      ...MASKS.flatMap((m) => ['light', 'heavy', 'dashed', 'double'].map((w) => ASCII.line(m, w as 'light'))),
      ASCII.line(DOWN | RIGHT, 'light', 'round'),
      ASCII.line(UP | RIGHT, 'light', 'chamfer'),
      ...(['up', 'down', 'left', 'right'] as const).map((d) => ASCII.arrow(d)),
      ...(['dot', 'square', 'diamond', 'many', 'one'] as const).map((m) => ASCII.mark(m)),
      ASCII.slant(true),
      ASCII.slant(false),
      ASCII.ellipsis,
      ASCII.folded,
      ASCII.external,
      ASCII.start,
      ASCII.end,
      ASCII.decision,
      ASCII.delay,
    ];
    for (const glyph of all) expect(glyph).toMatch(/^[\x20-\x7e]+$/);
  });

  it('slants a line one cell a row, falling or rising to the right', () => {
    expect([UNICODE.slant(true), UNICODE.slant(false)]).toEqual(['╲', '╱']);
    expect([ASCII.slant(true), ASCII.slant(false)]).toEqual(['\\', '/']);
  });

  it('points arrows the way they go', () => {
    expect(['up', 'down', 'left', 'right'].map((d) => UNICODE.arrow(d as 'up'))).toEqual(['▲', '▼', '◀', '▶']);
    expect(['up', 'down', 'left', 'right'].map((d) => ASCII.arrow(d as 'up'))).toEqual(['^', 'v', '<', '>']);
  });

  it('has one-cell ellipses', () => {
    expect(UNICODE.ellipsis).toBe('…');
    expect(ASCII.ellipsis).toHaveLength(1);
  });
});
