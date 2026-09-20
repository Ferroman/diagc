import { describe, expect, it } from 'vitest';
import { compileView, consequenceOrders, model, type CompiledView, type ViewNode } from '@diagc/core';
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
    // down the page (core's defaultLayoutDirection resolves the activity exception upstream)
    expect(o['elk.direction']).toBe('DOWN');
    expect(o['elk.spacing.nodeNode']).toBe('40');
    // layers as far apart as the boxes within one
    expect(o['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('40');
    expect(o['elk.layered.thoroughness']).toBe('10');
    expect(o['elk.layered.nodePlacement.strategy']).toBe('BRANDES_KOEPF');
    // named although it is layered's own default: the renderer DRAWS these
    // routes, so the router must not change under it with an elk upgrade
    expect(o['elk.edgeRouting']).toBe('ORTHOGONAL');
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
    expect(o['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('24');
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

  it('routes orthogonally whichever way the edges are then drawn; other algorithms only when asked', () => {
    expect(layoutOptionsFor({ edgeRouting: 'orthogonal' })['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(layoutOptionsFor({ edgeRouting: 'curved' })['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(layoutOptionsFor({ algorithm: 'force' })['elk.edgeRouting']).toBeUndefined();
    expect(layoutOptionsFor({ algorithm: 'force', edgeRouting: 'orthogonal' })['elk.edgeRouting']).toBe('ORTHOGONAL');
  });
});

describe('layoutView', () => {
  it('spaces the inside of a container like the root (elk does not inherit spacing)', async () => {
    const m = model('gap');
    const [p, q, r] = ['p', 'q', 'r'].map((id) => m.node(id, { type: 'service' }));
    const box = m.node('box', { type: 'system' });
    box.contains(p!, q!, r!);
    m.relate(p!, r!, { kind: 'sync' });
    m.relate(q!, r!, { kind: 'sync' });
    const { geometry } = await layoutView(compileView(m.toJSON(), { focus: ['box'] }), undefined, {
      direction: 'RIGHT',
      spacing: 50,
    });
    const [gp, gq, gr] = ['p', 'q', 'r'].map((id) => geometry.get(id)!);
    // p and q share a layer: stacked `nodeNode` (50) apart, not elk's default 20
    const upper = gp!.y < gq!.y ? gp! : gq!;
    const lower = upper === gp ? gq! : gp!;
    expect(lower.y - (upper.y + upper.height)).toBeCloseTo(50, 0);
    // r is one layer on: `nodeNodeBetweenLayers`, which follows the same setting
    expect(gr!.x - (gp!.x + gp!.width)).toBeCloseTo(50, 0);
  });

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

    const withGeo = await layoutView(compileView(withLabel.toJSON(), {}), undefined, { direction: 'RIGHT' });
    const noGeo = await layoutView(compileView(noLabel.toJSON(), {}), undefined, { direction: 'RIGHT' });
    // The label box is a stop ON the edge, so it takes a layer of its own: in a
    // left-to-right layout the target is pushed right by the label's width.
    expect(withGeo.geometry.get('b')!.x).toBeGreaterThan(noGeo.geometry.get('b')!.x + 100);
  });

  it('layered always hands back its routes; another algorithm only when orthogonal routing is asked of it', async () => {
    const m = model('orth');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'sync' });
    const view = compileView(m.toJSON(), {});
    const edgeId = view.layoutEdges[0]!.id;

    // the default: the renderer draws these, which is what keeps a line off
    // the boxes elk steered it around
    const route = (await layoutView(view)).routes.get(edgeId);
    expect(route).toBeDefined();
    expect(route!.length).toBeGreaterThanOrEqual(2);
    expect((await layoutView(view, undefined, { edgeRouting: 'orthogonal' })).routes.get(edgeId)).toBeDefined();

    expect((await layoutView(view, undefined, { algorithm: 'force' })).routes.size).toBe(0);
  });

  it('reports the spot elk reserved for a labelled edge, in the same absolute space as its route', async () => {
    const m = model('spot');
    const sys = m.node('sys', { type: 'system' });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    sys.contains(a, b);
    m.relate(a, b, { kind: 'sync', label: 'places the order' });
    m.relate(b, a, { kind: 'sync' });
    const view = compileView(m.toJSON(), { pins: { sys: 'expanded' } });
    const out = await layoutView(view);
    const labelled = view.layoutEdges.find((e) => e.label !== undefined || e.labels !== undefined)!;
    const spot = out.labelSpots.get(labelled.id)!;
    expect(spot).toBeDefined();
    expect(out.labelSpots.size).toBe(1); // the unlabelled edge has none
    // inside the container both endpoints live in — i.e. lifted out of the
    // container's own frame, exactly as the route is
    const box = out.geometry.get('sys')!;
    expect(spot.x).toBeGreaterThan(box.x);
    expect(spot.x).toBeLessThan(box.x + box.width);
    expect(spot.y).toBeGreaterThan(box.y);
    expect(spot.y).toBeLessThan(box.y + box.height);
    // ...and ON the line, not beside it: the route runs through the label box
    const route = out.routes.get(labelled.id)!;
    const onLeg = route.some((p, i) => {
      const q = route[i + 1];
      if (q === undefined) return false;
      const within = (v: number, lo: number, hi: number) => v >= Math.min(lo, hi) - 1 && v <= Math.max(lo, hi) + 1;
      return within(spot.x, p.x, q.x) && within(spot.y, p.y, q.y);
    });
    expect(onLeg).toBe(true);
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

  it('keeps every order on its own row when partitions are given, across separate decisions', async () => {
    // `b` is 1st order but only feeds the 4th-order `z`: left alone, layered
    // sinks it next to z. The second decision is a separate component, which the
    // planned layout would arrange as its own block with its own rows.
    const m = model('sink');
    const so = m.secondOrder();
    const d = so.decision('d');
    const z = d.then('c').then('e').then('g').then('z');
    d.then('b').leadsTo(z);
    so.decision('d2').then('p').then('q');
    const json = m.toJSON();
    const view = compileView(json, {});
    const { orders } = consequenceOrders(json);

    const pinned = await layoutView(view, undefined, undefined, { partitions: orders });
    const rowOf = (id: string) => pinned.geometry.get(id)!.y;
    for (const [id, order] of orders) {
      for (const [other, otherOrder] of orders) {
        if (order === otherOrder) expect(rowOf(id), `${id} and ${other}`).toBe(rowOf(other));
        if (order < otherOrder) expect(rowOf(id), `${id} above ${other}`).toBeLessThan(rowOf(other));
      }
    }
    expect(pinned.routes.size).toBe(view.layoutEdges.length); // still routed

    const plain = await layoutView(view);
    expect(plain).not.toBe(pinned); // the partitions are part of the cache key
    // ...and without them `b` leaves its band-mate `c` to sit by `z`
    expect(plain.geometry.get('b')!.y).not.toBe(plain.geometry.get('c')!.y);
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

describe('layoutView reserves room under a node without drawing it taller', () => {
  // An image node's caption hangs BELOW its box (styles.css .dg-image-caption),
  // outside the size React Flow draws. elk has to keep that strip free or the
  // next icon, an edge, or the container's own border lands on the text.
  const stacked = () => {
    const m = model('captions');
    const [p, q, r] = ['p', 'q', 'r'].map((id) => m.node(id, { type: 'service' }));
    m.relate(p!, r!, { kind: 'sync' });
    m.relate(q!, r!, { kind: 'sync' }); // p and q share a layer: stacked
    return compileView(m.toJSON(), {});
  };
  const icon = { width: 64, height: 64, reserveBottom: 20 };

  it('keeps the strip free between stacked nodes and reports the DRAWN height', async () => {
    const { geometry } = await layoutView(stacked(), new Map([['p', icon], ['q', icon]]), { direction: 'RIGHT' });
    const [gp, gq] = [geometry.get('p')!, geometry.get('q')!];
    expect(gp.height).toBe(64);
    expect(gq.height).toBe(64);
    const [upper, lower] = gp.y < gq.y ? [gp, gq] : [gq, gp];
    expect(lower.y - (upper.y + upper.height)).toBeCloseTo(40 + 20, 0);
  });

  it('grows a container past the caption of its lowest child', async () => {
    const m = model('captions-in-box');
    const kid = m.node('kid', { type: 'service' });
    m.node('box', { type: 'system' }).contains(kid);
    m.relate(m.node('ext', { type: 'service' }), kid, { kind: 'sync' });
    const { geometry } = await layoutView(compileView(m.toJSON(), { focus: ['box'] }), new Map([['kid', icon]]));
    const [box, k] = [geometry.get('box')!, geometry.get('kid')!];
    expect(k.height).toBe(64);
    expect(box.height - (k.y + k.height)).toBeGreaterThanOrEqual(16 + 20 - 0.5);
  });

  it('reserves the strip for a lone packed box too', async () => {
    const m = model('lone');
    ['a', 'b', 'c', 'd'].forEach((id) => m.node(id, { type: 'service' }));
    const sizes = new Map(['a', 'b', 'c', 'd'].map((id) => [id, icon] as const));
    const { geometry } = await layoutView(compileView(m.toJSON(), {}), sizes);
    const ys = [...new Set([...geometry.values()].map((g) => g.y))].sort((x, y) => x - y);
    expect([...geometry.values()].every((g) => g.height === 64)).toBe(true);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(64 + 20 + 40);
  });
});

/**
 * Independent parts are arranged separately and packed (layout-plan.ts, pack.ts):
 * under INCLUDE_CHILDREN elk skips component packing, and everything without an
 * incoming edge used to pile into the first layer as one tall column.
 */
describe('layoutView packs independent parts', () => {
  type Rect = { id: string; x: number; y: number; width: number; height: number };
  /** absolute rects of every node, resolved down the view tree */
  const absolute = (view: CompiledView, geometry: Map<string, NodeGeometry>): Map<string, Rect> => {
    const out = new Map<string, Rect>();
    const walk = (n: ViewNode, ox: number, oy: number) => {
      const g = geometry.get(n.id)!;
      out.set(n.id, { id: n.id, x: ox + g.x, y: oy + g.y, width: g.width, height: g.height });
      n.children.forEach((c) => walk(c, ox + g.x, oy + g.y));
    };
    view.roots.forEach((r) => walk(r, 0, 0));
    return out;
  };
  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const bounds = (rects: Rect[]) => {
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return { width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
  };

  it('lays a dozen unrelated boxes out as a grid, not a column', async () => {
    const m = model('loose');
    for (let i = 0; i < 12; i++) m.node(`n${i}`, { type: 'service' });
    const view = compileView(m.toJSON(), {});
    const { geometry } = await layoutView(view);
    const rects = [...absolute(view, geometry).values()];
    const b = bounds(rects);
    // toward a portrait page by default (pack.ts), never one tall column
    expect(b.width / b.height).toBeGreaterThan(0.4);
    expect(b.width / b.height).toBeLessThan(1.6);
    expect(new Set(rects.map((r) => r.x)).size).toBeGreaterThan(1);
    rects.forEach((r, i) => rects.slice(i + 1).forEach((o) => expect(overlap(r, o)).toBe(false)));
  });

  it('keeps separate connected parts apart from each other and from loose boxes', async () => {
    const m = model('parts');
    const n = (id: string) => m.node(id, { type: 'service' });
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(n);
    m.relate(a!, b!, { kind: 'sync' });
    m.relate(b!, c!, { kind: 'sync' });
    m.relate(d!, e!, { kind: 'sync' });
    ['x', 'y', 'z'].forEach(n);
    const view = compileView(m.toJSON(), {});
    const { geometry } = await layoutView(view);
    const rects = [...absolute(view, geometry).values()];
    expect(rects).toHaveLength(8);
    rects.forEach((r, i) => rects.slice(i + 1).forEach((o) => expect(overlap(r, o)).toBe(false)));
    // a chain still reads top to bottom inside its own part
    const at = absolute(view, geometry);
    expect(at.get('a')!.y).toBeLessThan(at.get('b')!.y);
    expect(at.get('b')!.y).toBeLessThan(at.get('c')!.y);
    expect(at.get('a')!.x).toBe(at.get('c')!.x);
  });

  it('packs the inside of a container no edge crosses, and sizes it to fit with its header room', async () => {
    const m = model('closed');
    const kids = Array.from({ length: 8 }, (_, i) => m.node(`k${i}`, { type: 'service' }));
    const box = m.node('box', { type: 'system' });
    box.contains(...kids);
    m.relate(m.node('ext', { type: 'service' }), box, { kind: 'sync' });
    const view = compileView(m.toJSON(), { focus: ['box'] });
    const { geometry } = await layoutView(view);
    const g = geometry.get('box')!;
    const inside = kids.map((k) => geometry.get(k.id)!);
    expect(new Set(inside.map((k) => k.x)).size).toBeGreaterThan(1); // more than one column
    for (const k of inside) {
      expect(k.x).toBeGreaterThanOrEqual(16);
      expect(k.y).toBeGreaterThanOrEqual(36); // below the title band
      expect(k.x + k.width).toBeLessThanOrEqual(g.width - 16 + 0.5);
      expect(k.y + k.height).toBeLessThanOrEqual(g.height - 16 + 0.5);
    }
    // the edge to the container itself still places it after its source
    expect(geometry.get('ext')!.y).toBeLessThan(g.y);
  });

  it('packs the loose children of a container beside its connected part, inside its walls', async () => {
    const m = model('open');
    const n = (id: string) => m.node(id, { type: 'service' });
    const [a, b] = ['a', 'b'].map(n);
    // a dozen: a short run stays one column in a left-to-right flow (it shares
    // the first layer), a long one has to fold
    const loose = Array.from({ length: 12 }, (_, i) => n(`l${i}`));
    const box = m.node('box', { type: 'system' });
    box.contains(a!, b!, ...loose);
    m.relate(n('ext'), a!, { kind: 'sync' }); // crosses the wall: the container stays in the run
    m.relate(a!, b!, { kind: 'sync' });
    const view = compileView(m.toJSON(), { focus: ['box'] });
    const { geometry } = await layoutView(view);
    // nothing synthetic leaks out, nothing real is lost
    expect([...geometry.keys()].sort()).toEqual(['a', 'b', 'box', 'ext', ...loose.map((l) => l.id)].sort());
    const at = absolute(view, geometry);
    const box_ = at.get('box')!;
    const inside = ['a', 'b', ...loose.map((l) => l.id)].map((id) => at.get(id)!);
    inside.forEach((r, i) => {
      expect(r.x).toBeGreaterThanOrEqual(box_.x);
      expect(r.y).toBeGreaterThanOrEqual(box_.y + 36);
      expect(r.x + r.width).toBeLessThanOrEqual(box_.x + box_.width + 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(box_.y + box_.height + 0.5);
      inside.slice(i + 1).forEach((o) => expect(overlap(r, o)).toBe(false));
    });
    expect(new Set(loose.map((l) => at.get(l.id)!.x)).size).toBeGreaterThan(1);
  });

  it('stretches a packed block ALONG the layer it shares, not across the flow', async () => {
    // Inside a connected container the block sits in a layer beside other nodes:
    // extent along that layer is nearly free, extent across it pushes every
    // later layer away. So it runs down the column for RIGHT, along the row for DOWN.
    const build = () => {
      const m = model('biased');
      const n = (id: string) => m.node(id, { type: 'service' });
      const [a, b] = ['a', 'b'].map(n);
      const loose = ['l0', 'l1', 'l2', 'l3'].map(n);
      m.node('box', { type: 'system' }).contains(a!, b!, ...loose);
      m.relate(n('ext'), a!, { kind: 'sync' });
      m.relate(a!, b!, { kind: 'sync' });
      return compileView(m.toJSON(), { focus: ['box'] });
    };
    const icon = new Map(['l0', 'l1', 'l2', 'l3'].map((id) => [id, { width: 100, height: 84 }] as const));
    const right = await layoutView(build(), icon, { direction: 'RIGHT' });
    expect(new Set(['l0', 'l1', 'l2', 'l3'].map((id) => right.geometry.get(id)!.x)).size).toBe(1);
    const down = await layoutView(build(), icon, { direction: 'DOWN' });
    expect(new Set(['l0', 'l1', 'l2', 'l3'].map((id) => down.geometry.get(id)!.y)).size).toBe(1);
  });

  it('moves a route along with the part it belongs to', async () => {
    const m = model('routes');
    const n = (id: string) => m.node(id, { type: 'service' });
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(n);
    const r1 = m.relate(a!, b!, { kind: 'sync' });
    const r2 = m.relate(c!, d!, { kind: 'sync' });
    void [r1, r2];
    const view = compileView(m.toJSON(), {});
    const { geometry, routes } = await layoutView(view, undefined, { direction: 'RIGHT' });
    expect(routes.size).toBe(2);
    const at = absolute(view, geometry);
    for (const e of view.layoutEdges) {
      const pts = routes.get(e.id)!;
      const src = at.get(e.from)!;
      const tgt = at.get(e.to)!;
      // starts on the source's right edge, ends on the target's left edge
      expect(pts[0]!.x).toBeCloseTo(src.x + src.width, 0);
      expect(pts[0]!.y).toBeGreaterThanOrEqual(src.y);
      expect(pts[0]!.y).toBeLessThanOrEqual(src.y + src.height);
      expect(pts[pts.length - 1]!.x).toBeCloseTo(tgt.x, 0);
    }
  });

  it('leaves a non-layered algorithm to its own component packing', async () => {
    const m = model('force');
    for (let i = 0; i < 6; i++) m.node(`n${i}`, { type: 'service' });
    const { algorithm, geometry } = await layoutView(compileView(m.toJSON(), {}), undefined, { algorithm: 'force' });
    expect(algorithm).toBe('force');
    expect(geometry.size).toBe(6);
  });
});
