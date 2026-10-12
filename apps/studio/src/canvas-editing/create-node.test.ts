import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
import { createNodeAt, placeTags } from './create-node';

// Two planes: a normal one plus one that borrows another plane's containment.
function twoPlanes(): DiagramModel {
  const m = model('t');
  m.node('a', { type: 'service' });
  m.plane('arch', { name: 'Arch' });
  m.plane('flow', { name: 'Flow', containmentOf: 'arch' });
  return m.toJSON();
}

describe('createNodeAt', () => {
  it('tags a new node view-local on a non-borrowing active plane', () => {
    const m = twoPlanes();
    const place = createNodeAt(m, { kind: 'node', plane: 'arch', borrowsContainment: false, parentId: undefined });
    expect(place.scopedPlane).toBe('arch');
    expect(place.id).toBe('node');
    expect(place.parent).toBeUndefined();
  });

  it("does NOT tag a node on a borrowing plane: it joins the donor's structure, shared", () => {
    // A borrowing plane is a view of its donor's structure; the inspector's Scope
    // makes a node the plane's own when that is what was meant.
    const m = twoPlanes();
    const place = createNodeAt(m, { kind: 'node', plane: 'flow', borrowsContainment: true, parentId: undefined });
    expect(place.scopedPlane).toBeUndefined();
  });

  it('resolves a parent with the raw active-plane tag when one is given', () => {
    const m = twoPlanes();
    const place = createNodeAt(m, { kind: 'node', plane: 'arch', borrowsContainment: false, parentId: 'a' });
    expect(place.parent).toEqual({ id: 'a', plane: 'arch' });
  });

  it('generates a unique id against existing nodes', () => {
    const m = twoPlanes();
    expect(createNodeAt(m, { kind: 'node', plane: undefined, borrowsContainment: false, parentId: undefined }).id).toBe(
      'node',
    );
  });
});

describe('placeTags', () => {
  it('carries the plane tag only when scoped, and the pen layer when set', () => {
    const place = { id: 'x', scopedPlane: 'arch', parent: undefined };
    expect(placeTags(place, 'pen')).toEqual({ plane: 'arch', layer: 'pen' });
    expect(placeTags(place, null)).toEqual({ plane: 'arch' });
    const shared = { id: 'y', scopedPlane: undefined, parent: undefined };
    expect(placeTags(shared, 'pen')).toEqual({ layer: 'pen' });
    expect(placeTags(shared, null)).toEqual({});
  });
});
