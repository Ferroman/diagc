import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import type { DiagramNode, ViewNode } from '@diagc/core/internal';
import {
  boxOf,
  copiesOf,
  dropTargetOf,
  modelIdOf,
  modelMoves,
  pinnedRows,
  pinRows,
  unsavedIds,
  widenToCopies,
} from './copy-ids';

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

describe('pinnedRows', () => {
  it('the rows the view pins (planView: lane copies, or every top-level zone while hiding)', () =>
    expect(pinnedRows({ pinnedRows: ['pay:checkout', 'plat:checkout', 'plat:dep'] })).toEqual(
      new Set(['pay:checkout', 'plat:checkout', 'plat:dep']),
    ));
  it('none pinned, none', () => expect(pinnedRows({}).size).toBe(0));
});

const leaf = (id: string, type?: string): ViewNode =>
  ({ id, node: { id, name: id, ...(type !== undefined ? { type } : {}) }, children: [], state: 'leaf' }) as never;
const viewOnly = (n: DiagramNode) => n.type === 'lane' || n.type === 'card';
const scene = {
  roots: [leaf('pay:', 'lane'), leaf('pay:checkout'), leaf('card', 'card'), leaf('alice')],
  copies,
  pinnedRows: ['pay:checkout'],
  externals: new Map([['__ext__:x', 'x']]),
};

describe('dropTargetOf', () => {
  it('a copy is the zone it copies', () => expect(dropTargetOf(scene, viewOnly, 'plat:ui')).toBe('ui'));
  it('a node the view draws for itself is no target', () => {
    expect(dropTargetOf(scene, viewOnly, 'pay:')).toBeUndefined();
    expect(dropTargetOf(scene, viewOnly, 'card')).toBeUndefined();
  });
  it('a note is no target, and open canvas is none', () => {
    expect(dropTargetOf(scene, viewOnly, 'note:n1')).toBeUndefined();
    expect(dropTargetOf(scene, viewOnly, undefined)).toBeUndefined();
  });
  it('any other node is itself', () => expect(dropTargetOf(scene, viewOnly, 'alice')).toBe('alice'));
});

describe('unsavedIds', () => {
  it('drill stubs, notes, view-only nodes and pinned rows are never saved', () => {
    const skip = unsavedIds(scene, viewOnly);
    for (const id of ['__ext__:x', 'note:n1', 'pay:', 'card', 'pay:checkout']) expect(skip(id)).toBe(true);
    for (const id of ['plat:ui', 'alice']) expect(skip(id)).toBe(false);
  });
});

describe('modelMoves while hiding (ungrouped, rows pinned)', () => {
  it('a pinned row keeps its days and loses its position; anything else reports as ever', () => {
    const out = modelMoves(
      undefined,
      new Set(['checkout']),
      { checkout: { x: 140, y: 300 }, stray: { x: 1, y: 2 } },
      { checkout: { dx: 140, dy: 12 }, stray: { dx: 1, dy: 2 } },
    );
    expect(out).toEqual({
      positions: { stray: { x: 1, y: 2 } },
      deltas: { checkout: { dx: 140, dy: 0 }, stray: { dx: 1, dy: 2 } },
    });
  });
});

describe('modelMoves', () => {
  const rows = new Set(['pay:checkout', 'plat:checkout', 'plat:dep']);

  it('ungrouped, the same report back', () => {
    const positions = { a: { x: 1, y: 2 } };
    const deltas = { a: { dx: 1, dy: 2 } };
    expect(modelMoves(undefined, new Set(), positions, deltas)).toEqual({ positions, deltas });
  });

  it("ungrouped with a roster's badge copies (a map, no rows), a zone reports its place and days as ever", () => {
    // planRoster: Ben's badge in Platform is a copy, so the ungrouped view carries a map
    const badges = new Map([['__lane__:plat:ben', 'ben']]);
    const positions = { app: { x: 240, y: 340 }, stray: { x: 1, y: 2 } };
    const deltas = { app: { dx: 0, dy: 40 }, stray: { dx: 1, dy: 2 } };
    expect(modelMoves(badges, new Set(), positions, deltas)).toEqual({ positions, deltas });
  });

  it('a badge copy reports as the person it draws', () => {
    const badges = new Map([['__lane__:plat:ben', 'ben']]);
    expect(
      modelMoves(badges, new Set(), { '__lane__:plat:ben': { x: 5, y: 6 } }, { '__lane__:plat:ben': { dx: 5, dy: 6 } }),
    ).toEqual({ positions: { ben: { x: 5, y: 6 } }, deltas: { ben: { dx: 5, dy: 6 } } });
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
