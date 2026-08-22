import { describe, expect, it } from 'vitest';
import { isLayoutOverlay } from './guards';

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
