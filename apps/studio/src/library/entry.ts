import { defined, type DiagramNode, type NodeDetails } from '@diagc/core/internal';
import type { Library, LibraryEntry } from './types';

/** Build the node a placed entry produces: template fields + identity/scoping.
 * Undefined fields are left out rather than written as `type: undefined`. */
export function entryToNode(entry: LibraryEntry, id: string, opts?: { plane?: string; layer?: string }): DiagramNode {
  const t = entry.template;
  return {
    id,
    name: entry.name,
    ...defined({
      type: t.type,
      color: t.color,
      image: t.image,
      shape: t.shape,
      columns: t.columns,
      plane: opts?.plane,
      layer: opts?.layer,
    }),
  };
}

/** The visual patch that makes an existing node look like `entry` — a TOTAL
 * replace of the four presentation channels the template governs. Fields the
 * card carries are set; fields it omits are cleared (null) so no stale look
 * survives (an image card wipes a leftover shape, a colored-box card wipes both
 * silhouette channels). Identity (name) and semantics are untouched. Size, which
 * lives in the layout not the model, is handled by the caller. */
export function entryToNodeDetails(entry: LibraryEntry): NodeDetails {
  const t = entry.template;
  return {
    type: t.type ?? null,
    color: t.color ?? null,
    image: t.image ?? null,
    shape: t.shape ?? null,
  };
}

/** Case-insensitive substring over name + keywords + category and group name.
 * Empty query = all. The group name matters: 'Compute' lives under the 'AWS'
 * group with no prefix of its own, so "aws" only finds its entries through it. */
export function searchLibrary(library: Library, query: string): LibraryEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return library.entries;
  const catName = new Map(library.categories.map((c) => [c.id, `${c.name} ${c.group ?? ''}`.toLowerCase()]));
  return library.entries.filter((e) =>
    [e.name, ...(e.keywords ?? []), catName.get(e.category) ?? ''].join(' ').toLowerCase().includes(q),
  );
}

/** Merge bundled packs with the user's stored library. Bundled comes first and
 * wins on id collision; user entries whose category doesn't resolve are dropped. */
export function mergeLibrary(builtin: Library, user: Library): Library {
  const builtinCatIds = new Set(builtin.categories.map((c) => c.id));
  const builtinEntryIds = new Set(builtin.entries.map((e) => e.id));
  const categories = [...builtin.categories, ...user.categories.filter((c) => !builtinCatIds.has(c.id))];
  const validCat = new Set(categories.map((c) => c.id));
  const entries = [
    ...builtin.entries,
    ...user.entries.filter((e) => !builtinEntryIds.has(e.id) && validCat.has(e.category)),
  ];
  return { categories, entries };
}
