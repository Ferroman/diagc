import { describe, expect, it } from 'vitest';
import { validate } from '../../validate/index';
import type { DiagramModel, DiagramNode, DiagramRelation } from '../../types';

describe('second-order conventions', () => {
  const so = (
    nodes: DiagramNode[],
    relations: DiagramRelation[] = [],
    containment: DiagramModel['containment'] = [],
  ): DiagramModel => ({
    version: 1,
    id: 'so',
    name: 'so',
    notation: 'second-order',
    nodes,
    containment,
    relations,
    layers: [],
    planes: [],
  });
  const n = (id: string, type: string): DiagramNode => ({ id, name: id, type });
  const r = (from: string, to: string): DiagramRelation => ({ id: `${from}->${to}`, from, to, kind: 'leads-to' });
  const codes = (m: DiagramModel) => validate(m).map((i) => i.code);

  it('accepts a decision with a chain of consequences', () => {
    const m = so(
      [n('d', 'so-decision'), n('a', 'so-consequence-positive'), n('b', 'so-consequence-negative')],
      [r('d', 'a'), r('a', 'b')],
    );
    expect(validate(m)).toEqual([]);
  });
  it('wants at least one decision', () => {
    expect(codes(so([n('a', 'so-consequence-neutral')]))).toContain('so-no-decision');
  });
  it('is valid empty — every second-order diagram starts there', () => {
    expect(validate(so([]))).toEqual([]);
  });
  it('does not want a decision until there is a second-order node to judge', () => {
    expect(codes(so([n('note', 'comment')]))).not.toContain('so-no-decision');
  });
  it('sends a loop to the causal-loop notation', () => {
    const issues = validate(
      so(
        [n('d', 'so-decision'), n('a', 'so-consequence-neutral'), n('b', 'so-consequence-neutral')],
        [r('d', 'a'), r('a', 'b'), r('b', 'a')],
      ),
    );
    const cycle = issues.find((i) => i.code === 'so-cycle')!;
    expect(cycle.message).toContain('causal-loop');
    expect(cycle.ref).toBe('a');
  });
  it('flags each consequence no decision leads to', () => {
    const issues = validate(so([n('d', 'so-decision'), n('lost', 'so-consequence-neutral')]));
    expect(issues.filter((i) => i.code === 'so-unreachable').map((i) => i.ref)).toEqual(['lost']);
  });
  it('keeps the notation flat', () => {
    const m = so([n('g', 'system'), n('d', 'so-decision')], [], [{ parent: 'g', child: 'd' }]);
    expect(validate(m).find((i) => i.code === 'so-contained')?.ref).toBe('d');
  });
  it('says nothing when the notation is not active', () => {
    const m = { ...so([n('a', 'so-consequence-neutral')]) };
    delete (m as { notation?: string }).notation;
    expect(codes(m).filter((c) => c.startsWith('so-'))).toEqual([]);
  });
  it('reads a plane-level notation too', () => {
    const m: DiagramModel = {
      ...so([n('a', 'so-consequence-neutral')]),
      planes: [{ id: 'p', name: 'P', notation: 'second-order' }],
    };
    delete (m as { notation?: string }).notation;
    expect(codes(m)).toContain('so-no-decision');
  });
});
