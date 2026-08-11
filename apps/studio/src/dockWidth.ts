// Side-dock widths persist across reloads. localStorage is unavailable in some
// embeddings, so reads are guarded and fall back to the default.

export function clampDockWidth(px: number, min: number, max: number): number {
  if (!Number.isFinite(px)) return min;
  return Math.min(max, Math.max(min, px));
}

export function readDockWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? clampDockWidth(n, min, max) : fallback;
  } catch {
    return fallback;
  }
}
