import { describe, expect, it } from 'vitest';
import { bowOf, PARALLEL_STEP, parallelBows, parallelBulge } from './parallel-edges';

describe('parallelBows', () => {
  it('leaves a lone edge, a self-loop and the first of a pair out', () => {
    const bows = parallelBows([
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'aa', from: 'a', to: 'a' },
      { id: 'bc', from: 'b', to: 'c' },
      { id: 'bc2', from: 'b', to: 'c' },
    ]);
    expect([...bows]).toEqual([['bc2', PARALLEL_STEP]]);
  });

  it('alternates sides and widens: 0, +k, -k, +2k', () => {
    const edges = ['1', '2', '3', '4'].map((id) => ({ id, from: 'a', to: 'b' }));
    expect([...parallelBows(edges)]).toEqual([
      ['2', PARALLEL_STEP],
      ['3', -PARALLEL_STEP],
      ['4', 2 * PARALLEL_STEP],
    ]);
  });

  it('counts both directions as one pair, each bow measured off its own travel', () => {
    const bows = parallelBows([
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'ba', from: 'b', to: 'a' },
      { id: 'ab2', from: 'a', to: 'b' },
    ]);
    // ba takes the pair's +k side; travelling b to a, that side is its right
    expect(bows.get('ba')).toBe(-PARALLEL_STEP);
    // ab2 takes the pair's -k side, which is its own right too: the two land apart
    expect(bows.get('ab2')).toBe(-PARALLEL_STEP);
  });
});

describe('parallelBulge', () => {
  it('puts the crown of the bow the asked distance off the line, either side', () => {
    expect(parallelBulge(-24)).toBe(32);
    expect(parallelBulge(24)).toBe(32);
  });
});

describe('bowOf', () => {
  const edge = { shape: 'curved' as const, profileBows: false, side: undefined, parallelBow: undefined };
  it('leaves a lone curved edge unbowed', () => {
    expect(bowOf(edge)).toEqual({ bowed: false, side: 'left', bulge: undefined });
  });
  it('bows a parallel edge to the side its sign names', () => {
    expect(bowOf({ ...edge, parallelBow: -24 })).toEqual({ bowed: true, side: 'right', bulge: 32 });
  });
  it("keeps a bowing notation's own bow, and a straight line straight", () => {
    expect(bowOf({ ...edge, profileBows: true, side: 'right', parallelBow: 24 })).toEqual({
      bowed: true,
      side: 'right',
      bulge: undefined,
    });
    expect(bowOf({ ...edge, shape: 'straight', parallelBow: 24 }).bowed).toBe(false);
  });
});
