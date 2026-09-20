import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagc/core';
import { fitContainers, savedPosition, savedPositions } from './fit-containers';
import { CONTAINER_PAD } from './layout-graph';

/** `sys` holds `a` and `b`; `outer` holds `sys`. Everything open. */
function fixture() {
  const m = model('fit');
  const outer = m.node('outer', { type: 'system' });
  const sys = m.node('sys', { type: 'system' });
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  outer.contains(sys);
  sys.contains(a, b);
  return compileView(m.toJSON(), { pins: { outer: 'expanded', sys: 'expanded' } });
}

const pad = () => CONTAINER_PAD;
type Box = { x: number; y: number; width: number; height: number };
const geo = (over: Record<string, Box> = {}) =>
  new Map<string, Box>(
    Object.entries({
      outer: { x: 0, y: 0, width: 400, height: 300 },
      sys: { x: 16, y: 36, width: 300, height: 200 },
      a: { x: 16, y: 36, width: 100, height: 50 },
      b: { x: 150, y: 36, width: 100, height: 50 },
      ...over,
    }),
  );

describe('fitContainers', () => {
  it('hands an untouched layout back as the very same map', () => {
    const g = geo();
    const fit = fitContainers(g, fixture().roots, pad);
    expect(fit.geometry).toBe(g);
    expect(fit.shifts.size).toBe(0);
  });

  it('grows right and down around a child moved past the wall, padding included', () => {
    const fit = fitContainers(geo({ b: { x: 400, y: 300, width: 100, height: 50 } }), fixture().roots, pad);
    const sys = fit.geometry.get('sys')!;
    expect(sys.width).toBe(400 + 100 + CONTAINER_PAD.right);
    expect(sys.height).toBe(300 + 50 + CONTAINER_PAD.bottom);
    expect(sys.x).toBe(16); // the origin stays: nothing went left or up
    expect(fit.shifts.size).toBe(0);
  });

  it('grows left and up by moving the origin and re-expressing the children, so nothing moves on screen', () => {
    const before = geo({ a: { x: -84, y: 6, width: 100, height: 50 } });
    const fit = fitContainers(before, fixture().roots, pad);
    // a wants 16px of padding on its left and 36 above: the origin moves by (-100, -30)
    expect(fit.shifts.get('sys')).toEqual({ dx: -100, dy: -30 });
    const outer = fit.geometry.get('outer')!;
    const sys = fit.geometry.get('sys')!;
    const a = fit.geometry.get('a')!;
    const b = fit.geometry.get('b')!;
    expect(a).toMatchObject({ x: CONTAINER_PAD.left, y: CONTAINER_PAD.top });
    expect(sys.width).toBe(400);
    expect(sys.height).toBe(230);
    // absolute positions are the invariant (`outer` gave way to `sys` in turn)
    expect(outer.x + sys.x + a.x).toBe(16 - 84);
    expect(outer.x + sys.x + b.x).toBe(16 + 150);
    expect(outer.y + sys.y + b.y).toBe(36 + 36);
  });

  it('a container that grew pushes its own parent out too', () => {
    const fit = fitContainers(geo({ b: { x: 600, y: 36, width: 100, height: 50 } }), fixture().roots, pad);
    const sys = fit.geometry.get('sys')!;
    expect(sys.width).toBe(716);
    expect(fit.geometry.get('outer')!.width).toBe(16 + 716 + CONTAINER_PAD.right);
  });

  it('never shrinks a container below the size the layout gave it', () => {
    const fit = fitContainers(geo({ b: { x: 16, y: 100, width: 100, height: 50 } }), fixture().roots, pad);
    expect(fit.geometry.get('sys')).toMatchObject({ width: 300, height: 200 });
  });

  it('leaves alone a container another pass owns, and a folded one', () => {
    const moved = geo({ b: { x: 900, y: 36, width: 100, height: 50 } });
    const skipped = fitContainers(moved, fixture().roots, pad, (n) => n.id === 'sys');
    expect(skipped.geometry.get('sys')!.width).toBe(300);
    const m = model('folded');
    m.node('sys', { type: 'system' }).contains(m.node('a', { type: 'service' }));
    const folded = compileView(m.toJSON(), {});
    const g = new Map([['sys', { x: 0, y: 0, width: 150, height: 50 }]]);
    expect(fitContainers(g, folded.roots, pad).geometry).toBe(g);
  });
});

describe('savedPosition', () => {
  const ZERO = { x: 0, y: 0 };

  it('is the identity while nothing has shifted', () => {
    expect(savedPosition({ x: 40.5, y: 12 }, { x: 300, y: 80 }, { x: 300, y: 80 }, undefined)).toEqual({ x: 40.5, y: 12 });
    expect(savedPosition({ x: 40.5, y: 12 }, ZERO, ZERO, undefined)).toEqual({ x: 40.5, y: 12 });
  });

  it('undoes the parent\'s shift: a child is saved against the unshifted origin', () => {
    // the parent's origin moved 100 left of its base, the child is drawn 16 in
    expect(savedPosition({ x: 16, y: 36 }, { x: 200, y: 50 }, { x: 300, y: 50 }, undefined)).toEqual({ x: -84, y: 36 });
  });

  it('undoes a container\'s own shift: its saved position is its unshifted one', () => {
    expect(savedPosition({ x: 200, y: 50 }, ZERO, ZERO, { dx: -100, dy: -30 })).toEqual({ x: 300, y: 80 });
  });

  it('round-trips through fitContainers', () => {
    const before = geo({ a: { x: -84, y: 6, width: 100, height: 50 } });
    const fit = fitContainers(before, fixture().roots, pad);
    const sys = fit.geometry.get('sys')!;
    const outer = fit.geometry.get('outer')!;
    const a = fit.geometry.get('a')!;
    const sysNow = { x: outer.x + sys.x, y: outer.y + sys.y };
    const shift = fit.shifts.get('sys')!;
    const sysBase = { x: sysNow.x - shift.dx, y: sysNow.y - shift.dy };
    expect(savedPosition(a, sysNow, sysBase, undefined)).toEqual({ x: -84, y: 6 });
    // sys going left pushed `outer` out as well, so the grown container saves
    // back to where it was laid out only once BOTH shifts are undone
    const outerShift = fit.shifts.get('outer')!;
    const outerBase = { x: outer.x - outerShift.dx, y: outer.y - outerShift.dy };
    expect(savedPosition(sys, outer, outerBase, shift)).toEqual({ x: 16, y: 36 });
  });
});

describe('savedPositions', () => {
  const nodes = [
    { id: 'outer', position: { x: 0.1, y: 0.2 } },
    { id: 'sys', parentId: 'outer', position: { x: 16.3, y: 36.7 } },
    { id: 'a', parentId: 'sys', position: { x: 16, y: 36 } },
  ];
  const bases = new Map([
    ['outer', { x: 0.1, y: 0.2 }],
    ['sys', { x: 0.1 + 16.3, y: 0.2 + 36.7 }],
  ]);

  it('saves the on-screen position bit for bit when no container has shifted', () => {
    expect(savedPositions({ a: { x: 70.25, y: 41.5 } }, nodes, bases, new Map())).toEqual({ a: { x: 70.25, y: 41.5 } });
  });

  it('measures a child against where its parent WAS when the parent has moved mid-gesture', () => {
    // React Flow's expandParent slid `sys` 50 left and re-expressed the child
    const live = nodes.map((n) => (n.id === 'sys' ? { ...n, position: { x: 16.3 - 50, y: 36.7 } } : n));
    const saved = savedPositions({ a: { x: 0, y: 36 } }, live, bases, new Map());
    expect(saved['a']!.x).toBeCloseTo(-50, 9);
    expect(saved['a']!.y).toBeCloseTo(36, 9);
  });

  it('pins a child to the wall of a parent whose origin is fixed', () => {
    const live = nodes.map((n) => (n.id === 'sys' ? { ...n, position: { x: 16.3 - 50, y: 36.7 } } : n));
    expect(savedPositions({ a: { x: 0, y: 36 } }, live, bases, new Map(), (id) => id === 'sys')['a']!.x).toBe(0);
  });

  it('a top-level node is saved as drawn', () => {
    expect(savedPositions({ outer: { x: 5, y: 6 } }, nodes, bases, new Map())).toEqual({ outer: { x: 5, y: 6 } });
  });
});
