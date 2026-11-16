import { describe, expect, it } from 'vitest';
import { formatTransition, hasTransitionParts, parseTransition, type TransitionParts } from './transition';

const CASES: [TransitionParts, string][] = [
  [{ trigger: 'pay', guard: 'total > 0', effect: 'charge' }, 'pay [total > 0] / charge'],
  [{ trigger: 'pay' }, 'pay'],
  [{ guard: 'x' }, '[x]'],
  [{ effect: 'y' }, '/ y'],
  [{ guard: 'x', effect: 'y' }, '[x] / y'],
  [{}, ''],
];

describe('formatTransition', () => {
  it.each(CASES)('formats %j as %s', (parts, text) => expect(formatTransition(parts)).toBe(text));
});

describe('parseTransition', () => {
  it.each([
    ['pay [total > 0] / charge', { trigger: 'pay', guard: 'total > 0', effect: 'charge' }],
    ['a/b', { trigger: 'a/b' }],
    ['[x] / y', { guard: 'x', effect: 'y' }],
    ['/ y', { effect: 'y' }],
    ['pay [a[0] > 1] / log', { trigger: 'pay', guard: 'a[0] > 1', effect: 'log' }],
    ['   ', {}],
    ['go / a / b', { trigger: 'go', effect: 'a / b' }],
    ['pay [x', { trigger: 'pay [x' }],
    ['a [x] b [y]', { trigger: 'a b [y]', guard: 'x' }],
    ['pay [x] more', { trigger: 'pay more', guard: 'x' }],
  ])('parses %s', (text, parts) => expect(parseTransition(text)).toEqual(parts));

  it('round-trips every formatted string', () => {
    for (const [parts] of CASES) expect(parseTransition(formatTransition(parts))).toEqual(parts);
  });
});

describe('hasTransitionParts', () => {
  it('is true when any part is set', () => {
    expect(hasTransitionParts({ guard: 'x' })).toBe(true);
    expect(hasTransitionParts({})).toBe(false);
  });
});
