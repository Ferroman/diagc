import { describe, expect, it } from 'vitest';
import { overlayPositions } from './placement';

describe('overlayPositions', () => {
  const base = () =>
    new Map([
      ['a', { x: 0, y: 0, w: 10, h: 10 }],
      ['b', { x: 5, y: 5, w: 20, h: 20 }],
    ]);

  it('overrides x/y for matching ids, preserving other fields', () => {
    const out = overlayPositions(base(), { a: { x: 100, y: 200 } });
    expect(out.get('a')).toEqual({ x: 100, y: 200, w: 10, h: 10 });
    expect(out.get('b')).toEqual({ x: 5, y: 5, w: 20, h: 20 });
  });

  it('ignores ids not present in base', () => {
    const out = overlayPositions(base(), { ghost: { x: 1, y: 1 } });
    expect(out.has('ghost')).toBe(false);
  });

  it('returns the same reference when positions is empty', () => {
    const b = base();
    expect(overlayPositions(b, {})).toBe(b);
  });

  it('does not mutate base', () => {
    const b = base();
    overlayPositions(b, { a: { x: 9, y: 9 } });
    expect(b.get('a')).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it('layers: a later overlay wins for an id present in both', () => {
    const saved = overlayPositions(base(), { a: { x: 1, y: 1 } });
    const view = overlayPositions(saved, { a: { x: 2, y: 2 } });
    expect(view.get('a')).toMatchObject({ x: 2, y: 2 });
  });
});
