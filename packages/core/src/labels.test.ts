import { describe, expect, it } from 'vitest';
import { relationLabels } from './labels';
import type { DiagramRelation } from './types';

const rel = (extra: Partial<DiagramRelation>): DiagramRelation => ({
  id: 'r',
  from: 'a',
  to: 'b',
  kind: 'sync',
  ...extra,
});

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
  it('synthesizes one centered label from transition parts', () => {
    expect(relationLabels(rel({ trigger: 'pay' }))).toEqual([
      { id: 'transition', text: 'pay', t: 0.5, side: 'center' },
    ]);
  });
  it('keeps the first label placement and replaces its text with the parts', () => {
    const labels = [{ id: 'l1', text: 'old', t: 0.3, side: 'top' as const }];
    expect(relationLabels(rel({ trigger: 'pay', labels }))).toEqual([{ id: 'l1', text: 'pay', t: 0.3, side: 'top' }]);
  });
  it('prefers the parts over a legacy label', () => {
    expect(relationLabels(rel({ label: 'x', trigger: 'pay', effect: 'go' }))).toEqual([
      { id: 'transition', text: 'pay / go', t: 0.5, side: 'center' },
    ]);
  });
});
