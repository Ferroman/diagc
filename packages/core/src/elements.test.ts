import { describe, expect, expectTypeOf, it } from 'vitest';
import { elementKey, findElement, isNodeRef, type ElementRef, type ElementTarget, type ThreatTarget } from './elements';
import type { DiagramModel } from './types';

// A node and a relation may share an id; a ref says which one it means.
const m: DiagramModel = {
  version: 1,
  id: 't',
  name: 't',
  nodes: [{ id: 'x', name: 'Node x' }],
  containment: [],
  relations: [{ id: 'x', from: 'x', to: 'x', kind: 'uses' }],
  layers: [],
  planes: [],
};

describe('ElementRef', () => {
  it('files a note under node:<id> or relation:<id>, the keys saved layouts use', () => {
    expect(elementKey({ node: 'x' })).toBe('node:x');
    expect(elementKey({ relation: 'x' })).toBe('relation:x');
  });

  it('tells a node ref from a relation ref', () => {
    expect(isNodeRef({ node: 'x' })).toBe(true);
    expect(isNodeRef({ relation: 'x' })).toBe(false);
  });

  it('finds the element a ref names, when a node and a relation share its id', () => {
    expect(findElement(m, { node: 'x' })).toBe(m.nodes[0]);
    expect(findElement(m, { relation: 'x' })).toBe(m.relations[0]);
  });

  it('finds nothing for an id the model does not have', () => {
    expect(findElement(m, { node: 'nope' })).toBeUndefined();
    expect(findElement(m, { relation: 'nope' })).toBeUndefined();
  });

  it('keeps the 1.0 names as the same type', () => {
    expectTypeOf<ThreatTarget>().toEqualTypeOf<ElementRef>();
    expectTypeOf<ElementTarget>().toEqualTypeOf<ElementRef>();
  });
});
