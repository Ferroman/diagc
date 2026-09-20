import { describe, expect, it } from 'vitest';
import { applyCommand, emptyDrawings, emptyLayout, model, validate } from '@diagc/core';
import { addDecision, thenWhat } from './secondOrderActions';

const base = () => {
  const m = model('so');
  m.secondOrder().decision('d', 'Decide');
  return m.toJSON();
};

describe('thenWhat', () => {
  it('is one batch: the consequence and the arrow that leads to it', () => {
    const out = thenWhat(base(), 'd', '-')!;
    expect(out.id).toBe('consequence');
    expect(out.command).toEqual({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'consequence', name: '', type: 'so-consequence-negative' } },
        { type: 'add-relation', from: 'd', to: 'consequence', opts: { kind: 'leads-to' } },
      ],
    });
  });
  it('never reuses an id, and leaves a model validation accepts', () => {
    let m = base();
    for (const v of ['+', '0'] as const) {
      const out = thenWhat(m, 'd', v)!;
      m = applyCommand({ model: m, layout: emptyLayout(), drawings: emptyDrawings() }, out.command).model;
    }
    expect(m.nodes.map((n) => n.id)).toEqual(['d', 'consequence', 'consequence-2']);
    expect(validate(m)).toEqual([]);
  });
  it('refuses a node that is not part of the notation, or not there', () => {
    const m = { ...base(), nodes: [...base().nodes, { id: 'svc', name: 'svc', type: 'service' }] };
    expect(thenWhat(m, 'svc', '0')).toBeNull();
    expect(thenWhat(m, 'ghost', '0')).toBeNull();
  });
  it('tags the new consequence with the source node\'s plane, so it never leaks into every view', () => {
    const m = { ...base(), nodes: base().nodes.map((n) => (n.id === 'd' ? { ...n, plane: 'p' } : n)) };
    const out = thenWhat(m, 'd', '0')!;
    expect(out.command).toEqual({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'consequence', name: '', type: 'so-consequence-neutral', plane: 'p' } },
        { type: 'add-relation', from: 'd', to: 'consequence', opts: { kind: 'leads-to' } },
      ],
    });
  });
});

describe('addDecision', () => {
  it('adds a lone decision', () => {
    expect(addDecision(base()).command).toEqual({ type: 'add-node', node: { id: 'decision', name: '', type: 'so-decision' } });
  });
  it('tags a plane-scoped decision when a plane is given', () => {
    expect(addDecision(base(), 'p').command).toEqual({
      type: 'add-node',
      node: { id: 'decision', name: '', type: 'so-decision', plane: 'p' },
    });
  });
});
