// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bestLaneOrder, model } from './internal';

/** a frame with the given lanes, one action per lane, and links between lanes */
function frame(lanes: string[], links: [string, string][]) {
  const m = model('t');
  const act = m.activity('f');
  const actions = new Map(lanes.map((id) => [id, act.lane(id).action(`${id}-x`, id)] as const));
  for (const [a, b] of links) act.flow(actions.get(a)!, actions.get(b)!);
  return m.toJSON();
}

describe('bestLaneOrder', () => {
  it('pulls together the lanes a link joins', () => {
    // a talks to c across b; b talks to nobody — so b belongs at an end
    const m = frame(
      ['a', 'b', 'c'],
      [
        ['a', 'c'],
        ['a', 'c'],
      ],
    );
    const order = bestLaneOrder(m, 'f');
    expect(Math.abs(order.indexOf('a') - order.indexOf('c'))).toBe(1);
  });

  it('keeps the current order when nothing beats it', () => {
    const m = frame(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    expect(bestLaneOrder(m, 'f')).toEqual(['a', 'b', 'c']);
  });

  it("counts members nested in a region as their lane's", () => {
    const m = model('r');
    const act = m.activity('f');
    const a = act.lane('a');
    act.lane('b');
    const c = act.lane('c');
    const inside = a.region('reg').action('x', 'X');
    act.flow(inside, c.action('y', 'Y'));
    const order = bestLaneOrder(m.toJSON(), 'f');
    expect(Math.abs(order.indexOf('a') - order.indexOf('c'))).toBe(1);
  });

  it('reads the lanes of the given plane only', () => {
    const m = frame(['a', 'b', 'c'], [['a', 'c']]);
    expect(
      bestLaneOrder(
        {
          ...m,
          planes: [
            { id: 'p', name: 'P' },
            { id: 'q', name: 'Q' },
          ],
        },
        'f',
        'q',
      ),
    ).toEqual([]);
  });

  it('returns the order unchanged with fewer than three lanes or too many to try', () => {
    expect(bestLaneOrder(frame(['a', 'b'], [['a', 'b']]), 'f')).toEqual(['a', 'b']);
    const nine = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9'];
    expect(bestLaneOrder(frame(nine, [['l1', 'l9']]), 'f')).toEqual(nine);
  });
});
