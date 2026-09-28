import type { Column } from './types';

/**
 * The table rows a view draws: every untagged column, plus each tagged one
 * whose layer is active. A layer can hold a single row this way (a proposed
 * column, an audit field) without faking a second table beside the real one.
 *
 * Returns `columns` itself when nothing is filtered out, so callers that key
 * caches or memos on identity see no change for tables that use no layers.
 */
export function visibleColumns(columns: Column[], activeLayers: ReadonlySet<string>): Column[] {
  if (columns.every((c) => c.layer === undefined || activeLayers.has(c.layer))) return columns;
  return columns.filter((c) => c.layer === undefined || activeLayers.has(c.layer));
}

/**
 * Puts the rows a view hid back around an edit of the rows it showed. Table
 * edits replace the whole column list, and a view that drew only the visible
 * rows must not delete the rest by saving. Each hidden column returns to its
 * original index (clamped to the end), so an edit that keeps the visible count
 * leaves the hidden rows exactly where they were.
 */
export function withHiddenColumns(all: Column[], shown: readonly Column[], edited: Column[]): Column[] {
  if (shown === all) return edited;
  const visible = new Set(shown);
  const out = [...edited];
  all.forEach((c, i) => {
    if (!visible.has(c)) out.splice(Math.min(i, out.length), 0, c);
  });
  return out;
}
