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

describe('isLayoutOverlay — unfolded', () => {
  it('accepts per-plane id lists and an empty map', () => {
    expect(isLayoutOverlay({ ...base, unfolded: { default: ['sys', 'db'] } })).toBe(true);
    expect(isLayoutOverlay({ ...base, unfolded: { default: [] } })).toBe(true);
    expect(isLayoutOverlay({ ...base, unfolded: {} })).toBe(true);
  });

  it('rejects anything that is not plane → string[]', () => {
    expect(isLayoutOverlay({ ...base, unfolded: ['sys'] })).toBe(false);
    expect(isLayoutOverlay({ ...base, unfolded: { default: { sys: 'expanded' } } })).toBe(false);
    expect(isLayoutOverlay({ ...base, unfolded: { default: ['sys', 3] } })).toBe(false);
    expect(isLayoutOverlay({ ...base, unfolded: null })).toBe(false);
  });
});

describe('isLayoutOverlay — edgeLabels', () => {
  it('accepts plane → relation → label → { t, side? }', () => {
    expect(isLayoutOverlay({ ...base, edgeLabels: { default: { r1: { legacy: { t: 0.3, side: 'top' }, l2: { t: 1 } } } } })).toBe(true);
    expect(isLayoutOverlay({ ...base, edgeLabels: {} })).toBe(true);
  });

  it('rejects a placement without a numeric t or with an unknown side', () => {
    expect(isLayoutOverlay({ ...base, edgeLabels: { default: { r1: { legacy: { side: 'top' } } } } })).toBe(false);
    expect(isLayoutOverlay({ ...base, edgeLabels: { default: { r1: { legacy: { t: 0.3, side: 'left' } } } } })).toBe(false);
    expect(isLayoutOverlay({ ...base, edgeLabels: { default: { r1: [] } } })).toBe(false);
  });
});

describe('isLayoutOverlay — notes', () => {
  it('accepts plane → threat target → { dx, dy }', () => {
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': { dx: 4, dy: -2 } } } })).toBe(true);
    expect(isLayoutOverlay({ ...base, notes: {} })).toBe(true);
  });

  it('rejects a non-numeric or non-finite offset, and anything but a plane map', () => {
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': { dx: 'x', dy: 0 } } } })).toBe(false);
    // NaN/Infinity reach the renderer as a note nobody can find again
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': { dx: Infinity, dy: 0 } } } })).toBe(false);
    expect(isLayoutOverlay({ ...base, notes: [] })).toBe(false);
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': 3 } } })).toBe(false);
  });

  it('accepts open: true on a note entry and rejects any other open value', () => {
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': { dx: 0, dy: 0, open: true } } } })).toBe(true);
    // "closed" is spelled by omission — a stored false would be a second way to say it
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': { dx: 0, dy: 0, open: false } } } })).toBe(false);
    expect(isLayoutOverlay({ ...base, notes: { p: { 'node:a': { dx: 0, dy: 0, open: 1 } } } })).toBe(false);
  });

  it('ignores a stale notesHidden key — the guard checks known fields only, so the key is inert and rides along', () => {
    expect(isLayoutOverlay({ ...base, notesHidden: { p: true } })).toBe(true);
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
