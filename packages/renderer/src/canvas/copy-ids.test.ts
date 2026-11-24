import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { boxOf, copiesOf, laneRows, modelIdOf, modelMoves, pinRows, widenToCopies } from './copy-ids';

const copies = new Map([
  ['pay:checkout', 'checkout'],
  ['plat:checkout', 'checkout'],
  ['plat:ui', 'ui'],
  ['plat:dep', 'dep'],
]);

describe('modelIdOf', () => {
  it('maps a copy to the id it copies', () => expect(modelIdOf(copies, 'plat:ui')).toBe('ui'));
  it('an id that is no copy is its own', () => expect(modelIdOf(copies, 'alice')).toBe('alice'));
  it('ungrouped, every id is its own', () => expect(modelIdOf(undefined, 'checkout')).toBe('checkout'));
});

describe('copiesOf', () => {
  it('every copy of a model id, in the order they were made', () =>
    expect(copiesOf(copies, 'checkout')).toEqual(['pay:checkout', 'plat:checkout']));
  it('the model id itself when it has no copies', () => expect(copiesOf(copies, 'alice')).toEqual(['alice']));
  it('ungrouped, the id itself', () => expect(copiesOf(undefined, 'checkout')).toEqual(['checkout']));
  it('a map built anew answers for itself, not from a stale one', () => {
    expect(copiesOf(new Map([['a:x', 'x']]), 'x')).toEqual(['a:x']);
    expect(copiesOf(new Map([['b:x', 'x']]), 'x')).toEqual(['b:x']);
  });
});

describe('widenToCopies', () => {
  it('each id stands, with every copy of it beside', () =>
    expect(widenToCopies(copies, ['checkout', 'alice'])).toEqual(
      new Set(['checkout', 'pay:checkout', 'plat:checkout', 'alice']),
    ));
  it('ungrouped, the same ids', () => expect(widenToCopies(undefined, ['a'])).toEqual(new Set(['a'])));
});

describe('boxOf', () => {
  const nodes = [
    { id: 'alice', position: { x: 0, y: 0 }, data: {} },
    { id: 'pay:checkout', position: { x: 0, y: 0 }, data: { modelId: 'checkout' } },
    { id: 'plat:checkout', position: { x: 0, y: 0 }, data: { modelId: 'checkout' } },
  ];
  it('the node of that id', () => expect(boxOf(nodes, 'alice')).toBe('alice'));
  it('else its first copy', () => expect(boxOf(nodes, 'checkout')).toBe('pay:checkout'));
  it('else nothing yet', () => expect(boxOf(nodes, 'new')).toBeUndefined());
});

describe('laneRows', () => {
  it("the lanes' top-level copies", () =>
    expect(
      laneRows({ lanes: [{ zones: ['pay:checkout'] }, { zones: ['plat:checkout', 'plat:dep'] }] as never }),
    ).toEqual(new Set(['pay:checkout', 'plat:checkout', 'plat:dep'])));
  it('ungrouped, none', () => expect(laneRows({}).size).toBe(0));
});

describe('modelMoves', () => {
  const rows = new Set(['pay:checkout', 'plat:checkout', 'plat:dep']);

  it('ungrouped, the same report back', () => {
    const positions = { a: { x: 1, y: 2 } };
    const deltas = { a: { dx: 1, dy: 2 } };
    expect(modelMoves(undefined, new Set(), positions, deltas)).toEqual({ positions, deltas });
  });

  it('a row copy keeps its days and loses its position: its lane y is no row of the zone', () => {
    const out = modelMoves(
      copies,
      rows,
      { 'pay:checkout': { x: 140, y: 300 } },
      { 'pay:checkout': { dx: 140, dy: 12 } },
    );
    expect(out).toEqual({ positions: {}, deltas: { checkout: { dx: 140, dy: 0 } } });
  });

  it('a copy inside a row reports its own place, under its model id', () => {
    const out = modelMoves(copies, rows, { 'plat:ui': { x: 20, y: 30 } }, { 'plat:ui': { dx: 20, dy: 0 } });
    expect(out).toEqual({ positions: { ui: { x: 20, y: 30 } }, deltas: { ui: { dx: 20, dy: 0 } } });
  });

  it('two copies of one zone moved together are one move, the first copy’s', () => {
    const out = modelMoves(
      copies,
      rows,
      {},
      { 'pay:checkout': { dx: 40, dy: 0 }, 'plat:checkout': { dx: 40, dy: 5 }, 'plat:dep': { dx: 40, dy: 0 } },
    );
    expect(out.deltas).toEqual({ checkout: { dx: 40, dy: 0 }, dep: { dx: 40, dy: 0 } });
  });
});

describe('pinRows', () => {
  const node = (id: string, y: number, extra: Partial<Node> = {}): Node => ({
    id,
    position: { x: 0, y },
    data: {},
    ...extra,
  });
  const nodes = [node('pay:checkout', 100), node('plat:ui', 10, { parentId: 'plat:checkout' }), node('free', 50)];
  const rows = new Set(['pay:checkout']);

  it('a row keeps its y, whatever the move says; anything else moves as asked', () =>
    expect(
      pinRows({ 'pay:checkout': { x: 40, y: 180 }, 'plat:ui': { x: 5, y: 70 }, free: { x: 1, y: 2 } }, nodes, rows),
    ).toEqual({ 'pay:checkout': { x: 40, y: 100 }, 'plat:ui': { x: 5, y: 70 }, free: { x: 1, y: 2 } }));

  it('no rows, the same moves back', () => {
    const moves = { free: { x: 1, y: 2 } };
    expect(pinRows(moves, nodes, new Set())).toBe(moves);
  });
});
