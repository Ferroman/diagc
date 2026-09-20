import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core';
import { computeSelectionColor } from './selection-color';

function m() {
  const b = model('t');
  const a = b.node('a', { type: 'service', color: '#f00' });
  const c = b.node('c', { type: 'service' });
  b.relate(a, c, { kind: 'sync', style: { color: '#0f0' } });
  b.relate(a, c, { kind: 'sync' });
  return b.toJSON();
}

describe('computeSelectionColor', () => {
  it('returns the selected node color and an onChange that dispatches set-node-details', () => {
    const dispatch = vi.fn();
    const sc = computeSelectionColor(m(), { kind: 'node', id: 'a' }, dispatch);
    expect(sc?.value).toBe('#f00');
    sc?.onChange('#123');
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { color: '#123' } });
    sc?.onChange('');
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { color: null } });
  });

  it('returns null for a stale node id or a null selection', () => {
    const dispatch = vi.fn();
    expect(computeSelectionColor(m(), null, dispatch)).toBeNull();
    expect(computeSelectionColor(m(), { kind: 'node', id: 'missing' }, dispatch)).toBeNull();
  });

  it('returns a single-relation edge color, updating its style', () => {
    const dispatch = vi.fn();
    const edgeId = m().relations[0]!.id as string;
    const sc = computeSelectionColor(m(), { kind: 'edge', id: edgeId }, dispatch);
    expect(sc?.value).toBe('#0f0');
    sc?.onChange('#abc');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-relation',
      id: edgeId,
      patch: { style: { color: '#abc' } },
    });
  });

  it('returns null for a multi-relation edge selection', () => {
    const dispatch = vi.fn();
    expect(computeSelectionColor(m(), { kind: 'edge', id: 'x', constituentIds: ['a', 'b'] }, dispatch)).toBeNull();
  });
});
