import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core';
import { diffEdgeStatus, diffNodeClasses, withDiffClass } from './diff-marks';

const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'M',
  nodes: [
    { id: 'top', name: 'Top' },
    { id: 'mid', name: 'Mid' },
    { id: 'leaf', name: 'Leaf' },
    { id: 'other', name: 'Other' },
    { id: 'peer', name: 'Peer' },
  ],
  containment: [
    { parent: 'top', child: 'mid' },
    { parent: 'mid', child: 'leaf' },
    { parent: 'other', child: 'peer' },
  ],
  relations: [{ id: 'r', from: 'peer', to: 'other', kind: 'uses' }],
  layers: [],
  planes: [],
};

describe('diffNodeClasses', () => {
  it('marks every container above a change as inside, keeping its own mark', () => {
    const classes = diffNodeClasses(model, { nodes: { leaf: 'added', top: 'changed' }, relations: {} });
    expect(Object.fromEntries(classes)).toEqual({ leaf: 'added', mid: 'inside', top: 'changed' });
  });

  it("marks a changed relation's endpoint containers", () => {
    const classes = diffNodeClasses(model, { nodes: {}, relations: { r: 'removed' } });
    expect(Object.fromEntries(classes)).toEqual({ other: 'inside' });
  });
});

describe('diffEdgeStatus', () => {
  const marks = { nodes: {}, relations: { a: 'added', b: 'added', c: 'removed' } } as const;
  it('is the shared status, changed for a mix, undefined for none', () => {
    expect(diffEdgeStatus([{ id: 'a' }, { id: 'b' }], marks)).toBe('added');
    expect(diffEdgeStatus([{ id: 'a' }, { id: 'z' }], marks)).toBe('changed');
    expect(diffEdgeStatus([{ id: 'a' }, { id: 'c' }], marks)).toBe('changed');
    expect(diffEdgeStatus([{ id: 'z' }], marks)).toBeUndefined();
  });
});

describe('withDiffClass', () => {
  it('appends to an existing class', () => {
    expect(withDiffClass('nopan', 'added')).toBe('nopan dg-diff-added');
    expect(withDiffClass(undefined, 'inside')).toBe('dg-diff-inside');
    expect(withDiffClass('nopan', undefined)).toBe('nopan');
  });
});
