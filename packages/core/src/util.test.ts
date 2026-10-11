import { describe, expect, expectTypeOf, it } from 'vitest';
import { defined, nextFreeId, uniqueSlug, type SameKeys } from './util';

describe('defined', () => {
  it('drops the keys whose value is undefined', () => {
    expect(defined({ a: 1, b: undefined, c: 'x' })).toStrictEqual({ a: 1, c: 'x' });
  });

  it('keeps null, zero, false and the empty string', () => {
    expect(defined({ a: null, b: 0, c: false, d: '' })).toStrictEqual({ a: null, b: 0, c: false, d: '' });
  });

  it('keeps the key order', () => {
    expect(Object.keys(defined({ z: 1, a: undefined, m: 2, b: 3 }))).toEqual(['z', 'm', 'b']);
  });

  it('returns a new object and leaves its argument alone', () => {
    const arg = { a: 1, b: undefined };
    expect(defined(arg)).not.toBe(arg);
    expect(arg).toStrictEqual({ a: 1, b: undefined });
  });

  it('keeps a key that cannot be undefined required, and makes the others optional', () => {
    const name = undefined as string | undefined;
    const out = defined({ id: 'n', name });
    expectTypeOf(out.id).toEqualTypeOf<string>();
    expectTypeOf(out.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(out).toExtend<{ id: string; name?: string }>();
  });
});

describe('nextFreeId', () => {
  it('takes the first number from `first` up that is not taken', () => {
    expect(nextFreeId('c', new Set())).toBe('c1');
    expect(nextFreeId('c', new Set(['c1', 'c2', 'c4']))).toBe('c3');
    expect(nextFreeId('a->b#', new Set(['a->b#0']), 0)).toBe('a->b#1');
    expect(nextFreeId('db-', new Set(['db-2']), 2)).toBe('db-3');
  });
});

describe('uniqueSlug', () => {
  const none = new Set<string>();

  it('lower-cases the name and joins its words with hyphens', () => {
    expect(uniqueSlug('Cloud Run', none, 'x')).toBe('cloud-run');
    expect(uniqueSlug('ABC_def', none, 'x')).toBe('abc-def');
    expect(uniqueSlug('Layer 2', none, 'x')).toBe('layer-2');
  });

  it('turns each run of punctuation into one hyphen and trims them at the ends', () => {
    expect(uniqueSlug('  --Hello,   World!--  ', none, 'x')).toBe('hello-world');
    expect(uniqueSlug('a.b/c', none, 'x')).toBe('a-b-c');
  });

  it('keeps only ASCII letters and digits', () => {
    expect(uniqueSlug('Café Ünïcode', none, 'x')).toBe('caf-n-code');
    // the dotted capital I lower-cases to i plus a combining dot
    expect(uniqueSlug('İstanbul', none, 'x')).toBe('i-stanbul');
  });

  it('falls back when nothing is left of the name', () => {
    expect(uniqueSlug('', none, 'layer')).toBe('layer');
    expect(uniqueSlug('***', none, 'layer')).toBe('layer');
    expect(uniqueSlug('日本', none, 'icon')).toBe('icon');
  });

  it('numbers a collision from 2, taking the first free number', () => {
    expect(uniqueSlug('Cloud Run', new Set(['cloud-run']), 'x')).toBe('cloud-run-2');
    expect(uniqueSlug('Cloud Run', new Set(['cloud-run', 'cloud-run-2', 'cloud-run-4']), 'x')).toBe('cloud-run-3');
    expect(uniqueSlug('Cloud Run', new Set(['cloud-run-2']), 'x')).toBe('cloud-run');
    expect(uniqueSlug('Layer 2', new Set(['layer-2']), 'x')).toBe('layer-2-2');
  });

  it('numbers a colliding fallback the same way', () => {
    expect(uniqueSlug('***', new Set(['cat']), 'cat')).toBe('cat-2');
    expect(uniqueSlug('', new Set(['cat', 'cat-2']), 'cat')).toBe('cat-3');
  });
});

describe('SameKeys', () => {
  it('is true only when both sides name the same keys', () => {
    expectTypeOf<SameKeys<'a' | 'b', 'b' | 'a'>>().toEqualTypeOf<true>();
    // a member missing on either side is not hidden by the others in the union
    expectTypeOf<SameKeys<'a' | 'b', 'a'>>().toEqualTypeOf<false>();
    expectTypeOf<SameKeys<'a', 'a' | 'b'>>().toEqualTypeOf<false>();
  });
});
