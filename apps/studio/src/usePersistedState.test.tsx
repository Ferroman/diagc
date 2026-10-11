// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedState } from './usePersistedState';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const asNumber = (raw: string | null) => (raw === null ? null : Number(raw));

describe('usePersistedState', () => {
  // Breaks if the stored string stops going through `read` (or the key is not
  // the one read from).
  it('starts from the stored value, mapped by read', () => {
    localStorage.setItem('k', '42');
    const { result } = renderHook(() => usePersistedState('k', 7, asNumber));
    expect(result.current[0]).toBe(42);
  });

  // Breaks if a null from `read` (absent or unreadable) is taken as the value
  // instead of the fallback.
  it('falls back when nothing is stored or read refuses the value', () => {
    expect(renderHook(() => usePersistedState('k', 7, asNumber)).result.current[0]).toBe(7);
    localStorage.setItem('k', 'garbage');
    const refuse = (raw: string | null) => (raw === 'garbage' ? null : raw);
    expect(renderHook(() => usePersistedState('k', 'dflt', refuse)).result.current[0]).toBe('dflt');
  });

  // Breaks if a function fallback is stored as the value rather than called.
  it('calls a function fallback for the initial value', () => {
    const { result } = renderHook(() => usePersistedState<string[]>('k', () => ['a']));
    expect(result.current[0]).toEqual(['a']);
  });

  // Breaks if a key with no reader starts reading its stored string: without
  // `read` there is nothing to map it with, so the fallback stands.
  it('ignores the stored value when there is no reader', () => {
    localStorage.setItem('k', 'stored');
    expect(renderHook(() => usePersistedState('k', 'dflt')).result.current[0]).toBe('dflt');
  });

  // Breaks if the value stops being written on mount and on change, or the
  // default encoding stops being String.
  it('writes the value with String by default, on mount and on every change', () => {
    const { result } = renderHook(() => usePersistedState('k', 1, asNumber));
    expect(localStorage.getItem('k')).toBe('1');
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem('k')).toBe('2');
  });

  // Breaks if `serialize` is ignored, which would rewrite an established on-disk
  // format such as the docks' 'collapsed' / 'expanded'.
  it('writes with serialize when given one', () => {
    const { result } = renderHook(() =>
      usePersistedState(
        'k',
        false,
        (raw) => raw === 'collapsed',
        (v) => (v ? 'collapsed' : 'expanded'),
      ),
    );
    expect(localStorage.getItem('k')).toBe('expanded');
    act(() => result.current[1](true));
    expect(localStorage.getItem('k')).toBe('collapsed');
  });

  // Breaks if a storage failure escapes: some embeddings have no usable
  // localStorage, and the studio must still run on its defaults.
  it('runs on the fallback when storage throws, and keeps working', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => usePersistedState('k', 3, asNumber));
    expect(result.current[0]).toBe(3);
    act(() => result.current[1](4));
    expect(result.current[0]).toBe(4);
  });

  // Breaks if the setter changes identity between renders: callers hand it to
  // components and effect dependencies as a stable function.
  it('hands out a stable setter', () => {
    const { result, rerender } = renderHook(() => usePersistedState('k', 1, asNumber));
    const first = result.current[1];
    act(() => first(5));
    rerender();
    expect(result.current[1]).toBe(first);
  });
});
