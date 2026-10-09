import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';

describe('activity', () => {
  it('activity() creates the frame; lane() nests a lane under it', () => {
    const m = model('d');
    const act = m.activity('flow', { name: 'Actors' });
    act.lane('orders', { name: 'Orders', color: '#f6d55c' });
    const j = m.toJSON();
    expect(j.nodes).toEqual([
      { id: 'flow', name: 'Actors', type: 'activity-frame' },
      { id: 'orders', name: 'Orders', type: 'activity-lane', color: '#f6d55c' },
    ]);
    expect(j.containment).toEqual([{ parent: 'flow', child: 'orders' }]);
  });

  it('element helpers create typed leaves inside the lane', () => {
    const m = model('d');
    const lane = m.activity('flow').lane('orders');
    lane.action('receive', 'Receive order', { color: '#eee' });
    lane.object('invoice', 'Invoice');
    lane.send('cancel', 'Order cancel request');
    lane.receive('sig', 'Cancel');
    lane.note('n1', 'a note');
    const j = m.toJSON();
    const types = new Map(j.nodes.map((n) => [n.id, n.type]));
    expect(types.get('receive')).toBe('activity-action');
    expect(types.get('invoice')).toBe('activity-object');
    expect(types.get('cancel')).toBe('activity-send');
    expect(types.get('sig')).toBe('activity-receive');
    expect(types.get('n1')).toBe('activity-note');
    expect(j.nodes.find((n) => n.id === 'receive')?.color).toBe('#eee');
    expect(j.containment.filter((e) => e.parent === 'orders')).toHaveLength(5);
  });

  it('auto-ids count per scope and kind: start, start-2; empty names', () => {
    const m = model('d');
    const lane = m.activity('flow').lane('l');
    const s1 = lane.start();
    const s2 = lane.start();
    const d = lane.decision();
    const b = lane.bar();
    const e = lane.end();
    const j = m.toJSON();
    expect([s1.id, s2.id, d.id, b.id, e.id]).toEqual(['l-start', 'l-start-2', 'l-decision', 'l-bar', 'l-end']);
    expect(j.nodes.find((n) => n.id === 'l-start')?.name).toBe('');
    const types = new Map(j.nodes.map((n) => [n.id, n.type]));
    expect(types.get('l-start')).toBe('activity-start');
    expect(types.get('l-decision')).toBe('activity-decision');
    expect(types.get('l-bar')).toBe('activity-bar');
    expect(types.get('l-end')).toBe('activity-end');
  });

  it('region() nests in the lane and hosts the same element helpers', () => {
    const m = model('d');
    const lane = m.activity('flow').lane('l');
    const region = lane.region(undefined, 'cancelable');
    region.action('a', 'Fill order');
    const j = m.toJSON();
    expect(j.nodes.find((n) => n.id === 'l-region')?.type).toBe('activity-region');
    expect(j.containment).toContainEqual({ parent: 'l', child: 'l-region' });
    expect(j.containment).toContainEqual({ parent: 'l-region', child: 'a' });
  });

  it('flow helpers emit the activity kinds with optional labels', () => {
    const m = model('d');
    const act = m.activity('flow');
    const lane = act.lane('l');
    const a = lane.action('a', 'A');
    const b = lane.action('b', 'B');
    act.flow(a, b, '[ok]').objectFlow(a, b).interrupt(a, b).noteLink(lane.note('n', 'x'), b);
    const kinds = m.toJSON().relations.map((r) => [r.kind, r.label]);
    expect(kinds).toEqual([
      ['control', '[ok]'],
      ['object-flow', undefined],
      ['interrupt', undefined],
      ['note-link', undefined],
    ]);
  });
});
