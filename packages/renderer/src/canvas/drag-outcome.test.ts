import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { ACTIVITY_LANE_TYPE } from '@diagc/core/internal';
import { dropOffset, laneDrop, movesLeft, snapBackResets } from './drag-outcome';

const node = (id: string, extra: Partial<Node> & { typeId?: string } = {}): Node => {
  const { typeId, ...rest } = extra;
  return { id, position: { x: 0, y: 0 }, data: typeId !== undefined ? { typeId } : {}, ...rest };
};

describe('snapBackResets', () => {
  it('takes every snapping box out of the move and returns it to its laid spot', () => {
    const laid: Record<string, { x: number; y: number }> = { alice: { x: 10, y: 20 }, bob: { x: 30, y: 40 } };
    const r = snapBackResets(
      ['alice', 'task', 'bob'],
      (id) => id !== 'task',
      (id) => laid[id],
    );
    expect(r.skip).toEqual(['alice', 'bob']);
    expect(r.resets).toEqual({ alice: { x: 10, y: 20 }, bob: { x: 30, y: 40 } });
  });

  it('still keeps a snapping box out of the move when its laid spot is unknown', () => {
    const r = snapBackResets(
      ['alice'],
      () => true,
      () => undefined,
    );
    expect(r.skip).toEqual(['alice']);
    expect(r.resets).toEqual({});
  });
});

describe('laneDrop', () => {
  // a frame with three lanes stacked 100 high, and an action inside lane a
  const lanes = [
    node('a', { parentId: 'flow', typeId: ACTIVITY_LANE_TYPE }),
    node('b', { parentId: 'flow', typeId: ACTIVITY_LANE_TYPE }),
    node('c', { parentId: 'flow', typeId: ACTIVITY_LANE_TYPE }),
  ];
  const arranged = new Map([
    ['a', { y: 0, height: 100 }],
    ['b', { y: 100, height: 100 }],
    ['c', { y: 200, height: 100 }],
  ]);
  const at = (id: string, y: number) => lanes.map((n) => (n.id === id ? { ...n, position: { x: 0, y } } : n));

  it('counts the bands a lane’s middle passed, down or up', () => {
    expect(laneDrop(at('a', 260), 'a', arranged)).toEqual({ frameId: 'flow', offset: 2 });
    expect(laneDrop(at('a', 160), 'a', arranged)).toEqual({ frameId: 'flow', offset: 1 });
    expect(laneDrop(at('c', -10), 'c', arranged)).toEqual({ frameId: 'flow', offset: -2 });
  });

  it('reports no move for a lane let go inside its own band', () => {
    expect(laneDrop(at('b', 120), 'b', arranged)).toEqual({ frameId: 'flow', offset: 0 });
  });

  it('is undefined for anything but a lane inside a frame', () => {
    const action = node('act1', { parentId: 'a', typeId: 'activity-action' });
    expect(laneDrop([...lanes, action], 'act1', arranged)).toBeUndefined();
    expect(laneDrop([node('loose', { typeId: ACTIVITY_LANE_TYPE })], 'loose', arranged)).toBeUndefined();
    expect(laneDrop(lanes, 'missing', arranged)).toBeUndefined();
  });

  it('orders only the lanes the arrangement has placed', () => {
    const twoPlaced = new Map([...arranged].filter(([id]) => id !== 'b'));
    expect(laneDrop(at('a', 260), 'a', twoPlaced)).toEqual({ frameId: 'flow', offset: 1 });
    expect(laneDrop(at('a', 260), 'a', null)).toEqual({ frameId: 'flow', offset: 0 });
  });
});

describe('dropOffset', () => {
  it('is where the dropped box sits inside its target', () => {
    expect(dropOffset({ x: 130, y: 70 }, { x: 100, y: 50 })).toEqual({ x: 30, y: 20 });
  });
});

describe('movesLeft', () => {
  it('hands the batch itself on when nothing was taken out, else the rest', () => {
    const boxes = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    expect(movesLeft(boxes, new Set())).toBe(boxes);
    expect(movesLeft(boxes, new Set(['a']))).toEqual({ b: { x: 3, y: 4 } });
    expect(movesLeft(boxes, new Set(['a', 'b']))).toEqual({});
  });
});
