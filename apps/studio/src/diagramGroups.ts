// A diagram's group is the folder part of its name: `docs/fishbone` lives in
// `docs`. Nothing is stored for this — names already carry their folder
// (`walkFiles` yields `folder/name`, `isSafeName` admits `/`), so Rename is how
// a diagram changes group and the picker only has to read the name.

/** One section of the picker: a folder and the full names of its diagrams. */
export interface DiagramGroup {
  /** folder path, `''` for root-level diagrams */
  group: string;
  names: string[];
}

/** The folder part of a diagram name — `''` when it has none. */
export function groupOf(name: string): string {
  const i = name.lastIndexOf('/');
  return i === -1 ? '' : name.slice(0, i);
}

/** The name without its folder. */
export function leafOf(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

/** How a group reads in the UI: `a/b` -> `a / b`. */
export function groupLabel(group: string): string {
  return group.split('/').join(' / ');
}

/**
 * Bucket `names` by folder, optionally narrowed by `query`.
 *
 * Root diagrams come first, then folders alphabetically. A deep path is ONE
 * group (`a/b`), a sibling of `a` rather than its child — a tree would need
 * expand state per level for a list that search already cuts down.
 *
 * The query is split on whitespace and every term must be a case-insensitive
 * substring of the FULL name, so `docs fish` finds `docs/fishbone` and a bare
 * folder name finds its members. Groups the query empties are dropped.
 */
export function groupDiagrams(names: readonly string[], query = ''): DiagramGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const byGroup = new Map<string, string[]>();
  for (const name of names) {
    const haystack = name.toLowerCase();
    if (!terms.every((t) => haystack.includes(t))) continue;
    const group = groupOf(name);
    const bucket = byGroup.get(group);
    if (bucket === undefined) byGroup.set(group, [name]);
    else bucket.push(name);
  }
  // '' sorts ahead of every folder, which is exactly "root first".
  return [...byGroup.keys()].sort().map((group) => ({ group, names: byGroup.get(group)!.sort() }));
}
