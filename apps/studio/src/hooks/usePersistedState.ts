import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * localStorage-backed state with a guarded read and a guarded best-effort write.
 *
 * Replaces the many hand-rolled readers/persist-pairs that all shared the same
 * shape: read once with a try/catch (localStorage is unavailable in some
 * embeddings — every access must be guarded), and persist on change with a
 * try/catch that swallows failures. `read` maps the raw stored string (null when
 * absent) to the state's type; when it returns null the value falls back to
 * `fallback`. `serialize` encodes a value for storage (default String) so keys
 * with an established on-disk format (e.g. the docks' 'collapsed'/'expanded')
 * keep writing that format; it must be stable across renders.
 */
export function usePersistedState<T>(
  key: string,
  fallback: T | (() => T),
  read?: (raw: string | null) => T | null,
  serialize: (value: T) => string = String,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const initial = () => (typeof fallback === 'function' ? (fallback as () => T)() : fallback);
    try {
      return read?.(localStorage.getItem(key)) ?? initial();
    } catch {
      /* storage unavailable — best-effort */
      return initial();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      /* storage unavailable — persistence is best-effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `serialize` is required to be stable
  }, [key, value]);
  return [value, setValue];
}
