// Drill navigation: turning "enter this node" into the containment chain the
// breadcrumb shows and the focus set the view expands. Pure helpers so the
// interaction logic in DiagramView stays trivial and testable.

/**
 * The containment chain `[root, …, id]` for the node the user entered — this is
 * both the breadcrumb trail and (in view mode) the focus set that expands.
 * Containment is a DAG, so when a node has several parents we follow one that is
 * already on the current path (`prefer`) to keep navigation stable, else the
 * first. Returns `[]` for an unknown id and terminates on any accidental cycle.
 */
export function drillChain(
  parentsOf: ReadonlyMap<string, readonly string[]>,
  id: string,
  prefer: readonly string[] = [],
): string[] {
  if (!parentsOf.has(id)) return [];
  const preferred = new Set(prefer);
  const chain = [id];
  const seen = new Set([id]);
  let cur = id;
  for (;;) {
    const parents = parentsOf.get(cur) ?? [];
    const next = parents.find((p) => preferred.has(p)) ?? parents[0];
    if (next === undefined || seen.has(next)) break;
    chain.unshift(next);
    seen.add(next);
    cur = next;
  }
  return chain;
}

/** Truncate a drill path to end at the clicked crumb (inclusive); a crumb not on
 *  the path (e.g. the "home" root button) exits all the way out to `[]`. */
export function truncatePath(path: readonly string[], id: string): string[] {
  const idx = path.indexOf(id);
  return idx < 0 ? [] : path.slice(0, idx + 1);
}
