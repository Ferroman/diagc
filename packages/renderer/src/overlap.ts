import type { CompiledView, ViewNode } from '@diagc/core';
import { containerPad } from './layout-graph';

/**
 * Overlap removal for layouts that place points, not boxes.
 *
 * elk's `stress` places every node as a dimensionless point, so boxes wider
 * than the edges between them land on each other — the pile that got stress
 * withdrawn from the picker. This pass keeps stress's arrangement (which is what
 * makes a causal loop read as a loop) and only pushes apart what collides.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rounds of pairwise pushes before giving up: each round resolves every
 * overlap it finds, and a push can only open a new one further out, so real
 * diagrams settle in a handful. The cap bounds a pathological pile. */
const MAX_ROUNDS = 200;

/** Overlap below half a pixel is not drawn; chasing it only trades one float
 * remainder from halving for the next. */
const EPSILON = 0.5;

/**
 * Push overlapping boxes apart, in place, until every pair is at least `gap`
 * apart on one axis. Each pair moves along the axis that needs less travel,
 * both boxes by half, away from each other — so the picture spreads from where
 * it was instead of sliding one way. Deterministic: pairs run in array order.
 * Returns whether any box moved.
 */
export function separate(boxes: readonly Box[], gap: number): boolean {
  let moved = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let any = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const ox = Math.min(a.x + a.width, b.x + b.width) + gap - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.height, b.y + b.height) + gap - Math.max(a.y, b.y);
        if (ox <= EPSILON || oy <= EPSILON) continue;
        any = true;
        if (ox <= oy) {
          const s = a.x + a.width / 2 <= b.x + b.width / 2 ? 1 : -1;
          a.x -= (s * ox) / 2;
          b.x += (s * ox) / 2;
        } else {
          const s = a.y + a.height / 2 <= b.y + b.height / 2 ? 1 : -1;
          a.y -= (s * oy) / 2;
          b.y += (s * oy) / 2;
        }
      }
    }
    if (!any) break;
    moved = true;
  }
  return moved;
}

/**
 * Separate every level of the view, deepest first: a container's children are
 * pushed apart, then the container grows to hold them (children shifted so
 * they start at its padding), and only then is it separated from its own
 * siblings at its new size. Geometry is parent-relative, as elk returns it.
 * Returns whether anything moved.
 */
export function removeOverlaps<T extends Box>(view: CompiledView, geometry: Map<string, T>, gap: number): boolean {
  const level = (nodes: readonly ViewNode[]): boolean => {
    let moved = false;
    for (const n of nodes) {
      if (n.children.length > 0 && level(n.children)) {
        fit(n);
        moved = true;
      }
    }
    const boxes = nodes.map((n) => geometry.get(n.id)).filter((g): g is T => g !== undefined);
    return separate(boxes, gap) || moved;
  };

  const fit = (n: ViewNode): void => {
    const own = geometry.get(n.id);
    const kids = n.children.map((c) => geometry.get(c.id)).filter((g): g is T => g !== undefined);
    if (own === undefined || kids.length === 0) return;
    const pad = containerPad(n);
    const minX = Math.min(...kids.map((k) => k.x));
    const minY = Math.min(...kids.map((k) => k.y));
    for (const k of kids) {
      k.x += pad.left - minX;
      k.y += pad.top - minY;
    }
    own.width = Math.max(own.width, Math.max(...kids.map((k) => k.x + k.width)) + pad.right);
    own.height = Math.max(own.height, Math.max(...kids.map((k) => k.y + k.height)) + pad.bottom);
  };

  return level(view.roots);
}
