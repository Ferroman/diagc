import { describe, expect, it } from 'vitest';
import { ASCII, DOWN, LEFT, RIGHT, UNICODE, UP } from './glyphs';

const MASKS = Array.from({ length: 15 }, (_, i) => i + 1);

describe('glyphs', () => {
  it('has a box-drawing glyph for every mask and weight', () => {
    for (const weight of ['light', 'heavy', 'dashed'] as const) {
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

  it('keeps ASCII to printable ASCII', () => {
    const all = [
      ...MASKS.flatMap((m) => [ASCII.line(m, 'light'), ASCII.line(m, 'heavy'), ASCII.line(m, 'dashed')]),
      ASCII.line(DOWN | RIGHT, 'light', 'round'),
      ASCII.line(UP | RIGHT, 'light', 'chamfer'),
      ...(['up', 'down', 'left', 'right'] as const).map((d) => ASCII.arrow(d)),
      ...(['dot', 'square', 'diamond', 'many', 'one'] as const).map((m) => ASCII.mark(m)),
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

  it('points arrows the way they go', () => {
    expect(['up', 'down', 'left', 'right'].map((d) => UNICODE.arrow(d as 'up'))).toEqual(['▲', '▼', '◀', '▶']);
    expect(['up', 'down', 'left', 'right'].map((d) => ASCII.arrow(d as 'up'))).toEqual(['^', 'v', '<', '>']);
  });

  it('has one-cell ellipses', () => {
    expect(UNICODE.ellipsis).toBe('…');
    expect(ASCII.ellipsis).toHaveLength(1);
  });
});
