/**
 * Return a copy of `base` with x/y replaced by `positions` for any matching id
 * (width/height and any other fields preserved). Ids absent from `base` are
 * ignored. Returns `base` unchanged (same reference) when `positions` is empty.
 * Never mutates `base`.
 */
export function overlayPositions<T extends { x: number; y: number }>(
  base: Map<string, T>,
  positions: Record<string, { x: number; y: number }>,
): Map<string, T> {
  if (Object.keys(positions).length === 0) return base;
  const out = new Map(base);
  for (const [id, pos] of Object.entries(positions)) {
    const geo = out.get(id);
    if (geo !== undefined) out.set(id, { ...geo, x: pos.x, y: pos.y });
  }
  return out;
}
