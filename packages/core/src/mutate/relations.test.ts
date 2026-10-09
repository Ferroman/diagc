import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { relationLabels } from '../labels';
import { validate } from '../validate';
import { addRelation, deleteRelation, updateRelation } from './relations';
import { CommandError } from '../command-error';
import type { DiagramModel } from '../types';

function base(): DiagramModel {
  const m = model('t');
  m.layer('flow', { name: 'Flow', tint: '#0ea5e9' });
  m.plane('arch').plane('infra', { layers: ['flow'] });
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a, b);
  m.relate(a, b, { kind: 'sync', label: 'call' });
  m.relate(a, b, { kind: 'flow', layer: 'flow' });
  return m.toJSON();
}

describe('relation mutations', () => {
  it('relations follow the builder id convention and patch with null-clears', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads' });
    expect(id).toBe('a->b#2'); // two a->b relations already exist
    const m2 = updateRelation(m, id, { label: 'hot', kind: 'writes' });
    expect(m2.relations.at(-1)).toMatchObject({ kind: 'writes', label: 'hot' });
    const m3 = updateRelation(m2, id, { label: null });
    expect(m3.relations.at(-1)?.label).toBeUndefined();
    const m4 = updateRelation(m3, id, { style: { shape: 'straight', end: 'dot' } });
    expect(m4.relations.at(-1)?.style).toEqual({ shape: 'straight', end: 'dot' });
    const m5 = updateRelation(m4, id, { style: null });
    expect(m5.relations.at(-1)?.style).toBeUndefined();
    expect(deleteRelation(m5, id).relations).toHaveLength(2);
    expect(() => deleteRelation(m5, 'nope')).toThrowError(CommandError);
  });

  it('updateRelation sets and null-clears labels', () => {
    const labels = [{ id: 'l1', text: 'x', t: 0.2, side: 'bottom' as const }];
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads' });
    const withLabels = updateRelation(m, id, { labels });
    expect(withLabels.relations.find((r) => r.id === id)?.labels).toEqual(labels);
    const cleared = updateRelation(withLabels, id, { labels: null });
    expect(cleared.relations.find((r) => r.id === id)?.labels).toBeUndefined();
  });

  it('updateRelation clears the legacy label whenever a patch touches labels', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads', label: 'events' });

    // Removing the last label must truly remove it, not leave a legacy `label`
    // for relationLabels() to resurrect on the next render.
    const removed = updateRelation(m, id, { labels: null });
    const removedRel = removed.relations.find((r) => r.id === id)!;
    expect(relationLabels(removedRel)).toEqual([]);
    expect(removedRel.label).toBeUndefined();

    // Setting new labels must drop the now-redundant legacy `label` too.
    const newLabels = [{ id: 'l1', text: 'foo', t: 0.5, side: 'center' as const }];
    const relabeled = updateRelation(m, id, { labels: newLabels });
    const relabeledRel = relabeled.relations.find((r) => r.id === id)!;
    expect(relabeledRel.label).toBeUndefined();
    expect(relabeledRel.labels).toEqual(newLabels);

    // A patch that never touches labels must leave the legacy `label` alone.
    const untouched = updateRelation(m, id, { kind: 'writes' });
    const untouchedRel = untouched.relations.find((r) => r.id === id)!;
    expect(untouchedRel.label).toBe('events');
  });

  it('creates a relation pre-pinned to the gesture sides via opts.style', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', {
      kind: 'reads',
      style: { fromSide: 'right', toSide: 'top' },
    });
    expect(m.relations.find((r) => r.id === id)?.style).toEqual({ fromSide: 'right', toSide: 'top' });
    expect(validate(m)).toEqual([]);
  });

  it('patches polarity and delay on a relation, clearing with null', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads' });
    const withPolarity = updateRelation(m, id, { polarity: '-' });
    expect(withPolarity.relations.find((r) => r.id === id)?.polarity).toBe('-');
    const clearedPolarity = updateRelation(withPolarity, id, { polarity: null });
    expect(clearedPolarity.relations.find((r) => r.id === id)?.polarity).toBeUndefined();

    const withDelay = updateRelation(m, id, { delay: true });
    expect(withDelay.relations.find((r) => r.id === id)?.delay).toBe(true);
    const clearedDelay = updateRelation(withDelay, id, { delay: null });
    expect(clearedDelay.relations.find((r) => r.id === id)?.delay).toBeUndefined();
  });

  it('moves relation endpoints (reconnect) and rejects unknown nodes', () => {
    const m = updateRelation(base(), 'a->b#0', { to: 'sys' });
    expect(m.relations.find((r) => r.id === 'a->b#0')).toMatchObject({ from: 'a', to: 'sys' });
    expect(() => updateRelation(base(), 'a->b#0', { to: 'ghost' })).toThrowError(CommandError);
  });

  it('reuses a freed suffix after a middle delete instead of colliding', () => {
    // base() has a->b#0 and a->b#1; drop #0 and re-add
    const afterDelete = deleteRelation(base(), 'a->b#0');
    const { model: m, id } = addRelation(afterDelete, 'a', 'b', { kind: 'reads' });
    expect(id).toBe('a->b#0'); // the freed slot, not a collision with the surviving #1
    const ids = m.relations.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // every relation id is unique
    // updateRelation resolves the new relation only, never the survivor
    const updated = updateRelation(m, id, { label: 'hot' });
    expect(updated.relations.filter((r) => r.label === 'hot')).toHaveLength(1);
  });
});

describe('relation fk columns', () => {
  const m = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  });
  it('addRelation carries fromColumn/toColumn', () => {
    const r = addRelation(m(), 'a', 'b', { kind: 'fk', fromColumn: 'b_id', toColumn: 'id' }).model.relations[0];
    expect(r).toMatchObject({ fromColumn: 'b_id', toColumn: 'id' });
  });
  it('updateRelation sets then clears fromColumn', () => {
    const { model, id } = addRelation(m(), 'a', 'b', { kind: 'fk' });
    const set = updateRelation(model, id, { fromColumn: 'b_id' });
    expect(set.relations[0]?.fromColumn).toBe('b_id');
    const cleared = updateRelation(set, id, { fromColumn: null });
    expect(cleared.relations[0]?.fromColumn).toBeUndefined();
  });
});
