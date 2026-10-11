import { nextFreeId } from '@diagc/core/internal';

// A copy's name is the source's root plus `-copy`, then `-copy-2`, `-copy-3`, …
// The trailing marker is stripped from the source first, so duplicating a copy
// bumps the number rather than stacking suffixes (`x-copy-copy` reads as a
// mistake; `x-copy-2` reads as the second copy).
const COPY_SUFFIX = /-copy(-\d+)?$/;

/**
 * The first free `<root>-copy[-n]` name for a duplicate of `base`.
 *
 * `taken` is every name already in play (compiled artifacts, JSON sources and
 * in-memory drafts alike) — the caller owns that union, since a collision with
 * a read-only artifact is just as fatal as one with an editable source.
 */
export function nextCopyName(base: string, taken: ReadonlySet<string>): string {
  const first = `${base.replace(COPY_SUFFIX, '')}-copy`;
  // `-copy` is the unnumbered first copy; numbering starts at 2 so the pair
  // reads as "the copy" and "the second copy".
  return taken.has(first) ? nextFreeId(`${first}-`, taken, 2) : first;
}
