import { describe, expect, it } from 'vitest';
import { addThreat, removeThreat, updateThreat } from './threats-and-comments';
import type { DiagramModel, Threat } from '../types';

describe('threats', () => {
  const m = (): DiagramModel => ({
    version: 1,
    id: 'm',
    name: 'm',
    nodes: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    containment: [],
    relations: [{ id: 'r', from: 'a', to: 'b', kind: 'x' }],
    layers: [],
    planes: [],
  });
  const t = (id: string): Threat => ({ id, category: 'S', title: `T ${id}` });

  it('adds to a node and to a relation, sharing every untouched element', () => {
    const before = m();
    const after = addThreat(addThreat(before, { node: 'a' }, t('t1')), { relation: 'r' }, t('t1'));
    expect(after.nodes[0]!.threats).toEqual([t('t1')]);
    expect(after.relations[0]!.threats).toEqual([t('t1')]);
    expect(after.nodes[1]).toBe(before.nodes[1]);
    expect(before.nodes[0]!.threats).toBeUndefined();
  });

  it('rejects an unknown target and a duplicate id', () => {
    expect(() => addThreat(m(), { node: 'zz' }, t('t1'))).toThrow(/zz/);
    expect(() => addThreat(m(), { relation: 'zz' }, t('t1'))).toThrow(/zz/);
    const one = addThreat(m(), { node: 'a' }, t('t1'));
    expect(() => addThreat(one, { node: 'a' }, t('t1'))).toThrow(/t1/);
  });

  it('patches fields, clearing optionals with null', () => {
    const one = addThreat(m(), { node: 'a' }, { ...t('t1'), severity: 'high', mitigation: 'x' });
    const after = updateThreat(one, { node: 'a' }, 't1', {
      title: 'Renamed',
      category: 'E',
      severity: null,
      status: 'mitigated',
      mitigation: null,
    });
    expect(after.nodes[0]!.threats).toEqual([{ id: 't1', category: 'E', title: 'Renamed', status: 'mitigated' }]);
    expect(() => updateThreat(one, { node: 'a' }, 'nope', { title: 'x' })).toThrow(/nope/);
  });

  it('removes, dropping the key with the last threat', () => {
    const two = addThreat(addThreat(m(), { relation: 'r' }, t('t1')), { relation: 'r' }, t('t2'));
    const one = removeThreat(two, { relation: 'r' }, 't1');
    expect(one.relations[0]!.threats).toEqual([t('t2')]);
    const none = removeThreat(one, { relation: 'r' }, 't2');
    expect('threats' in none.relations[0]!).toBe(false);
    expect(() => removeThreat(none, { relation: 'r' }, 't2')).toThrow(/t2/);
  });
});
