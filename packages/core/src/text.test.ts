import { describe, expect, it } from 'vitest';
import { normalizeRuns, runsToPlainText } from './text';

describe('normalizeRuns', () => {
  it('drops empty runs and coerces false marks to undefined', () => {
    expect(normalizeRuns([{ text: '' }, { text: 'a', bold: false }])).toEqual([{ text: 'a' }]);
  });
  it('merges adjacent runs with identical marks', () => {
    expect(normalizeRuns([{ text: 'ab', bold: true }, { text: 'cd', bold: true }])).toEqual([
      { text: 'abcd', bold: true },
    ]);
  });
  it('keeps runs with differing marks separate', () => {
    expect(normalizeRuns([{ text: 'a', bold: true }, { text: 'b', italic: true }])).toEqual([
      { text: 'a', bold: true },
      { text: 'b', italic: true },
    ]);
  });
  it('preserves newlines inside run text', () => {
    expect(runsToPlainText(normalizeRuns([{ text: 'a\nb' }]))).toBe('a\nb');
  });
});

describe('runsToPlainText', () => {
  it('joins run text', () => {
    expect(runsToPlainText([{ text: 'Hi ' }, { text: 'there', bold: true }])).toBe('Hi there');
  });
});
