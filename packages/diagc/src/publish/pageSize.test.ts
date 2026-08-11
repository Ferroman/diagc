import { describe, expect, it } from 'vitest';
import { pageSize } from './pageSize';

describe('pageSize', () => {
  it('pads the content and caps width, preserving aspect', () => {
    expect(pageSize({ width: 800, height: 400 }, { maxWidth: 1600, padding: 24 }))
      .toEqual({ width: 848, height: 448 }); // 800+48, 400+48, under cap
  });
  it('scales down when content exceeds maxWidth', () => {
    const s = pageSize({ width: 3200, height: 1600 }, { maxWidth: 1600, padding: 0 });
    expect(s.width).toBe(1600);
    expect(s.height).toBe(800); // aspect preserved
  });
  it('never returns zero dimensions', () => {
    expect(pageSize({ width: 0, height: 0 }, { maxWidth: 1600, padding: 0 }))
      .toEqual({ width: 1, height: 1 });
  });
  it('caps height when maxHeight is given, preserving aspect', () => {
    const s = pageSize({ width: 1000, height: 4000 }, { maxWidth: 2000, maxHeight: 1400, padding: 0 });
    expect(s.height).toBe(1400);
    expect(s.width).toBe(350); // 1000 * (1400/4000)
  });
});
