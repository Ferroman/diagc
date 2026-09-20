import type { UrlStateAdapter } from '@diagc/studio/src/host';

/** Deep-link state without a browser URL: the studio's own writes just store
 * (replace-vs-push is meaningless with no history), while navigate() plays the
 * role of an external hashchange — store AND notify. */
export function memoryUrlState(): UrlStateAdapter & { navigate(hash: string): void } {
  let hash = '';
  const subs = new Set<() => void>();
  return {
    get: () => hash,
    set: (h) => { hash = h; },
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    navigate: (h) => { hash = h; subs.forEach((cb) => cb()); },
  };
}
