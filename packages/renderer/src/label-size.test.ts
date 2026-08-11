import { describe, expect, it } from 'vitest';
import { estimateLabelSize, MAX_LABEL_WIDTH, MIN_LABEL_WIDTH } from './label-size';

describe('estimateLabelSize', () => {
  it('short text gets the minimum width', () => {
    expect(estimateLabelSize('Hi').width).toBe(MIN_LABEL_WIDTH);
  });
  it('a second hard line makes it taller', () => {
    const one = estimateLabelSize('a');
    const two = estimateLabelSize('a\nb');
    expect(two.height).toBeGreaterThan(one.height);
  });
  it('a very long line clamps to the max width and wraps taller', () => {
    const s = estimateLabelSize('x'.repeat(200));
    expect(s.width).toBe(MAX_LABEL_WIDTH);
    expect(s.height).toBeGreaterThan(estimateLabelSize('x').height);
  });
  it('larger font scale yields a taller box', () => {
    expect(estimateLabelSize('a\nb\nc', 'lg').height).toBeGreaterThan(estimateLabelSize('a\nb\nc', 'sm').height);
  });
});
