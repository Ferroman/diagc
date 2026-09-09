import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagramming/core';
import { COLLAPSED_SIZE, layoutOptionsFor, layoutView, type NodeGeometry } from './layout';
import { buildGraph } from './layout-graph';

function makeModel() {
  const m = model('t');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a, b);
  const ext = m.node('ext', { type: 'service' });
  m.relate(ext, a, { kind: 'sync' });
  return m.toJSON();
}

describe('layoutOptionsFor', () => {
  it('returns the tuned layered defaults with no settings', () => {
    const o = layoutOptionsFor();
    expect(o['elk.algorithm']).toBe('layered');
    expect(o['elk.direction']).toBe('RIGHT');
    expect(o['elk.spacing.nodeNode']).toBe('40');
    expect(o['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('60');
    expect(o['elk.layered.thoroughness']).toBe('10');
    expect(o['elk.layered.nodePlacement.strategy']).toBe('BRANDES_KOEPF');
    expect(o['elk.edgeRouting']).toBeUndefined();
  });

  it('threads algorithm/direction/spacing and drops layered knobs for other algorithms', () => {
    const o = layoutOptionsFor({ algorithm: 'radial', direction: 'DOWN', spacing: 24 });
    expect(o['elk.algorithm']).toBe('radial');
    expect(o['elk.direction']).toBe('DOWN');
    expect(o['elk.spacing.nodeNode']).toBe('24');
    // layered-only knobs are omitted for non-layered algorithms
    expect(o['elk.layered.thoroughness']).toBeUndefined();
    expect(o['elk.layered.nodePlacement.strategy']).toBeUndefined();
  });

  it('derives between-layer spacing from the base spacing (layered)', () => {
    const o = layoutOptionsFor({ spacing: 24 });
    expect(o['elk.spacing.nodeNode']).toBe('24');
    expect(o['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('36');
  });

  it('wraps layered chains to a target aspect ratio only when asked', () => {
    // The default must stay unwrapped: turning this on by default would move
    // every existing diagram and every committed docs PNG.
    expect(layoutOptionsFor()['elk.layered.wrapping.strategy']).toBeUndefined();
    expect(layoutOptionsFor()['elk.aspectRatio']).toBeUndefined();
    const o = layoutOptionsFor({ aspectRatio: 1.6 });
    expect(o['elk.layered.wrapping.strategy']).toBe('MULTI_EDGE');
    expect(o['elk.aspectRatio']).toBe('1.6');
  });

  it('never emits wrapping for a non-layered algorithm', () => {
    const o = layoutOptionsFor({ algorithm: 'force', aspectRatio: 1.6 });
    expect(o['elk.layered.wrapping.strategy']).toBeUndefined();
    expect(o['elk.aspectRatio']).toBeUndefined();
  });

  it('opts into orthogonal edge routing', () => {
    expect(layoutOptionsFor({ edgeRouting: 'orthogonal' })['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(layoutOptionsFor({ edgeRouting: 'curved' })['elk.edgeRouting']).toBeUndefined();
  });
});

describe('layoutView', () => {
  it('positions children relative to their expanded parent and within its bounds', async () => {
    const view = compileView(makeModel(), { focus: ['sys'] });
    const { geometry } = await layoutView(view);
    const sys = geometry.get('sys');
    const a = geometry.get('a');
    expect(sys).toBeDefined();
    expect(a).toBeDefined();
    // child coordinates are parent-relative and inside the parent box
    expect(a!.x).toBeGreaterThanOrEqual(0);
    expect(a!.y).toBeGreaterThanOrEqual(0);
    expect(a!.x + a!.width).toBeLessThanOrEqual(sys!.width);
    expect(a!.y + a!.height).toBeLessThanOrEqual(sys!.height);
  });

  it('gives collapsed containers the fixed collapsed size', async () => {
    const view = compileView(makeModel(), {}); // unfocused => rests collapsed
    const { geometry } = await layoutView(view);
    expect(geometry.get('sys')).toMatchObject(COLLAPSED_SIZE);
    expect(geometry.has('a')).toBe(false);
  });

  it('returns the identical result instance for an equivalent compiled view (cache)', async () => {
    const m = makeModel();
    const first = await layoutView(compileView(m, { focus: ['sys'] }));
    const second = await layoutView(compileView(m, { focus: ['sys'] }));
    expect(second).toBe(first);
  });

  it('overlay toggles do not move boxes — layout is keyed on the full relation set', async () => {
    const m = model('ov');
    m.layer('flow', { name: 'flow' });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, b);
    m.relate(a, b, { kind: 'sync' });
    m.relate(b, a, { kind: 'flow', layer: 'flow' });
    const j = m.toJSON();
    const withoutLayer = await layoutView(compileView(j, { focus: ['sys'] }));
    const withLayer = await layoutView(compileView(j, { focus: ['sys'], activeLayers: ['flow'] }));
    expect(withLayer).toBe(withoutLayer); // same cache entry => identical geometry
  });

  it('honors per-node size overrides and keys the cache on them', async () => {
    const view = compileView(makeModel(), { focus: ['sys'] });
    const small = await layoutView(view, new Map([['ext', { width: 100, height: 40 }]]));
    expect(small.geometry.get('ext')).toMatchObject({ width: 100, height: 40 });
    // a different override for the same view must NOT serve the cached geometry
    const big = await layoutView(view, new Map([['ext', { width: 300, height: 200 }]]));
    expect(big.geometry.get('ext')).toMatchObject({ width: 300, height: 200 });
  });

  it('keys the cache on aspectRatio, so toggling wrap re-runs elk', async () => {
    const view = compileView(makeModel(), { focus: ['sys'] });
    const plain = await layoutView(view, undefined, {});
    const wrapped = await layoutView(view, undefined, { aspectRatio: 1.6 });
    // a different settings signature must never serve the other's geometry
    expect(wrapped).not.toBe(plain);
  });

  it('reserves horizontal room for a long edge label (label-aware layout)', async () => {
    const withLabel = model('wl');
    const a1 = withLabel.node('a', { type: 'service' });
    const b1 = withLabel.node('b', { type: 'service' });
    withLabel.relate(a1, b1, { kind: 'sync', label: 'a fairly long descriptive edge label here' });
    const noLabel = model('nl');
    const a2 = noLabel.node('a', { type: 'service' });
    const b2 = noLabel.node('b', { type: 'service' });
    noLabel.relate(a2, b2, { kind: 'sync' });

    const withGeo = await layoutView(compileView(withLabel.toJSON(), {}));
    const noGeo = await layoutView(compileView(noLabel.toJSON(), {}));
    // in a left-to-right layered layout the labelled edge pushes its target
    // further right to make room for the reserved label box
    expect(withGeo.geometry.get('b')!.x).toBeGreaterThan(noGeo.geometry.get('b')!.x);
  });

  it('collects orthogonal edge routes only when requested', async () => {
    const m = model('orth');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'sync' });
    const view = compileView(m.toJSON(), {});

    const curved = await layoutView(view);
    expect(curved.routes.size).toBe(0);

    const orthogonal = await layoutView(view, undefined, { edgeRouting: 'orthogonal' });
    const edgeId = view.layoutEdges[0]!.id;
    const route = orthogonal.routes.get(edgeId);
    expect(route).toBeDefined();
    expect(route!.length).toBeGreaterThanOrEqual(2);
  });

  it('lifts a nested edge route into absolute coordinates within its container', async () => {
    const m = model('nest');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, b);
    m.relate(a, b, { kind: 'sync' });
    const view = compileView(m.toJSON(), { focus: ['sys'] });

    const res = await layoutView(view, undefined, { edgeRouting: 'orthogonal' });
    const edge = view.layoutEdges.find((e) => e.from === 'a' && e.to === 'b')!;
    const route = res.routes.get(edge.id);
    expect(route).toBeDefined();
    // sys is a root, so its geometry is already absolute; the a→b route lives
    // inside sys, so its absolute waypoints must fall within sys's bounds (proves
    // the container-relative → absolute lift, not raw elk-local coordinates).
    const sysGeo = res.geometry.get('sys')!;
    for (const p of route!) {
      expect(p.x).toBeGreaterThanOrEqual(sysGeo.x - 1);
      expect(p.x).toBeLessThanOrEqual(sysGeo.x + sysGeo.width + 1);
      expect(p.y).toBeGreaterThanOrEqual(sysGeo.y - 1);
      expect(p.y).toBeLessThanOrEqual(sysGeo.y + sysGeo.height + 1);
    }
  });

  it('translates a route by the container elk re-parented it to, not the declaring node', async () => {
    // The flat graph declares every edge on the ROOT, but INCLUDE_CHILDREN makes
    // elk express a routed edge in the coordinate system of its endpoints'
    // lowest common ancestor (reported in the output edge's `container` field).
    // An external predecessor pushes the container away from the origin, so a
    // route mistakenly read as root-relative lands visibly outside it.
    const m = model('offs');
    const ext = m.node('ext', { type: 'service' });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, b);
    m.relate(ext, a, { kind: 'sync' });
    m.relate(a, b, { kind: 'sync' });
    const view = compileView(m.toJSON(), { pins: { sys: 'expanded' } });

    const res = await layoutView(view, undefined, { edgeRouting: 'orthogonal' });
    const sysGeo = res.geometry.get('sys')!;
    // the discriminator: ext's layer shifts sys off the origin, so the missing
    // offset would be non-trivial
    expect(Math.max(sysGeo.x, sysGeo.y)).toBeGreaterThan(20);
    const edge = view.layoutEdges.find((e) => e.from === 'a' && e.to === 'b')!;
    const route = res.routes.get(edge.id)!;
    expect(route.length).toBeGreaterThanOrEqual(2);
    for (const p of route) {
      expect(p.x).toBeGreaterThanOrEqual(sysGeo.x - 1);
      expect(p.x).toBeLessThanOrEqual(sysGeo.x + sysGeo.width + 1);
      expect(p.y).toBeGreaterThanOrEqual(sysGeo.y - 1);
      expect(p.y).toBeLessThanOrEqual(sysGeo.y + sysGeo.height + 1);
    }
  });

  it('falls back to the flat graph when an algorithm rejects the lifted one', async () => {
    // radial throws `IllegalArgumentException: The given graph is not a tree!`
    // the moment it sees a cyclic edge set. It only appeared to work before
    // because every non-layered algorithm was handed an empty edge set.
    const m = model('cyc');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const c = m.node('c', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, b, c);
    m.relate(a, b, { kind: 'sync' });
    m.relate(b, c, { kind: 'sync' });
    m.relate(c, a, { kind: 'sync' }); // the cycle radial rejects
    const view = compileView(m.toJSON(), { focus: ['sys'] });

    const { geometry } = await layoutView(view, undefined, { algorithm: 'radial' });
    // every node still placed — a rejected pick degrades, it does not blank
    for (const id of ['sys', 'a', 'b', 'c']) expect(geometry.has(id)).toBe(true);
  });

  it('keeps orthogonal routes under a nested algorithm when nothing was lifted', async () => {
    // The nested path only invalidates routes on a graph it actually
    // restructured. A container-free diagram lifts nothing, so force must go on
    // returning the routes it returned before edge-lifting existed — keying
    // this off the algorithm instead of the outcome silently dropped them all.
    const m = model('flatroutes');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const c = m.node('c', { type: 'service' });
    m.relate(a, b, { kind: 'sync' });
    m.relate(b, c, { kind: 'sync' });
    const view = compileView(m.toJSON(), {});

    const res = await layoutView(view, undefined, { algorithm: 'force', edgeRouting: 'orthogonal' });
    expect(res.routes.size).toBe(view.layoutEdges.length);
    for (const e of view.layoutEdges) expect(res.routes.get(e.id)!.length).toBeGreaterThanOrEqual(2);
  });

  it('skips orthogonal routes on the nested path rather than returning partial ones', async () => {
    const m = model('nr');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, b);
    m.relate(a, b, { kind: 'sync' });
    const view = compileView(m.toJSON(), { focus: ['sys'] });

    // layered still routes
    expect((await layoutView(view, undefined, { edgeRouting: 'orthogonal' })).routes.size).toBeGreaterThan(0);
    // force does not: elk returns sections for only some edges, and a lifted
    // edge's waypoints connect containers, not the nodes the renderer draws.
    expect((await layoutView(view, undefined, { algorithm: 'force', edgeRouting: 'orthogonal' })).routes.size).toBe(
      0,
    );
  });
});

/**
 * The regression that would have caught the whole class of bug this branch
 * fixes. Before edge-lifting, every non-layered algorithm saw an empty edge set
 * inside a nested diagram — the root edges pointed at deep descendants it could
 * not resolve, and `elk.algorithm` never reached the containers — so all of
 * them degraded to the same plain packing. Measured on the fixture below: with
 * the pre-lift graph, `force` and `stress` return byte-identical geometry.
 *
 * Nothing else guards the mechanism. An elk upgrade that changed how the
 * options are read, or a regression in `buildGraph`, would restore that silent
 * collapse while every other test in this file still passed.
 */
describe('nested cross-container layout actually varies by algorithm', () => {
  /** Three containers, three leaves each, and edges that ONLY cross container
   * walls — the shape where the old code saw nothing to lay out. */
  function crossOnly() {
    const m = model('nested-cross');
    const boxes = ['L', 'M', 'R'].map((id) => m.node(id, { type: 'system' }));
    const leaf: Record<string, ReturnType<typeof m.node>> = {};
    for (const prefix of ['l', 'm', 'r']) {
      for (let i = 1; i <= 3; i++) leaf[`${prefix}${i}`] = m.node(`${prefix}${i}`, { type: 'service' });
    }
    boxes[0]!.contains(leaf['l1']!, leaf['l2']!, leaf['l3']!);
    boxes[1]!.contains(leaf['m1']!, leaf['m2']!, leaf['m3']!);
    boxes[2]!.contains(leaf['r1']!, leaf['r2']!, leaf['r3']!);
    const crossing: [string, string][] = [
      ['l1', 'm1'],
      ['l2', 'r1'],
      ['m2', 'r2'],
      ['l3', 'm3'],
      ['m1', 'r3'],
      ['l1', 'r1'],
    ];
    for (const [from, to] of crossing) m.relate(leaf[from]!, leaf[to]!, { kind: 'sync' });
    return compileView(m.toJSON(), { focus: ['L', 'M', 'R'] });
  }

  // stable, id-sorted; rounded so float noise cannot pass for a real difference
  const serialise = (geometry: Map<string, NodeGeometry>) =>
    [...geometry.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, g]) => `${id}:${Math.round(g.x)},${Math.round(g.y)},${Math.round(g.width)},${Math.round(g.height)}`)
      .join('|');

  it('force, stress and mrtree each produce different geometry', async () => {
    const view = crossOnly();
    const algorithms = ['force', 'stress', 'mrtree'] as const;
    const geometries = new Map<string, string>();
    for (const algorithm of algorithms) {
      // the fixture must actually exercise lifting, or the comparison below
      // degenerates into three flat-graph runs and proves nothing
      expect(buildGraph(view, undefined, { algorithm }).lifted).toBe(true);
      geometries.set(algorithm, serialise((await layoutView(view, undefined, { algorithm })).geometry));
    }
    // 3 containers + 9 leaves, all placed
    for (const g of geometries.values()) expect(g.split('|')).toHaveLength(12);

    for (const a of algorithms) {
      for (const b of algorithms) {
        if (a < b) expect(geometries.get(a), `${a} vs ${b}`).not.toBe(geometries.get(b));
      }
    }
  });
});
