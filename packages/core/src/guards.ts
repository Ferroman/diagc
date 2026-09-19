import { EDGE_LABEL_SIDES, type Drawings, type LayoutOverlay } from './types';

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
  const sizesOk =
    layout.sizes === undefined ||
    (typeof layout.sizes === 'object' &&
      layout.sizes !== null &&
      Object.values(layout.sizes).every(
        (s) => typeof s === 'object' && s !== null && dim((s as { w?: unknown }).w) && dim((s as { h?: unknown }).h),
      ));
  if (!sizesOk) return false;
  const unfolded = (u as { unfolded?: unknown }).unfolded;
  const unfoldedOk =
    unfolded === undefined ||
    (typeof unfolded === 'object' &&
      unfolded !== null &&
      !Array.isArray(unfolded) &&
      Object.values(unfolded).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')));
  if (!unfoldedOk) return false;
  const edgeLabels = (u as { edgeLabels?: unknown }).edgeLabels;
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const placementOk = (v: unknown): boolean =>
    isRecord(v) &&
    typeof v['t'] === 'number' &&
    Number.isFinite(v['t']) &&
    (v['side'] === undefined || (EDGE_LABEL_SIDES as readonly unknown[]).includes(v['side']));
  const edgeLabelsOk =
    edgeLabels === undefined ||
    (isRecord(edgeLabels) &&
      Object.values(edgeLabels).every(
        (plane) =>
          isRecord(plane) && Object.values(plane).every((rel) => isRecord(rel) && Object.values(rel).every(placementOk)),
      ));
  if (!edgeLabelsOk) return false;
  // A note offset is drawn straight into a transform, so a NaN or an Infinity
  // here is a note the reader can never find again — finiteness is checked, not
  // just the type.
  const finiteNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
  const notes = (u as { notes?: unknown }).notes;
  const notesOk =
    notes === undefined ||
    (isRecord(notes) &&
      Object.values(notes).every(
        (plane) =>
          isRecord(plane) &&
          Object.values(plane).every(
            (o) =>
              isRecord(o) &&
              finiteNum(o['dx']) &&
              finiteNum(o['dy']) &&
              // `true` or absent: a stored `false` would be a second spelling of "closed"
              (o['open'] === undefined || o['open'] === true),
          ),
      ));
  if (!notesOk) return false;
  // `export` is export-only presentation (see LayoutOverlay): an object whose
  // only field today is a list of node ids. Validate it structurally so a typo
  // is a 400 from the studio's save endpoint rather than a silently ignored
  // block — an unreadable PNG is a hard defect to trace back to a layout file.
  const exp = (u as { export?: unknown }).export;
  if (exp === undefined) return true;
  if (typeof exp !== 'object' || exp === null || Array.isArray(exp)) return false;
  const collapsed = (exp as { collapsed?: unknown }).collapsed;
  return (
    collapsed === undefined || (Array.isArray(collapsed) && collapsed.every((id) => typeof id === 'string'))
  );
}

/** Structural guard for a drawings sidecar — the same contract as
 * isLayoutOverlay: shape only, shared by the save route and the client loader.
 * Every rule here is one the renderer relies on without re-checking (even point
 * count, finite numbers, positive width). */
export function isDrawings(u: unknown): u is Drawings {
  if (typeof u !== 'object' || u === null) return false;
  const d = u as { version?: unknown; planes?: unknown };
  if (d.version !== 1 || typeof d.planes !== 'object' || d.planes === null) return false;
  const finite = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n);
  return Object.values(d.planes).every(
    (bucket) =>
      Array.isArray(bucket) &&
      bucket.every((s) => {
        if (typeof s !== 'object' || s === null) return false;
        const st = s as { id?: unknown; points?: unknown; color?: unknown; width?: unknown };
        if (typeof st.id !== 'string') return false;
        if (!Array.isArray(st.points) || st.points.length < 2 || st.points.length % 2 !== 0) return false;
        if (!st.points.every(finite)) return false;
        if (st.color !== undefined && typeof st.color !== 'string') return false;
        return st.width === undefined || (finite(st.width) && (st.width as number) > 0);
      }),
  );
}
