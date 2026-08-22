import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { buildHierarchy } from './hierarchy';
import { buildViewTree } from './tree';
import { resolveEdges } from './edges';
import type { DiagramModel } from '../types';
import type { LodState } from './types';

function fixture(): DiagramModel {
  const m = model('t');
  m.layer('infra', { name: 'Infra', tint: '#123456' });
  const A = m.node('A', { type: 'system' });
  const B = m.node('B', { type: 'system' });
  const a1 = m.node('a1', { type: 'service' });
  const a2 = m.node('a2', { type: 'service' });
  const b1 = m.node('b1', { type: 'service' });
  const k8s = m.node('k8s', { type: 'infra' });
  A.contains(a1, a2);
  B.contains(b1);
  m.relate(a1, b1, { kind: 'reads' });
  m.relate(a2, b1, { kind: 'writes', label: 'bulk' });
  m.relate(a1, a2, { kind: 'sync' }); // internal to A
  m.relate(a1, a1, { kind: 'retries' }); // self-loop on hidden node
  m.relate(b1, b1, { kind: 'retries' }); // self-loop on visible node (B expanded)
  m.relate(a1, k8s, { kind: 'hosted-on', layer: 'infra' });
  m.relate(a2, k8s, { kind: 'hosted-on', layer: 'infra' });
  return m.toJSON();
}

function edgesAt(lod: LodState, layers?: string[]) {
  const j = fixture();
  const h = buildHierarchy(j);
  return resolveEdges(j, buildViewTree(j, h, lod), layers);
}

describe('resolveEdges', () => {
  it('passes through edges between visible nodes untouched', () => {
    const edges = edgesAt({ A: 'expanded', B: 'expanded' });
    expect(edges.map((e) => e.id)).toEqual(['a1=>b1:', 'a2=>b1:', 'a1=>a2:', 'a1=>a1:', 'b1=>b1:']);
    expect(edges[0]).toMatchObject({ kind: 'reads', constituents: [expect.objectContaining({ id: 'a1->b1#0' })] });
  });

  it('re-anchors and aggregates across a collapsed boundary with mixed kinds', () => {
    const edges = edgesAt({ A: 'collapsed', B: 'expanded' });
    expect(edges).toHaveLength(2); // A=>b1 aggregated + b1 self-loop
    expect(edges[0]).toMatchObject({ id: 'A=>b1:', from: 'A', to: 'b1', kind: 'mixed', label: 'bulk' });
    expect(edges[0]?.constituents.map((r) => r.kind)).toEqual(['reads', 'writes']);
  });

  it('drops internalized edges and hidden self-loops, keeps visible self-loops', () => {
    const edges = edgesAt({ A: 'collapsed', B: 'collapsed' });
    // a1->a2 internal, a1->a1 hidden self-loop: dropped. A=>B aggregated. b1 self-loop hidden: dropped.
    expect(edges.map((e) => e.id)).toEqual(['A=>B:']);
    const expanded = edgesAt({ A: 'expanded', B: 'expanded' });
    expect(expanded.map((e) => e.id)).toContain('b1=>b1:');
  });

  it('single-constituent aggregate keeps its own label', () => {
    const edges = edgesAt({ A: 'collapsed', B: 'collapsed' });
    expect(edges[0]).toMatchObject({ kind: 'mixed', label: 'bulk' });
    const one = edgesAt({ A: 'expanded', B: 'collapsed' });
    expect(one.find((e) => e.id === 'a2=>B:')).toMatchObject({
      kind: 'writes',
      labels: [{ id: 'legacy', text: 'bulk', t: 0.5, side: 'center' }],
    });
  });

  it("carries a sole constituent's style and drops it on aggregated edges", () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const c = m.node('c', { type: 'service' });
    m.relate(a, c, { kind: 'reads', style: { shape: 'straight', color: '#f00' } });
    m.relate(a, b, { kind: 'reads', style: { shape: 'step' } });
    m.relate(a, b, { kind: 'writes' }); // second a=>b relation -> aggregation
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    expect(edges.find((e) => e.id === 'a=>c:')?.style).toEqual({ shape: 'straight', color: '#f00' });
    expect(edges.find((e) => e.id === 'a=>b:')?.style).toBeUndefined();
  });

  it("carries a sole constituent's labels and drops them on aggregated edges", () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const c = m.node('c', { type: 'service' });
    m.relate(a, c, { kind: 'reads' });
    m.relate(a, b, { kind: 'reads' });
    m.relate(a, b, { kind: 'writes' }); // second a=>b relation -> aggregation
    const j = m.toJSON();
    const labels = [{ id: 'l1', text: 'hi', t: 0.5, side: 'center' as const }];
    const withLabels: DiagramModel = {
      ...j,
      relations: j.relations.map((r) => (r.id === 'a->c#0' ? { ...r, labels } : r)),
    };
    const edges = resolveEdges(withLabels, buildViewTree(withLabels, buildHierarchy(withLabels), {}));
    expect(edges.find((e) => e.id === 'a=>c:')?.labels).toEqual(labels);
    const aggregated = edges.find((e) => e.id === 'a=>b:');
    expect(aggregated?.labels).toBeUndefined();
    expect(aggregated?.label).toBe('2 relations'); // count indicator unchanged
  });

  it("carries a sole constituent's polarity and delay, drops them on aggregated edges", () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const c = m.node('c', { type: 'service' });
    m.relate(a, c, { kind: 'reads', polarity: '+', delay: true });
    m.relate(a, b, { kind: 'reads', polarity: '-' });
    m.relate(a, b, { kind: 'writes' }); // second a=>b relation -> aggregation
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    expect(edges.find((e) => e.id === 'a=>c:')).toMatchObject({ polarity: '+', delay: true });
    const aggregated = edges.find((e) => e.id === 'a=>b:');
    expect(aggregated?.polarity).toBeUndefined();
    expect(aggregated?.delay).toBeUndefined();
  });

  it('gives an aggregated edge the combined polarity when every constituent agrees', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'reads', polarity: '+' });
    m.relate(a, b, { kind: 'writes', polarity: '+' }); // 2 relations, both '+'
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    const aggregated = edges.find((e) => e.id === 'a=>b:');
    expect(aggregated?.constituents).toHaveLength(2);
    expect(aggregated?.polarity).toBe('+');
    expect(aggregated?.label).toBe('2 relations'); // count still shown
  });

  it('leaves an aggregated edge polarity-less when constituents disagree', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'reads', polarity: '+' });
    m.relate(a, b, { kind: 'writes', polarity: '-' });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    expect(edges.find((e) => e.id === 'a=>b:')?.polarity).toBeUndefined();
  });

  it('keeps same-direction relations pinned to different connection points separate', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    // two arrows a->b attached at different border sides — visually distinct, so
    // they must not collapse into one aggregated edge (which would also drop the pins)
    m.relate(a, b, { kind: 'reads', style: { fromSide: 'top', toSide: 'left' } });
    m.relate(a, b, { kind: 'reads', style: { fromSide: 'right', toSide: 'bottom' } });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    const ab = edges.filter((e) => e.from === 'a' && e.to === 'b');
    expect(ab).toHaveLength(2);
    // each stays a sole-constituent edge that keeps its own pinned side
    expect(ab.every((e) => e.constituents.length === 1)).toBe(true);
    expect(ab.map((e) => e.style?.fromSide).sort()).toEqual(['right', 'top']);
  });

  it('still aggregates same-direction relations that share connection points (or float)', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'reads' });
    m.relate(a, b, { kind: 'writes' });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    const ab = edges.filter((e) => e.from === 'a' && e.to === 'b');
    expect(ab).toHaveLength(1);
    expect(ab[0]).toMatchObject({ label: '2 relations', kind: 'mixed' });
  });

  it('shows joined distinct labels for a multi-relation aggregate instead of a count', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'reads', label: 'reads' });
    m.relate(a, b, { kind: 'writes', label: 'writes' });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    const agg = edges.find((e) => e.id === 'a=>b:');
    expect(agg?.constituents).toHaveLength(2);
    expect(agg?.label).toBe('reads / writes');
    expect(agg?.labels).toBeUndefined();
  });

  it('shows joined labels for relations rolled up to a collapsed container (the reported case)', () => {
    const m = model('s');
    const ctrl = m.node('ctrl', { type: 'service' });
    const db = m.node('db', { name: 'Postgres', type: 'database' });
    const orders = m.node('orders', { type: 'table' });
    const payments = m.node('payments', { type: 'table' });
    db.contains(orders, payments);
    m.relate(ctrl, orders, { kind: 'reads', label: 'reads' });
    m.relate(ctrl, payments, { kind: 'writes', label: 'writes' });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), { db: 'collapsed' }));
    const agg = edges.find((e) => e.id === 'ctrl=>db:');
    expect(agg?.constituents).toHaveLength(2);
    expect(agg?.label).toBe('reads / writes');
  });

  it('dedups identical labels across an aggregate', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'reads', label: 'reads' });
    m.relate(a, b, { kind: 'reads', label: 'reads' });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    expect(edges.find((e) => e.id === 'a=>b:')?.label).toBe('reads');
  });

  // The budget is the JOINED LENGTH, not a label count: what makes a folded
  // platform view unreadable is text width on hundreds of edges, and three labels
  // of twenty characters are far worse than five of three. Above the budget the
  // edge reports how many relations it rolled up instead — the reader can open
  // the fold, or click the edge, to see which.
  const joinOf = (labels: string[]) => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    for (const t of labels) m.relate(a, b, { kind: 'sync', label: t });
    const j = m.toJSON();
    return resolveEdges(j, buildViewTree(j, buildHierarchy(j), {})).find((e) => e.id === 'a=>b:')?.label;
  };

  it('keeps a join that fits the width budget, however many labels it took', () => {
    expect(joinOf(['l1', 'l2', 'l3', 'l4'])).toBe('l1 / l2 / l3 / l4'); // 17 chars
  });

  it('collapses a join over the budget to a relation count', () => {
    // 4 x 'publishes survey.created' style labels: the old policy printed the
    // first three joined plus '+1' — ~70 characters on one arrow, times hundreds.
    expect(joinOf(['publishes survey.created', 'consumes survey.closed', 'publishes reminder.due', 'x'])).toBe('4 relations');
  });

  it('keeps a single distinct label whatever its length (the renderer truncates)', () => {
    // One label is the edge's own meaning, not a pile-up: replacing it with a
    // count would lose information the reader cannot recover by folding.
    const long = 'publishes employee.tenure.recalculated to the mesh';
    expect(joinOf([long, long, long])).toBe(long);
  });

  it('takes the budget as an inclusive bound', () => {
    // Two labels joined by ' / ' — three characters of separator — so a pair
    // totalling `n` visible characters is 'a'.repeat(n - 17) plus 14 'b's.
    const pair = (total: number) => ['a'.repeat(total - 17), 'b'.repeat(14)];
    expect(pair(32).join(' / ')).toHaveLength(32); // the fixture's own arithmetic
    expect(joinOf(pair(32))).toBe(pair(32).join(' / '));
    expect(joinOf(pair(33))).toBe('2 relations');
  });

  it('falls back to the count when an aggregate has no labels', () => {
    const m = model('s');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'reads' });
    m.relate(a, b, { kind: 'writes' });
    const j = m.toJSON();
    const edges = resolveEdges(j, buildViewTree(j, buildHierarchy(j), {}));
    expect(edges.find((e) => e.id === 'a=>b:')?.label).toBe('2 relations');
  });

  it('filters by active layers and carries the tint', () => {
    expect(edgesAt({ A: 'collapsed', B: 'collapsed' }).some((e) => e.layer === 'infra')).toBe(false);
    const withLayer = edgesAt({ A: 'collapsed', B: 'collapsed' }, ['infra']);
    const infra = withLayer.find((e) => e.layer === 'infra');
    expect(infra).toMatchObject({ id: 'A=>k8s:infra', kind: 'hosted-on', label: '2 relations', tint: '#123456' });
  });
});

describe('resolveEdges: layerRules', () => {
  function ruled(): DiagramModel {
    const m = model('r');
    m.layer('http', { name: 'HTTP', tint: '#ef6c00' });
    m.layer('sql', { name: 'SQL', tint: '#2e7d32' });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const db = m.node('db', { type: 'database' });
    m.relate(a, b, { kind: 'https', style: { color: '#ef6c00' } }); // by colour -> http
    m.relate(a, db, { kind: 'sql' }); // by kind -> sql
    m.relate(b, db, { kind: 'uses', style: { color: '#2e7d32' } }); // by colour -> sql
    m.relate(b, a, { kind: 'uses' }); // matches nothing -> base
    m.relate(a, db, { kind: 'sql', layer: 'http' }); // explicit layer wins over the rule
    m.layerRules([
      { color: '#ef6c00', layer: 'http' },
      { kind: 'sql', layer: 'sql' },
      { color: '#2e7d32', layer: 'sql' },
    ]);
    return m.toJSON();
  }
  const at = (layers?: string[], includeBase = true) => {
    const j = ruled();
    const h = buildHierarchy(j);
    return resolveEdges(j, buildViewTree(j, h, {}), layers, includeBase);
  };

  it('assigns a layer to unlayered relations by colour or kind, first match wins', () => {
    const ids = at(['http']).map((e) => e.id);
    expect(ids).toContain('a=>b:http'); // colour rule
    expect(ids).toContain('b=>a:'); // base, still drawn
    expect(ids).not.toContain('a=>db:sql'); // sql layer off
    expect(ids).not.toContain('b=>db:sql');
    const sql = at(['sql']).map((e) => e.id);
    expect(sql).toContain('a=>db:sql'); // kind rule
    expect(sql).toContain('b=>db:sql'); // colour rule on a `uses`
  });

  it('lets an explicit layer beat the rules', () => {
    const e = at(['http']).find((x) => x.id === 'a=>db:http');
    expect(e).toBeDefined();
    expect(e?.constituents).toHaveLength(1);
  });

  it('with base off and one layer on, draws exactly that class', () => {
    const ids = at(['sql'], false).map((e) => e.id);
    expect(ids.sort()).toEqual(['a=>db:sql', 'b=>db:sql']);
  });

  it('is a no-op without rules', () => {
    const j = ruled();
    delete j.layerRules;
    const h = buildHierarchy(j);
    const ids = resolveEdges(j, buildViewTree(j, h, {}), ['http']).map((e) => e.id);
    expect(ids.sort()).toEqual(['a=>b:', 'a=>db:', 'a=>db:http', 'b=>a:', 'b=>db:'].sort());
  });
});
