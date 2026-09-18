import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTATIONS, type DiagramModel, type DiagramNode, type DiagramRelation } from './types';
import { consequenceOrders, consequenceTypeOf, isSecondOrderNode, valenceOf } from './second-order';

const node = (id: string, type?: string): DiagramNode => ({ id, name: id, ...(type !== undefined ? { type } : {}) });
const d = (id: string) => node(id, 'so-decision');
const c = (id: string, v: '+' | '-' | '0' = '0') => node(id, consequenceTypeOf(v));
const rel = (from: string, to: string, n = 0): DiagramRelation => ({ id: `${from}->${to}#${n}`, from, to, kind: 'leads-to' });
const model = (nodes: DiagramNode[], relations: DiagramRelation[]): DiagramModel => ({
  version: 1, id: 'm', name: 'm', nodes, containment: [], relations, layers: [], planes: [],
});
const ordersOf = (m: DiagramModel) => Object.fromEntries(consequenceOrders(m).orders);

describe('second-order vocabulary', () => {
  it('registers the notation id', () => {
    expect(BUILTIN_NOTATIONS).toContain('second-order');
  });
  it('maps valence to a consequence type and back', () => {
    expect(consequenceTypeOf('+')).toBe('so-consequence-positive');
    expect(consequenceTypeOf('-')).toBe('so-consequence-negative');
    expect(consequenceTypeOf('0')).toBe('so-consequence-neutral');
    expect(valenceOf('so-consequence-negative')).toBe('-');
    expect(valenceOf('so-decision')).toBeUndefined();
    expect(isSecondOrderNode(d('x'))).toBe(true);
    expect(isSecondOrderNode(node('x', 'service'))).toBe(false);
  });
});

describe('consequenceOrders', () => {
  it('numbers a tree by depth from the decision', () => {
    const m = model([d('d'), c('a'), c('b'), c('a1')], [rel('d', 'a'), rel('d', 'b'), rel('a', 'a1')]);
    expect(ordersOf(m)).toEqual({ d: 0, a: 1, b: 1, a1: 2 });
    expect(consequenceOrders(m).unreachable).toEqual([]);
    expect(consequenceOrders(m).cycle).toBeUndefined();
  });

  it('puts a consequence reached twice in the LATER band — every cause sits above its effect', () => {
    // x follows from a (1st order) directly AND from a1 (2nd order): it is 3rd order
    const m = model([d('d'), c('a'), c('a1'), c('x')], [rel('d', 'a'), rel('a', 'a1'), rel('a', 'x'), rel('a1', 'x')]);
    expect(ordersOf(m)).toEqual({ d: 0, a: 1, a1: 2, x: 3 });
  });

  it('shares one numbering across several decisions', () => {
    const m = model([d('d1'), d('d2'), c('p'), c('q')], [rel('d1', 'p'), rel('d2', 'q'), rel('p', 'q')]);
    expect(ordersOf(m)).toEqual({ d1: 0, d2: 0, p: 1, q: 2 });
  });

  it('places a follow-up decision in the band where it arises', () => {
    const m = model([d('d'), c('a'), d('then')], [rel('d', 'a'), rel('a', 'then')]);
    expect(ordersOf(m)).toEqual({ d: 0, a: 1, then: 2 });
  });

  it('reports a consequence no decision leads to, and everything only it feeds', () => {
    const m = model([d('d'), c('a'), c('orphan'), c('child')], [rel('d', 'a'), rel('orphan', 'child')]);
    const out = consequenceOrders(m);
    expect(Object.fromEntries(out.orders)).toEqual({ d: 0, a: 1 });
    expect(out.unreachable).toEqual(['orphan', 'child']);
  });

  it('reports a cycle instead of numbering anything', () => {
    const m = model([d('d'), c('a'), c('b'), c('tail')], [rel('d', 'a'), rel('a', 'b'), rel('b', 'a'), rel('b', 'tail')]);
    const out = consequenceOrders(m);
    expect(out.orders.size).toBe(0);
    expect(out.cycle).toEqual(['a', 'b']); // `tail` hangs off the loop, it is not on it
  });

  it('ignores other nodes, self-links and counts parallel arrows once', () => {
    const m = model(
      [d('d'), c('a'), node('note', 'comment')],
      [rel('d', 'a'), rel('d', 'a', 1), rel('a', 'a'), { id: 'n', from: 'note', to: 'a', kind: 'note-link' }],
    );
    expect(ordersOf(m)).toEqual({ d: 0, a: 1 });
    expect(consequenceOrders(m).cycle).toBeUndefined();
  });

  it('does not care which kind the arrow is', () => {
    const m = model([d('d'), c('a')], [{ id: 'r', from: 'd', to: 'a', kind: 'flow' }]);
    expect(ordersOf(m)).toEqual({ d: 0, a: 1 });
  });
});
