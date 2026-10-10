import type { Box } from './box';

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom';
export interface Delta {
  dx: number;
  dy: number;
}

const HORIZONTAL: ReadonlySet<AlignMode> = new Set(['left', 'centerX', 'right']);

/** Where a box's reference point sits for a mode (absolute). */
const ref = (b: Box, mode: AlignMode): number => {
  switch (mode) {
    case 'left':
      return b.x;
    case 'centerX':
      return b.x + b.w / 2;
    case 'right':
      return b.x + b.w;
    case 'top':
      return b.y;
    case 'middle':
      return b.y + b.h / 2;
    case 'bottom':
      return b.y + b.h;
  }
};

/**
 * Deltas that line the boxes up: min edge for left/top, max edge for
 * right/bottom, the mean of the centres for the centre modes. Deltas — not
 * positions — because a delta adds cleanly to a parent-relative position, so
 * no parent arithmetic leaves this module. Unmoved ids are omitted.
 */
export function alignBoxes(boxes: readonly Box[], mode: AlignMode): Record<string, Delta> {
  if (boxes.length < 2) return {};
  const refs = boxes.map((b) => ref(b, mode));
  const target =
    mode === 'left' || mode === 'top'
      ? Math.min(...refs)
      : mode === 'right' || mode === 'bottom'
        ? Math.max(...refs)
        : refs.reduce((s, r) => s + r, 0) / refs.length;
  const out: Record<string, Delta> = {};
  boxes.forEach((b, i) => {
    const d = target - refs[i]!;
    if (d === 0) return;
    out[b.id] = HORIZONTAL.has(mode) ? { dx: d, dy: 0 } : { dx: 0, dy: d };
  });
  return out;
}

/**
 * Deltas that space the boxes evenly along `axis`: sorted by position, the
 * outermost two stay where they are and the gaps between neighbouring EDGES
 * (not centres) are equalised. Needs three boxes to mean anything.
 */
export function distributeBoxes(boxes: readonly Box[], axis: 'x' | 'y'): Record<string, Delta> {
  if (boxes.length < 3) return {};
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y);
  const len = (b: Box) => (axis === 'x' ? b.w : b.h);
  const sorted = [...boxes].sort((p, q) => pos(p) - pos(q));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = pos(last) + len(last) - pos(first);
  const total = sorted.reduce((s, b) => s + len(b), 0);
  const gap = (span - total) / (sorted.length - 1);
  const out: Record<string, Delta> = {};
  let cursor = pos(first) + len(first) + gap;
  for (const b of sorted.slice(1, -1)) {
    const d = cursor - pos(b);
    if (d !== 0) out[b.id] = axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    cursor += len(b) + gap;
  }
  return out;
}

/**
 * Drop every id whose ancestor is also in the set: moving the ancestor carries
 * the descendant, so arranging both would move it twice.
 */
export function dropDescendants(ids: readonly string[], parentOf: (id: string) => string | undefined): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    for (let p = parentOf(id); p !== undefined; p = parentOf(p)) if (set.has(p)) return false;
    return true;
  });
}
