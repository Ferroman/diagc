export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function unionBounds(members: readonly (Bounds | undefined)[]): Bounds | undefined {
  const real = members.filter((b): b is Bounds => b !== undefined);
  if (real.length === 0) return undefined;
  const x = Math.min(...real.map((b) => b.x));
  const y = Math.min(...real.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...real.map((b) => b.x + b.width)) - x,
    height: Math.max(...real.map((b) => b.y + b.height)) - y,
  };
}

/**
 * Everything the canvas draws OUTSIDE the node boxes: edges (a causal-loop link
 * bows well clear of the straight line between its ends), their labels, loop
 * badges, and the captions hanging under image nodes.
 *
 * React Flow's node bounds know none of it, and a frame fitted to the boxes
 * alone cropped all of it out of the exported PNG — a causal-loop diagram lost
 * whole arcs and most of its R/B badges. There is no model of where these land
 * short of redoing the edge geometry, so they are measured where they are
 * actually drawn and mapped back through the viewport transform.
 *
 * Unmeasurable elements (all-zero rects: jsdom, or not laid out yet) are
 * skipped, so callers fall back to the node bounds exactly as before.
 *
 * The plan's time-axis header is an overlay, not a node, so its frame rect is
 * what reaches the export bounds.
 */
const OVERHANG_SELECTOR =
  '.react-flow__edge, .react-flow__edgelabel-renderer > *, .dg-loop-badge, .dg-image-caption, .dg-order-band-header, .dg-time-axis-frame';

export function overhangBounds(
  root: ParentNode | null | undefined,
  toFlow: (screen: { x: number; y: number }) => { x: number; y: number },
): Bounds | undefined {
  if (root === null || root === undefined) return undefined;
  const rects: Bounds[] = [];
  for (const el of root.querySelectorAll(OVERHANG_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const a = toFlow({ x: r.left, y: r.top });
    const b = toFlow({ x: r.right, y: r.bottom });
    rects.push({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
  }
  return unionBounds(rects);
}
