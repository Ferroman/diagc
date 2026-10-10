import { describe, expect, it } from 'vitest';
import { estimateLabelSize, glyphCaptionSize, MAX_LABEL_WIDTH, MIN_LABEL_WIDTH } from './label-size';

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

describe('glyphCaptionSize', () => {
  it('is one line as wide as a short name', () => {
    expect(glyphCaptionSize('Start')).toEqual({ width: 43, height: 19 });
  });

  it('wraps a long name at the caption max-width', () => {
    const s = glyphCaptionSize('Commit translation in TMS and notify every downstream system');
    expect(s.width).toBe(180);
    expect(s.height).toBe(3 * 16 + 3);
  });

  it('starts a new line at each line break in the name', () => {
    expect(glyphCaptionSize('Approved\nby finance?')).toEqual({ width: 85, height: 2 * 16 + 3 });
  });
});
