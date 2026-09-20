import type { ViewNode } from '@diagc/core';
import type { Pad } from './layout-graph';

interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Shift {
  dx: number;
  dy: number;
}

export interface ContainerFit<T> {
  geometry: ReadonlyMap<string, T>;
  /** how far each grown-leftward/upward container's origin moved (both ≤ 0) */
  shifts: ReadonlyMap<string, Shift>;
}

const NO_SHIFTS: ReadonlyMap<string, Shift> = new Map();

// elk's coordinates are fractional; a child sitting a hair past the padding
// line must not count as having left the box.
const EPSILON = 0.5;

/**
 * Grow every open container around its children, in all four directions.
 *
 * A container's size is the layout's; a child's position may be the author's (a
 * saved overlay position, a view-mode drag). Once a child is moved past the
 * wall the two disagree and the child is drawn outside the box it belongs to.
 * The box gives way: it only ever GROWS from the layout's size, so an untouched
 * diagram passes through unchanged (same map back) and dragging a child home
 * returns the container to the size elk gave it.
 *
 * Geometry is parent-relative. Growing right/down is a size change. Growing
 * left/up moves the container's origin, so its children are re-expressed
 * against the new origin — nothing moves on screen — and the move is reported
 * in `shifts`: a saved child position is relative to the container's UNSHIFTED
 * origin, and whoever turns an on-screen position back into a saved one has to
 * undo it (see DiagramView's commitMoves).
 *
 * `skip` names containers some other pass owns (activity lanes and frames are
 * banded by arrangeActivityFrames).
 */
export function fitContainers<T extends Geo>(
  geometry: ReadonlyMap<string, T>,
  roots: readonly ViewNode[],
  padOf: (n: ViewNode) => Pad,
  skip: (n: ViewNode) => boolean = () => false,
): ContainerFit<T> {
  let out: Map<string, T> | undefined;
  let shifts: Map<string, Shift> | undefined;
  const get = (id: string) => (out ?? geometry).get(id);
  const set = (id: string, g: T) => {
    out ??= new Map(geometry);
    out.set(id, g);
  };

  // children first: a nested container that grew is a bigger child of its parent
  const fit = (n: ViewNode): void => {
    n.children.forEach(fit);
    if (n.state !== 'expanded' || skip(n)) return;
    const box = get(n.id);
    if (box === undefined) return;
    const kids = n.children.map((c) => get(c.id)).filter((g): g is T => g !== undefined);
    if (kids.length === 0) return;
    const pad = padOf(n);
    const left = Math.min(...kids.map((k) => k.x)) - pad.left;
    const top = Math.min(...kids.map((k) => k.y)) - pad.top;
    const dx = left < -EPSILON ? left : 0;
    const dy = top < -EPSILON ? top : 0;
    if (dx !== 0 || dy !== 0) {
      for (const c of n.children) {
        const g = get(c.id);
        if (g !== undefined) set(c.id, { ...g, x: g.x - dx, y: g.y - dy });
      }
      (shifts ??= new Map()).set(n.id, { dx, dy });
    }
    // `kids` still holds the pre-shift positions, hence the `- dx` / `- dy`
    const grow = (have: number, need: number) => (need > have + EPSILON ? need : have);
    const width = grow(box.width - dx, Math.max(...kids.map((k) => k.x + k.width)) - dx + pad.right);
    const height = grow(box.height - dy, Math.max(...kids.map((k) => k.y + k.height)) - dy + pad.bottom);
    if (dx !== 0 || dy !== 0 || width !== box.width || height !== box.height) {
      set(n.id, { ...box, x: box.x + dx, y: box.y + dy, width, height });
    }
  };
  roots.forEach(fit);
  return { geometry: out ?? geometry, shifts: shifts ?? NO_SHIFTS };
}

/**
 * Turn an on-screen, parent-relative position back into the one to SAVE.
 *
 * On screen a node sits against its parent's current origin, which may have
 * moved since the geometry was derived: `fitContainers` shifts a grown
 * container, and React Flow's `expandParent` shifts it further mid-drag. Saved
 * positions are relative to the parent's unshifted origin, and a container's own
 * saved position is its unshifted one. Absolute positions are the invariant —
 * a shift re-expresses the children, it never moves them — so the conversion
 * goes through them.
 *
 * @param parentNow the parent's absolute origin as drawn right now ({0,0} at top level)
 * @param parentBase the parent's unshifted absolute origin ({0,0} at top level)
 * @param ownShift the node's own shift, when it is a grown container
 */
export function savedPosition(
  onScreen: { x: number; y: number },
  parentNow: { x: number; y: number },
  parentBase: { x: number; y: number },
  ownShift: Shift | undefined,
): { x: number; y: number } {
  return {
    x: onScreen.x + (parentNow.x - parentBase.x) - (ownShift?.dx ?? 0),
    y: onScreen.y + (parentNow.y - parentBase.y) - (ownShift?.dy ?? 0),
  };
}

interface ScreenNode {
  id: string;
  parentId?: string | undefined;
  position: { x: number; y: number };
}

const ORIGIN = { x: 0, y: 0 };

/**
 * `savedPosition` for a batch of moved nodes, given the canvas's current node
 * list (parent-relative, as React Flow holds it).
 *
 * `bases` is each container's unshifted absolute origin as of the last derive;
 * a parent missing from it (nothing derived yet) counts as unshifted. The
 * parent's CURRENT origin is summed from `nodes`, root first — the same order
 * `bases` was summed in, so an unshifted parent cancels to exactly zero and the
 * on-screen position is saved bit for bit.
 *
 * `fixedOrigin` names parents whose origin some other pass dictates (an
 * activity lane is banded at a fixed spot): they cannot give way leftward or
 * upward, so a child dropped past that wall is saved on it instead.
 */
export function savedPositions(
  onScreen: Readonly<Record<string, { x: number; y: number }>>,
  nodes: readonly ScreenNode[],
  bases: ReadonlyMap<string, { x: number; y: number }>,
  shifts: ReadonlyMap<string, Shift>,
  fixedOrigin: (parentId: string) => boolean = () => false,
): Record<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const absoluteOf = (id: string | undefined): { x: number; y: number } => {
    const n = id === undefined ? undefined : byId.get(id);
    if (n === undefined) return ORIGIN;
    const p = absoluteOf(n.parentId);
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(onScreen)) {
    const parentId = byId.get(id)?.parentId;
    const parentNow = absoluteOf(parentId);
    const parentBase = (parentId !== undefined ? bases.get(parentId) : undefined) ?? parentNow;
    const saved = savedPosition(pos, parentNow, parentBase, shifts.get(id));
    out[id] =
      parentId !== undefined && fixedOrigin(parentId) ? { x: Math.max(0, saved.x), y: Math.max(0, saved.y) } : saved;
  }
  return out;
}
