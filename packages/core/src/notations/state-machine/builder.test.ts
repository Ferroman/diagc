import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { validate } from '../../validate/index';
import type { DiagramModel } from '../../types';
import {
  SM_DEEP_HISTORY_TYPE,
  SM_MACHINE_TYPE,
  SM_NOTATION,
  SM_REGION_TYPE,
  SM_TRANSITION_KIND,
} from './state-machine';

/** the order machine of the design: composite, orthogonal state, internal transition, history */
function orderModel() {
  const m = model('order');
  const order = m.stateMachine('order', { name: 'Order' });
  const draft = order.state('draft', 'Draft');
  const paid = order.state('paid', 'Paid', { entry: 'reserveStock', exit: 'releaseHold' });
  const fulfil = order.state('fulfil', 'Fulfilment');
  order.final();
  const pick = fulfil.region('pick', 'Picking');
  const bill = fulfil.region('bill', 'Billing');
  pick.initial().to(pick.state('picking', 'Picking'));
  bill.initial().to(bill.state('invoicing', 'Invoicing'));
  order.initial().to(draft);
  order.transition(draft, paid, { trigger: 'pay', guard: 'total > 0', effect: 'charge' });
  order.transition(paid, fulfil, { trigger: 'ship' });
  paid.on('remind', { guard: 'overdue', effect: 'email' });
  pick.history();
  return { m, order, draft, paid, fulfil, pick, bill };
}

const nodeOf = (json: DiagramModel, id: string) => json.nodes.find((n) => n.id === id);

describe('m.stateMachine()', () => {
  it('declares a machine frame and sets the model notation', () => {
    const m = model('x');
    m.stateMachine('order', { name: 'Order' });
    const json = m.toJSON();
    expect(nodeOf(json, 'order')).toMatchObject({ type: SM_MACHINE_TYPE, name: 'Order' });
    expect(json.notation).toBe(SM_NOTATION);
  });

  it('repeats without a guard', () => {
    const m = model('x');
    m.stateMachine('a');
    expect(() => m.stateMachine('b')).not.toThrow();
    expect(m.toJSON().nodes.filter((n) => n.type === SM_MACHINE_TYPE)).toHaveLength(2);
  });

  it('keeps an existing state-machine notation and refuses another', () => {
    const same = model('x').notation(SM_NOTATION);
    same.stateMachine('a');
    expect(same.toJSON().notation).toBe(SM_NOTATION);
    expect(() => model('y').notation('c4').stateMachine('a')).toThrow(/plane/);
  });

  it('declares the named plane once and tags everything on it', () => {
    const m = model('x');
    const a = m.stateMachine('a', { plane: 'life' });
    m.stateMachine('b', { plane: 'life' });
    a.state('s').region('r').initial();
    const json = m.toJSON();
    expect(json.planes).toEqual([{ id: 'life', name: 'State machine', notation: SM_NOTATION }]);
    expect(json.nodes).toHaveLength(5);
    expect(json.nodes.every((n) => n.plane === 'life')).toBe(true);
    expect(json.containment).toHaveLength(3);
    expect(json.containment.every((e) => e.plane === 'life')).toBe(true);
  });

  it('refuses a plane declared with another notation', () => {
    const m = model('x').plane('life', { notation: 'c4' });
    expect(() => m.stateMachine('a', { plane: 'life' })).toThrow(/life/);
  });

  it('nests states, regions and pseudo-states by containment', () => {
    const json = orderModel().m.toJSON();
    const childrenOf = (parent: string) => json.containment.filter((e) => e.parent === parent).map((e) => e.child);
    expect(childrenOf('fulfil')).toEqual(['pick', 'bill']);
    expect(nodeOf(json, 'pick')?.type).toBe(SM_REGION_TYPE);
    expect(childrenOf('pick')).toContain('pick-initial');
    expect(childrenOf('order')).toContain('order-final');
  });

  it('turns entry/exit/do and on() into behaviors in order', () => {
    const { m, paid } = orderModel();
    paid.on('tick', { effect: 'count' });
    expect(nodeOf(m.toJSON(), 'paid')?.behaviors).toEqual([
      { trigger: 'entry', effect: 'reserveStock' },
      { trigger: 'exit', effect: 'releaseHold' },
      { trigger: 'remind', guard: 'overdue', effect: 'email' },
      { trigger: 'tick', effect: 'count' },
    ]);
    const other = model('y');
    other.stateMachine('a').state('s', 'S', { do: 'poll', entry: 'open' });
    expect(nodeOf(other.toJSON(), 's')?.behaviors?.map((b) => b.trigger)).toEqual(['entry', 'do']);
  });

  it('draws transitions with parts and no label', () => {
    const rel = orderModel()
      .m.toJSON()
      .relations.find((r) => r.from === 'draft' && r.to === 'paid');
    expect(rel).toMatchObject({ kind: SM_TRANSITION_KIND, trigger: 'pay', guard: 'total > 0', effect: 'charge' });
    expect(rel).not.toHaveProperty('label');
  });

  it('numbers auto ids per scope and kind', () => {
    const a = model('x').stateMachine('a');
    expect([a.initial().id, a.initial().id, a.choice().id, a.history({ deep: true }).id]).toEqual([
      'a-initial',
      'a-initial-2',
      'a-choice',
      'a-deep-history',
    ]);
  });

  it('`to()` returns the target so a path chains', () => {
    const sm = model('y').stateMachine('a');
    const s1 = sm.state('s1');
    const s2 = sm.state('s2');
    const s3 = sm.state('s3');
    expect(sm.initial().to(s1).id).toBe('s1');
    expect(s1.to(s2, { trigger: 'go' }).id).toBe('s2');
    expect(s2.to(s3).id).toBe('s3');
  });

  it('refuses history directly in an orthogonal state', () => {
    const { fulfil } = orderModel();
    expect(() => fulfil.history()).toThrow(/region\.history\(\)/);
  });

  it('puts history where it belongs', () => {
    const m = model('x');
    const pick = m.stateMachine('a').state('pick', 'Pick');
    pick.history({ deep: true });
    const json = m.toJSON();
    expect(nodeOf(json, 'pick-deep-history')?.type).toBe(SM_DEEP_HISTORY_TYPE);
    expect(json.containment).toContainEqual({ parent: 'pick', child: 'pick-deep-history' });
  });

  it('the spec example lints clean', () => {
    expect(validate(orderModel().m.toJSON())).toEqual([]);
  });
});
