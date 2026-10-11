// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clampDockWidth, readDockWidth } from './dockWidth';

afterEach(() => localStorage.clear());

describe('clampDockWidth', () => {
  it('clamps into [min, max]', () => {
    expect(clampDockWidth(100, 220, 560)).toBe(220);
    expect(clampDockWidth(999, 220, 560)).toBe(560);
    expect(clampDockWidth(300, 220, 560)).toBe(300);
  });
  it('falls back to min for non-finite input', () => {
    expect(clampDockWidth(Number.NaN, 220, 560)).toBe(220);
  });
});

describe('readDockWidth', () => {
  it('returns the fallback when the key is missing', () => {
    expect(readDockWidth('dg.test.w', 300, 220, 560)).toBe(300);
  });
  it('returns a clamped stored value', () => {
    localStorage.setItem('dg.test.w', '9999');
    expect(readDockWidth('dg.test.w', 300, 220, 560)).toBe(560);
  });
  it('returns the fallback for a garbage stored value', () => {
    localStorage.setItem('dg.test.w', 'not-a-number');
    expect(readDockWidth('dg.test.w', 300, 220, 560)).toBe(300);
  });
});
