import type { LayoutDirection } from '@diagc/core';

export interface BandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface OrderBand extends BandRect {
  order: number;
  /** where the header text starts (left/top of the band, inside it) */
  header: { x: number; y: number };
}

/** Half of the default gap between two layers (layout-graph's nodeNode, 40):
 * in an automatic layout adjacent bands meet exactly, with no seam and no overlap. */
export const BAND_PAD = 20;
/** room kept for the header beside (DOWN/UP) the content */
export const HEADER_W = 96;
/** room kept for the header above (RIGHT/LEFT) the content */
export const HEADER_H = 28;
const HEADER_INSET = 8;

const SUFFIX = ['th', 'st', 'nd', 'rd'] as const;
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (SUFFIX[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export const bandLabel = (order: number, decisions: number): string =>
  order === 0 ? (decisions > 1 ? 'Decisions' : 'Decision') : `${ordinal(order)} order`;

/**
 * One band per order, measured from where that order's nodes ACTUALLY are —
 * not assumed from a row height: a labelled arrow gives its target a row of its
 * own inside the band, and a hand-moved box stretches its band to follow it.
 * Along the flow a band hugs its nodes (plus BAND_PAD); across it every band
 * spans the whole content, plus room for the header.
 */
export function computeBands(
  rects: ReadonlyMap<string, BandRect>,
  orders: ReadonlyMap<string, number>,
  direction: LayoutDirection,
): OrderBand[] {
  const vertical = direction === 'DOWN' || direction === 'UP';
  const along = new Map<number, { lo: number; hi: number }>();
  let crossLo = Infinity;
  let crossHi = -Infinity;
  for (const [id, order] of orders) {
    const r = rects.get(id);
    if (r === undefined) continue;
    const lo = vertical ? r.y : r.x;
    const hi = vertical ? r.y + r.height : r.x + r.width;
    const span = along.get(order);
    along.set(order, span === undefined ? { lo, hi } : { lo: Math.min(span.lo, lo), hi: Math.max(span.hi, hi) });
    crossLo = Math.min(crossLo, vertical ? r.x : r.y);
    crossHi = Math.max(crossHi, vertical ? r.x + r.width : r.y + r.height);
  }
  const start = crossLo - BAND_PAD - (vertical ? HEADER_W : HEADER_H);
  const size = crossHi + BAND_PAD - start;
  return [...along.entries()]
    .sort(([a], [b]) => a - b)
    .map(([order, { lo, hi }]) => {
      const from = lo - BAND_PAD;
      const length = hi - lo + 2 * BAND_PAD;
      const box = vertical ? { x: start, y: from, width: size, height: length } : { x: from, y: start, width: length, height: size };
      return { order, ...box, header: { x: box.x + HEADER_INSET, y: box.y + HEADER_INSET } };
    });
}
