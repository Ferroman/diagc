import { describe, expect, it } from 'vitest';
import { model } from '@diagramming/core';
import { addEdgeLabel, editEdgeLabel, edgeLabelsOf, moveEdgeLabel, nextLabelId } from './edge-labels';

function related(label?: string) {
  const m = model('t');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  m.relate(a, b, { kind: 'sync', ...(label !== undefined ? { label } : {}) });
  return m.toJSON();
}

describe('edge-labels', () => {
  it('projects effective labels through relationLabels() (bridging a legacy label)', () => {
    const model = related('call');
    const r = model.relations[0]!;
    expect(edgeLabelsOf(model, r.id)).toEqual([{ id: 'legacy', text: 'call', t: 0.5, side: 'center' }]);
  });

  it('returns an empty array when the relation has no label', () => {
    const model = related();
    expect(edgeLabelsOf(model, model.relations[0]!.id)).toEqual([]);
  });

  it('returns null for an unknown relation', () => {
    expect(edgeLabelsOf(related(), 'nope')).toBeNull();
  });

  it('allocates the first free label id', () => {
    expect(nextLabelId([{ id: 'l1', text: 'x' }, { id: 'l3', text: 'y' }])).toBe('l2');
    expect(nextLabelId([{ id: 'l1', text: 'x', t: 0.2 }, { id: 'l2', text: 'y' }])).toBe('l3');
  });

  it('adds a label with the next id', () => {
    const next = addEdgeLabel([{ id: 'l1', text: 'old' }], 'new', 0.5, 'top');
    expect(next).toEqual([{ id: 'l1', text: 'old' }, { id: 'l2', text: 'new', t: 0.5, side: 'top' }]);
  });

  it('edits a label\'s text, keeping its position', () => {
    const next = editEdgeLabel([{ id: 'l1', text: 'a', t: 0.2, side: 'bottom' }], 'l1', 'b');
    expect(next).toEqual([{ id: 'l1', text: 'b', t: 0.2, side: 'bottom' }]);
  });

  it('deletes a label when blanked', () => {
    const next = editEdgeLabel([{ id: 'l1', text: 'a' }, { id: 'l2', text: 'b' }], 'l1', '   ');
    expect(next).toEqual([{ id: 'l2', text: 'b' }]);
  });

  it('returns null when the last label is deleted (caller patches labels: null)', () => {
    expect(editEdgeLabel([{ id: 'l1', text: 'a' }], 'l1', '')).toBeNull();
  });

  it('moves a label to a new position', () => {
    const next = moveEdgeLabel([{ id: 'l1', text: 'a', t: 0.2, side: 'bottom' }], 'l1', 0.9, 'top');
    expect(next).toEqual([{ id: 'l1', text: 'a', t: 0.9, side: 'top' }]);
  });
});
