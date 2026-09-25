import { describe, expect, it } from 'vitest';
import { isIsoDate } from './dates';

describe('isIsoDate', () => {
  it('accepts a real YYYY-MM-DD day', () => {
    expect(isIsoDate('2026-09-22')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });
  it('rejects the wrong shape, a non-string, and a day that does not exist', () => {
    expect(isIsoDate('2026-9-2')).toBe(false);
    expect(isIsoDate('22/09/2026')).toBe(false);
    expect(isIsoDate('2026-09-22T10:00:00Z')).toBe(false);
    expect(isIsoDate(20260922)).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
  });
});
