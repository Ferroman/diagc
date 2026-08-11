import { describe, expect, it } from 'vitest';
import { relationLabels } from './labels';
import type { DiagramRelation } from './types';

const rel = (extra: Partial<DiagramRelation>): DiagramRelation => ({ id: 'r', from: 'a', to: 'b', kind: 'sync', ...extra });

describe('relationLabels', () => {
  it('returns the labels list when present (wins over legacy label)', () => {
    const labels = [{ id: 'l1', text: 'x', t: 0.3, side: 'top' as const }];
    expect(relationLabels(rel({ labels, label: 'ignored' }))).toEqual(labels);
  });
  it('synthesizes one centered label from a legacy label string', () => {
    expect(relationLabels(rel({ label: 'hi' }))).toEqual([{ id: 'legacy', text: 'hi', t: 0.5, side: 'center' }]);
  });
  it('returns [] when neither labels nor label is set (or label empty)', () => {
    expect(relationLabels(rel({}))).toEqual([]);
    expect(relationLabels(rel({ label: '' }))).toEqual([]);
  });
});
