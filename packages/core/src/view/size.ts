import type { HierarchyIndex } from './hierarchy';
import type { Size } from './types';

export const LEAF_SIZE: Size = { width: 160, height: 80 };
export const CONTAINER_PADDING = 24;
export const CONTAINER_HEADER = 32;

/** Rough intrinsic (world-unit) sizes for LOD decisions; Plan 3 swaps in
 * renderer-measured sizes through the same Map shape. */
export function estimateSizes(h: HierarchyIndex): Map<string, Size> {
  const sizes = new Map<string, Size>();
  const visit = (id: string): Size => {
    const memo = sizes.get(id);
    if (memo) return memo;
    const kids = h.childrenOf.get(id) ?? [];
    let size: Size;
    if (kids.length === 0) {
      size = { ...LEAF_SIZE };
    } else {
      const kidSizes = kids.map(visit);
      const cols = Math.ceil(Math.sqrt(kidSizes.length));
      const rows = Math.ceil(kidSizes.length / cols);
      const cellW = Math.max(...kidSizes.map((s) => s.width));
      const cellH = Math.max(...kidSizes.map((s) => s.height));
      size = {
        width: cols * cellW + (cols + 1) * CONTAINER_PADDING,
        height: rows * cellH + (rows + 1) * CONTAINER_PADDING + CONTAINER_HEADER,
      };
    }
    sizes.set(id, size);
    return size;
  };
  for (const id of h.parentsOf.keys()) visit(id);
  return sizes;
}
