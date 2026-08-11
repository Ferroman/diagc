import type { Library, LibraryCategory, LibraryEntry } from './types';

const categories: LibraryCategory[] = [{ id: 'data', name: 'Data', builtin: true }];

const entries: LibraryEntry[] = [
  {
    id: 'data-table',
    category: 'data',
    name: 'Table',
    keywords: ['db', 'sql', 'entity', 'erd', 'schema', 'postgres'],
    template: { type: 'db-table', columns: [{ name: 'id', type: 'int', pk: true }] },
  },
];

export const DATA_PACK: Library = { categories, entries };
