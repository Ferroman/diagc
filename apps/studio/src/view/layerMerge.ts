/**
 * After merging `sources` into `target`, remap a set of visible layer ids so a
 * previously-visible source stays visible under the target (deduped). When
 * `target` is omitted (merge to the base sheet), the sources are dropped since
 * they no longer exist and have no replacement id. Returns the same array
 * reference when nothing changed, so React can skip a re-render.
 */
export function remapVisibleLayers(visible: string[], sources: string[], target?: string): string[] {
  const set = new Set(sources);
  if (!visible.some((l) => set.has(l))) return visible;
  if (target === undefined) return visible.filter((l) => !set.has(l));
  return [...new Set(visible.map((l) => (set.has(l) ? target : l)))];
}
