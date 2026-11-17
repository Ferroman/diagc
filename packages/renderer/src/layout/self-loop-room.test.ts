import { describe, expect, it } from 'vitest';
import type { ViewEdge } from '@diagc/core/internal';
import { selfLoopRooms } from './self-loop-room';

const edge = (id: string, from: string, to = from): ViewEdge => ({
  id,
  from,
  to,
  kind: 'transition',
  constituents: [],
});
const box = { width: 40, height: 18 };

describe('selfLoopRooms', () => {
  it('gives room only to a node with a self-loop', () => {
    const rooms = selfLoopRooms([edge('ab', 'a', 'b'), edge('bb', 'b')], 'RIGHT', () => undefined);
    expect([...rooms.keys()]).toEqual(['b']);
  });

  it('reaches the outermost crown and the label beyond it, above the box in a sideways flow', () => {
    const rooms = selfLoopRooms([edge('1', 'a'), edge('2', 'a'), edge('3', 'a')], 'LEFT', () => box);
    expect(rooms.get('a')).toMatchObject({ width: 40, height: 28 + 2 * 18 + 10 + 9 });
    expect(rooms.get('a')?.layoutOptions).toEqual({ 'elk.nodeLabels.placement': 'OUTSIDE V_TOP H_CENTER' });
  });

  it('sits right of the box in an upright flow, the label starting past the crown', () => {
    const rooms = selfLoopRooms([edge('1', 'a')], 'UP', () => box);
    // as tall as a loop on a short side bulges to
    expect(rooms.get('a')).toMatchObject({ width: 28 + 10 + 40, height: 32 });
    expect(rooms.get('a')?.layoutOptions).toEqual({ 'elk.nodeLabels.placement': 'OUTSIDE H_RIGHT V_CENTER' });
  });
});
