import type { Library, LibraryEntry } from './types';

const entry = (id: string, name: string, keywords: string[]): LibraryEntry => ({
  id,
  category: 'fishbone',
  name,
  keywords,
  template: { type: id },
});

/** A dropped Cause lands in the fish's stray row until it is connected to a
 * bone (the connect gesture, any kind); the panel is the faster route. */
export const FISHBONE_PACK: Library = {
  categories: [{ id: 'fishbone', name: 'Fishbone', builtin: true }],
  entries: [
    entry('fb-effect', 'Effect', ['effect', 'problem', 'head', 'fishbone', 'ishikawa']),
    entry('fb-category', 'Category', ['category', 'bone', 'fishbone', 'ishikawa']),
    entry('fb-cause', 'Cause', ['cause', 'sub-cause', 'root cause', 'fishbone', 'ishikawa']),
  ],
};
