import { describe, expect, it } from 'vitest';
import { selfLoopCurve, selfLoopIndexes, selfLoopPath } from './self-loop';

const box = { x: 0, y: 0, width: 100, height: 40 };

describe('selfLoopPath', () => {
  it('leaves and re-enters the top side at 30% and 70% for a horizontal flow', () => {
    const { path, labelY } = selfLoopPath(box, 'RIGHT');
    expect(path.startsWith('M 30 0 ')).toBe(true);
    expect(path.endsWith(' 70 0')).toBe(true);
    expect(labelY).toBeLessThan(-28);
  });

  it('rises 18 px further for each index', () => {
    expect(selfLoopPath(box, 'RIGHT', 1).labelY).toBe(selfLoopPath(box, 'RIGHT').labelY - 18);
  });

  it('puts the loop on the right side for a vertical flow', () => {
    const { path, labelX } = selfLoopPath(box, 'DOWN');
    expect(path.startsWith('M 100 12 ')).toBe(true);
    expect(path.endsWith(' 100 28')).toBe(true);
    expect(labelX).toBeGreaterThan(128);
  });

  it('has a crown 28 px out on the curve', () => {
    expect(selfLoopCurve(box, 'RIGHT').point(0.5).y).toBeCloseTo(-28);
    expect(selfLoopCurve(box, 'RIGHT', 1).point(0.5).y).toBeCloseTo(-46);
  });
});

describe('selfLoopIndexes', () => {
  it('numbers each node’s self-loops in edge order and skips other edges', () => {
    const idx = selfLoopIndexes([
      { id: 'a1', from: 'a', to: 'a' },
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'b1', from: 'b', to: 'b' },
      { id: 'a2', from: 'a', to: 'a' },
    ]);
    expect([...idx]).toEqual([
      ['a1', 0],
      ['b1', 0],
      ['a2', 1],
    ]);
  });
});
