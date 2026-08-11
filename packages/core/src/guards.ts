import type { LayoutOverlay } from './types';

/** Structural guard for a LayoutOverlay, shared by the studio server (before
 * persisting a layout) and the client (before trusting a loaded one). Checks
 * shape only — not referential integrity against a model. */
export function isLayoutOverlay(u: unknown): u is LayoutOverlay {
  if (typeof u !== 'object' || u === null) return false;
  const layout = u as { version?: unknown; planes?: unknown; sizes?: unknown };
  if (layout.version !== 1 || typeof layout.planes !== 'object' || layout.planes === null) return false;
  const planesOk = Object.values(layout.planes).every(
    (plane) =>
      typeof plane === 'object' &&
      plane !== null &&
      Object.values(plane).every(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as { x?: unknown }).x === 'number' &&
          typeof (p as { y?: unknown }).y === 'number',
      ),
  );
  if (!planesOk) return false;
  const dim = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return (
    layout.sizes === undefined ||
    (typeof layout.sizes === 'object' &&
      layout.sizes !== null &&
      Object.values(layout.sizes).every(
        (s) => typeof s === 'object' && s !== null && dim((s as { w?: unknown }).w) && dim((s as { h?: unknown }).h),
      ))
  );
}
