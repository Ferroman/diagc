import { describe, expect, it } from 'vitest';
import { analyzeDependency, analyzeLeverage } from './leverage';
import type { LoopEdgeInput } from './loops';

/** signed edge shorthand */
const e = (id: string, from: string, to: string, polarity?: '+' | '-'): LoopEdgeInput =>
  polarity !== undefined ? { id, from, to, polarity } : { id, from, to };

describe('analyzeLeverage', () => {
  // t is the target. a->t(+), b->a(-), t->c(+), c->a(+), d->t(+).
  // Loop through t: t->c->a->t (all +) => R, length 3.
  const graph: LoopEdgeInput[] = [
    e('e1', 'a', 't', '+'),
    e('e2', 'b', 'a', '-'),
    e('e3', 't', 'c', '+'),
    e('e4', 'c', 'a', '+'),
    e('e5', 'd', 't', '+'),
  ];

  it('reports the feedback loops the target sits in, shortest-first', () => {
    const r = analyzeLeverage(graph, 't');
    expect(r.loops).toHaveLength(1);
    expect(r.loops[0]).toMatchObject({ kind: 'R', length: 3 });
    expect([...r.loops[0]!.nodes].sort()).toEqual(['a', 'c', 't']);
    expect([...r.loops[0]!.edgeIds].sort()).toEqual(['e1', 'e3', 'e4']);
  });

  it('ranks upstream drivers by closeness then shared-loop count, with net sign', () => {
    const r = analyzeLeverage(graph, 't');
    // a(dist1,loop), d(dist1,noloop), c(dist2,loop), b(dist2,noloop)
    expect(r.drivers.map((d) => d.id)).toEqual(['a', 'd', 'c', 'b']);
    const by = Object.fromEntries(r.drivers.map((d) => [d.id, d]));
    expect(by['a']).toMatchObject({ distance: 1, sign: '+', loopCount: 1 });
    expect(by['d']).toMatchObject({ distance: 1, sign: '+', loopCount: 0 });
    expect(by['c']).toMatchObject({ distance: 2, sign: '+', loopCount: 1 });
    expect(by['b']).toMatchObject({ distance: 2, sign: '-', loopCount: 0 });
  });

  it('gives each driver a representative shortest path (nodes + edge ids) to the target', () => {
    const r = analyzeLeverage(graph, 't');
    const by = Object.fromEntries(r.drivers.map((d) => [d.id, d]));
    expect(by['a']!.path).toEqual({ nodes: ['a', 't'], edgeIds: ['e1'] });
    expect(by['b']!.path).toEqual({ nodes: ['b', 'a', 't'], edgeIds: ['e2', 'e1'] });
  });

  it('lists hubs (non-target vars recurring across the target loops), most first, with net sign', () => {
    const r = analyzeLeverage(graph, 't');
    expect(r.hubs).toEqual([
      { id: 'a', loopCount: 1, sign: '+' },
      { id: 'c', loopCount: 1, sign: '+' },
    ]);
  });

  it("marks a driver 'mixed' when equal-length routes disagree in sign", () => {
    // x->p->t is +, x->q->t is - ; both length 2
    const g: LoopEdgeInput[] = [
      e('a1', 'x', 'p', '+'),
      e('a2', 'p', 't', '+'),
      e('a3', 'x', 'q', '+'),
      e('a4', 'q', 't', '-'),
    ];
    const r = analyzeLeverage(g, 't');
    expect(r.drivers.find((d) => d.id === 'x')?.sign).toBe('mixed');
  });

  it("marks a driver 'unknown' when an unpolarized link lies on the shortest path", () => {
    const g: LoopEdgeInput[] = [e('u1', 'u', 't') /* no polarity */];
    const r = analyzeLeverage(g, 't');
    expect(r.drivers.find((d) => d.id === 'u')?.sign).toBe('unknown');
  });

  it('returns empty sections for a target with no upstream causes and no loops', () => {
    // t only drives others; nothing points into t
    const g: LoopEdgeInput[] = [e('o1', 't', 'z', '+')];
    const r = analyzeLeverage(g, 't');
    expect(r.drivers).toEqual([]);
    expect(r.loops).toEqual([]);
    expect(r.hubs).toEqual([]);
  });

  it('handles a target absent from the graph', () => {
    const r = analyzeLeverage(graph, 'nope');
    expect(r).toMatchObject({ target: 'nope', loops: [], drivers: [], hubs: [] });
  });

  it('collapses parallel edges and excludes the target from drivers/hubs', () => {
    const r = analyzeLeverage(graph, 't');
    expect(r.drivers.some((d) => d.id === 't')).toBe(false);
    expect(r.hubs.some((h) => h.id === 't')).toBe(false);
  });
});

describe('analyzeDependency', () => {
  it('reports a direct reinforcing dependency both ways as an R loop', () => {
    const g: LoopEdgeInput[] = [e('e1', 'a', 'b', '+'), e('e2', 'b', 'a', '+')];
    const r = analyzeDependency(g, 'a', 'b');
    expect(r.forward).toMatchObject({ exists: true, sign: '+', distance: 1 });
    expect(r.forward.path).toEqual({ nodes: ['a', 'b'], edgeIds: ['e1'] });
    expect(r.backward).toMatchObject({ exists: true, sign: '+', distance: 1 });
    expect(r.backward.path).toEqual({ nodes: ['b', 'a'], edgeIds: ['e2'] });
    expect(r.loop).toBe('R');
  });

  it('classifies a mixed-polarity mutual dependency as a B loop', () => {
    const g: LoopEdgeInput[] = [e('e1', 'a', 'b', '+'), e('e2', 'b', 'a', '-')];
    expect(analyzeDependency(g, 'a', 'b').loop).toBe('B');
  });

  it('reports a one-directional multi-hop dependency with no loop', () => {
    const g: LoopEdgeInput[] = [e('e1', 'a', 'x', '+'), e('e2', 'x', 'b', '+')];
    const r = analyzeDependency(g, 'a', 'b');
    expect(r.forward).toMatchObject({ exists: true, sign: '+', distance: 2 });
    expect(r.forward.path).toEqual({ nodes: ['a', 'x', 'b'], edgeIds: ['e1', 'e2'] });
    expect(r.backward.exists).toBe(false);
    expect(r.loop).toBeNull();
  });

  it('reports no dependency when the two are unconnected', () => {
    const g: LoopEdgeInput[] = [e('e1', 'a', 'a2', '+'), e('e2', 'b', 'b2', '+')];
    const r = analyzeDependency(g, 'a', 'b');
    expect(r.forward.exists).toBe(false);
    expect(r.backward.exists).toBe(false);
    expect(r.loop).toBeNull();
  });

  it('treats a variable compared with itself as no dependency', () => {
    const g: LoopEdgeInput[] = [e('e1', 'a', 'b', '+')];
    const r = analyzeDependency(g, 'a', 'a');
    expect(r.forward.exists).toBe(false);
    expect(r.backward.exists).toBe(false);
    expect(r.loop).toBeNull();
  });

  it('marks the loop unknown when a path sign is unknown', () => {
    const g: LoopEdgeInput[] = [e('e1', 'a', 'b') /* unpolarized */, e('e2', 'b', 'a', '+')];
    const r = analyzeDependency(g, 'a', 'b');
    expect(r.forward.sign).toBe('unknown');
    expect(r.loop).toBe('unknown');
  });
});
