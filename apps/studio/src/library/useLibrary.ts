import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUNDLED_LIBRARY } from './packs';
import { mergeLibrary, uniqueLibraryId } from './entry';
import { loadUserLibrary, saveUserLibrary } from './library-api';
import type { Library, LibraryEntry } from './types';

export interface UseLibrary {
  library: Library; // bundled ∪ user (merged)
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  addEntry: (entry: LibraryEntry) => void;
}

const BUILTIN_CAT_IDS = new Set(BUNDLED_LIBRARY.categories.map((c) => c.id));

export function useLibrary(): UseLibrary {
  const [user, setUser] = useState<Library>({ categories: [], entries: [] });
  // Mirrors `user` synchronously so overlapping async callers (e.g. two imports
  // racing across the `await uploadAsset` gap) always read the latest state
  // instead of a stale closure, avoiding dropped entries / duplicate ids.
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    void loadUserLibrary().then(setUser);
  }, []);
  const library = useMemo(() => mergeLibrary(BUNDLED_LIBRARY, user), [user]);

  const commit = useCallback((next: Library) => {
    setUser(next);
    void saveUserLibrary(next).catch(() => {
      /* best-effort; the drawer stays responsive. A future task can surface this. */
    });
  }, []);

  const addCategory = useCallback(
    (name: string) => {
      const cur = userRef.current;
      const taken = new Set(mergeLibrary(BUNDLED_LIBRARY, cur).categories.map((c) => c.id));
      const id = uniqueLibraryId(name, taken, 'category');
      commit({ ...cur, categories: [...cur.categories, { id, name: name.trim() || id }] });
    },
    [commit],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      if (BUILTIN_CAT_IDS.has(id)) return;
      const cur = userRef.current;
      commit({
        categories: cur.categories.filter((c) => c.id !== id),
        entries: cur.entries.filter((e) => e.category !== id),
      });
    },
    [commit],
  );

  const addEntry = useCallback(
    (entry: LibraryEntry) => {
      const cur = userRef.current;
      commit({ ...cur, entries: [...cur.entries, entry] });
    },
    [commit],
  );

  return { library, addCategory, deleteCategory, addEntry };
}
