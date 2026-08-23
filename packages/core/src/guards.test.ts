import { describe, expect, it } from 'vitest';
import { isDrawings, isLayoutOverlay } from './guards';

const base = { version: 1, planes: { default: { a: { x: 1, y: 2 } } } };

describe('isLayoutOverlay', () => {
  it('accepts a minimal version-1 overlay', () => {
    expect(isLayoutOverlay({ version: 1, planes: {} })).toBe(true);
    expect(isLayoutOverlay(base)).toBe(true);
  });

  it('rejects a non-object, a wrong version, and non-numeric positions', () => {
    expect(isLayoutOverlay(null)).toBe(false);
    expect(isLayoutOverlay({ version: 2, planes: {} })).toBe(false);
    expect(isLayoutOverlay({ version: 1, planes: { p: { n: { x: 'no', y: 0 } } } })).toBe(false);
  });

  it('accepts an export block listing node ids to keep folded', () => {
    expect(isLayoutOverlay({ ...base, export: { collapsed: ['db', 'schema-sm'] } })).toBe(true);
    expect(isLayoutOverlay({ ...base, export: { collapsed: [] } })).toBe(true);
    // `collapsed` is the only field today, so an empty block is legal — it just
    // says nothing, and a future field must not be a breaking change.
    expect(isLayoutOverlay({ ...base, export: {} })).toBe(true);
  });

  it('rejects an export block that is not an object or whose collapsed is not a string array', () => {
    expect(isLayoutOverlay({ ...base, export: 3 })).toBe(false);
    expect(isLayoutOverlay({ ...base, export: null })).toBe(false);
    expect(isLayoutOverlay({ ...base, export: { collapsed: 'db' } })).toBe(false);
    expect(isLayoutOverlay({ ...base, export: { collapsed: [1, 2] } })).toBe(false);
    expect(isLayoutOverlay({ ...base, export: { collapsed: ['ok', null] } })).toBe(false);
  });
});

describe('isDrawings', () => {
  const stroke = { id: 'k1', points: [1, 2, 3, 4] };

  it('accepts an empty overlay and a bucket of well-formed strokes', () => {
    expect(isDrawings({ version: 1, planes: {} })).toBe(true);
    expect(isDrawings({ version: 1, planes: { default: [stroke] } })).toBe(true);
    expect(isDrawings({ version: 1, planes: { arch: [{ ...stroke, color: '#d9a520', width: 4 }] } })).toBe(true);
    // a tap: one point, two numbers
    expect(isDrawings({ version: 1, planes: { default: [{ id: 'k2', points: [10, 10] }] } })).toBe(true);
  });

  it('rejects a non-object, a wrong version, and a bucket that is not an array', () => {
    expect(isDrawings(null)).toBe(false);
    expect(isDrawings({ version: 2, planes: {} })).toBe(false);
    expect(isDrawings({ version: 1, planes: { default: { k1: stroke } } })).toBe(false);
  });

  it('rejects malformed strokes: missing id, odd or empty points, non-finite numbers, bad color/width', () => {
    const bad = (s: unknown) => isDrawings({ version: 1, planes: { default: [s] } });
    expect(bad({ points: [1, 2] })).toBe(false);
    expect(bad({ id: 'k1', points: [1, 2, 3] })).toBe(false);
    expect(bad({ id: 'k1', points: [] })).toBe(false);
    expect(bad({ id: 'k1', points: [1, Number.NaN] })).toBe(false);
    expect(bad({ id: 'k1', points: [1, 2], color: 7 })).toBe(false);
    expect(bad({ id: 'k1', points: [1, 2], width: 0 })).toBe(false);
    expect(bad({ id: 'k1', points: [1, 2], width: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
