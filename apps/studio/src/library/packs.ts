import type { Library, LibraryCategory, LibraryEntry } from './types';
import { ACTIVITY_PACK } from './packs.activity';
import { AWS_PACK } from './packs.aws';
import { AWS_CONTAINER_ENTRIES } from './packs.aws-containers';
import { C4_PACK } from './packs.c4';
import { DATA_PACK } from './packs.data';

// Vendor logos that no cloud provider's icon set covers. Assets are generated
// onto a common tile by `node scripts/build-tech-pack.mjs`.
const techIcon = (slug: string, name: string, keywords: string[]): LibraryEntry => ({
  id: `tech-${slug}`,
  category: 'tech',
  name,
  keywords,
  template: { type: 'image', image: `/library/tech/${slug}.svg`, width: 64, height: 64 },
});

const techCategories: LibraryCategory[] = [{ id: 'tech', name: 'Tech', builtin: true }];

const techEntries: LibraryEntry[] = [
  techIcon('temporal', 'Temporal', ['workflow', 'durable execution', 'orchestration', 'saga', 'activity']),
  techIcon('nats', 'NATS', ['messaging', 'pubsub', 'queue', 'jetstream', 'broker', 'events']),
  techIcon('starrocks', 'StarRocks', ['olap', 'analytics', 'warehouse', 'database', 'sql', 'mpp']),
];

/** Read-only packs bundled with the app; merged with the user library on load.
 * C4 first (the smallest, most-used stencil), then the Activity stencil, then
 * the Data pack, then the vendor logos, then the full AWS icon set — the panel
 * renders categories in this order. */
export const BUNDLED_LIBRARY: Library = {
  categories: [...C4_PACK.categories, ...ACTIVITY_PACK.categories, ...DATA_PACK.categories, ...techCategories, ...AWS_PACK.categories],
  entries: [...C4_PACK.entries, ...ACTIVITY_PACK.entries, ...DATA_PACK.entries, ...techEntries, ...AWS_CONTAINER_ENTRIES, ...AWS_PACK.entries],
};
