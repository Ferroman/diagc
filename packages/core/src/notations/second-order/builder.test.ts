import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { validate } from '../../validate/index';

describe('secondOrder()', () => {
  it('chains consequences with then(), and validates', () => {
    const m = model('so');
    const so = m.secondOrder();
    const d = so.decision('split', 'Split the monolith');
    const a = d.then('deploys', 'Teams deploy independently', { valence: '+' });
    const b = a.then('oncall', 'More on-call load', { valence: '-', label: 'in time' });
    d.then('infra', 'More infrastructure to run', { valence: '-' }).leadsTo(b);
    const json = m.toJSON();

    expect(json.notation).toBe('second-order');
    expect(json.nodes.map((n) => [n.id, n.type, n.name])).toEqual([
      ['split', 'so-decision', 'Split the monolith'],
      ['deploys', 'so-consequence-positive', 'Teams deploy independently'],
      ['oncall', 'so-consequence-negative', 'More on-call load'],
      ['infra', 'so-consequence-negative', 'More infrastructure to run'],
    ]);
    expect(json.relations.map((r) => [r.from, r.to, r.kind, r.label])).toEqual([
      ['split', 'deploys', 'leads-to', undefined],
      ['deploys', 'oncall', 'leads-to', 'in time'],
      ['split', 'infra', 'leads-to', undefined],
      ['infra', 'oncall', 'leads-to', undefined],
    ]);
    expect(validate(json)).toEqual([]);
  });

  it('defaults to a neutral consequence named after its id', () => {
    const m = model('so2');
    m.secondOrder().decision('d').then('c');
    expect(m.toJSON().nodes[1]).toMatchObject({ id: 'c', name: 'c', type: 'so-consequence-neutral' });
  });

  it('can live on a plane of its own instead of the whole model', () => {
    const m = model('so3');
    m.secondOrder({ plane: 'consequences', name: 'Consequences' }).decision('d');
    const json = m.toJSON();
    expect(json.notation).toBeUndefined();
    expect(json.planes).toEqual([{ id: 'consequences', name: 'Consequences', notation: 'second-order' }]);
  });

  it('is declared once', () => {
    const m = model('so4');
    m.secondOrder();
    expect(() => m.secondOrder()).toThrow(/already declared/);
  });
});
