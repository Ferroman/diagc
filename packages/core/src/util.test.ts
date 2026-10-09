import { describe, expect, expectTypeOf, it } from 'vitest';
import { defined } from './util';

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
