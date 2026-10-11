// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHost, setHost } from '../host';
import { BUNDLED_LIBRARY } from './packs';
import type { Library, LibraryEntry } from './types';
import { useLibrary } from './useLibrary';

const stored: Library = {
  categories: [{ id: 'mine', name: 'Mine' }],
  entries: [{ id: 'logo', category: 'mine', name: 'Logo', template: { type: 'image', image: 'logo.png' } }],
};

/** a host serving `library` on GET and recording every PUT body */
function serve(library: Library | null, putOk = true) {
  const puts: Library[] = [];
  const apiFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== '/api/library') return new Response('{}', { status: 404 });
    if (init?.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)) as Library);
      return putOk
        ? new Response('{}')
        : new Response(JSON.stringify({ issues: [{ message: 'disk full' }] }), { status: 500 });
    }
    return library === null ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(library));
  });
  setHost({ ...defaultHost, apiFetch });
  return { puts, apiFetch };
}

const entry = (id: string, category = 'mine'): LibraryEntry => ({ id, category, name: id, template: {} });

afterEach(() => setHost(defaultHost));

describe('useLibrary', () => {
  // Breaks if the user library stops loading at mount, or stops being merged
  // after the bundled packs.
  it('loads the user library once and merges it after the bundled packs', async () => {
    const { apiFetch } = serve(stored);
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.library.categories.at(-1)?.id).toBe('mine'));
    expect(result.current.library.categories.slice(0, BUNDLED_LIBRARY.categories.length)).toEqual(
      BUNDLED_LIBRARY.categories,
    );
    expect(result.current.library.entries.at(-1)?.id).toBe('logo');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  // Breaks if a failed load stops degrading to the bundled packs alone.
  it('runs on the bundled packs when the user library cannot load', async () => {
    const { apiFetch } = serve(null);
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(result.current.library).toEqual(BUNDLED_LIBRARY);
  });

  // Breaks if a new category's id stops being a fresh slug of its name (against
  // the bundled ids as well), or the whole user library stops being PUT.
  it('adds a category under a fresh slug and saves the whole user library', async () => {
    const { puts } = serve(stored);
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.library.entries.at(-1)?.id).toBe('logo'));
    act(() => result.current.addCategory('  Basics  '));
    const added = result.current.library.categories.at(-1)!;
    expect(added.id).not.toBe('basics');
    expect(added.name).toBe('Basics');
    expect(puts.at(-1)).toEqual({ ...stored, categories: [...stored.categories, added] });
  });

  // Breaks if a bundled category can be deleted, or deleting a user category
  // leaves its entries behind in the saved file.
  it('deletes a user category with its entries, and never a bundled one', async () => {
    const { puts } = serve(stored);
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.library.entries.at(-1)?.id).toBe('logo'));
    act(() => result.current.deleteCategory('basics'));
    expect(puts).toEqual([]);
    act(() => result.current.deleteCategory('mine'));
    expect(puts.at(-1)).toEqual({ categories: [], entries: [] });
    expect(result.current.library).toEqual(BUNDLED_LIBRARY);
  });

  // Breaks if a call after a re-render reads a stale user library (the mirror
  // ref): two imports separated by an upload's await must both be kept.
  it('keeps both of two entries added across a render', async () => {
    const { puts } = serve(stored);
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.library.entries.at(-1)?.id).toBe('logo'));
    const addEntry = result.current.addEntry;
    act(() => addEntry(entry('one')));
    act(() => addEntry(entry('two')));
    expect(puts.at(-1)?.entries.map((e) => e.id)).toEqual(['logo', 'one', 'two']);
    expect(result.current.library.entries.slice(-2).map((e) => e.id)).toEqual(['one', 'two']);
  });

  // Breaks if a failed save rejects out of the hook (an unhandled rejection) or
  // rolls the local change back.
  it('keeps the change when the save fails', async () => {
    serve(stored, false);
    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.library.entries.at(-1)?.id).toBe('logo'));
    await act(async () => result.current.addEntry(entry('kept')));
    expect(result.current.library.entries.at(-1)?.id).toBe('kept');
  });

  // Breaks if the operations change identity between renders (they are handed
  // to LibraryPanel as props).
  it('hands out stable operations', async () => {
    serve(stored);
    const { result, rerender } = renderHook(() => useLibrary());
    const first = result.current;
    await waitFor(() => expect(result.current.library.entries.at(-1)?.id).toBe('logo'));
    rerender();
    expect(result.current.addCategory).toBe(first.addCategory);
    expect(result.current.deleteCategory).toBe(first.deleteCategory);
    expect(result.current.addEntry).toBe(first.addEntry);
  });
});
