import { describe, expect, it } from 'vitest';
import { activeNotation } from './notation';

const planes = [
  { id: 'git', name: 'Git', notation: 'git-graph' },
  { id: 'arch', name: 'Arch' },
  { id: 'odd', name: 'Odd', notation: 'made-up' },
];

describe('activeNotation', () => {
  it('reads the picked plane, falls back to the first plane for the default view', () => {
    expect(activeNotation(planes, 'git')).toBe('git-graph');
    expect(activeNotation(planes, 'arch')).toBeUndefined();
    expect(activeNotation(planes, undefined)).toBe('git-graph');
  });
  it('drops an unknown notation id and copes with no planes', () => {
    expect(activeNotation(planes, 'odd')).toBeUndefined();
    expect(activeNotation([], undefined)).toBeUndefined();
  });
});
