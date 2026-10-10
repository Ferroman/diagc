import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { noSelection, soleSelection, withDropTarget } from './node-copy';

const node = (id: string, extra: Partial<Node> = {}): Node => ({ id, position: { x: 0, y: 0 }, data: {}, ...extra });

describe('patches to React Flow’s node copy', () => {
  it('soleSelection selects one node and touches only the nodes whose flag changes', () => {
    const nodes = [node('a', { selected: true }), node('b'), node('c')];
    const next = soleSelection(nodes, 'b');
    expect(next.map((n) => n.selected === true)).toEqual([false, true, false]);
    expect(next[2]).toBe(nodes[2]);
    expect(next[0]).not.toBe(nodes[0]);
  });

  it('noSelection clears every flag and keeps already-clear nodes as they are', () => {
    const nodes = [node('a', { selected: true }), node('b')];
    const next = noSelection(nodes);
    expect(next.map((n) => n.selected === true)).toEqual([false, false]);
    expect(next[1]).toBe(nodes[1]);
  });

  it('withDropTarget marks one node’s data, or none, and keeps the rest as they are', () => {
    const nodes = [node('a', { data: { dropTarget: true } }), node('b'), node('c')];
    const next = withDropTarget(nodes, 'b');
    expect(next.map((n) => n.data['dropTarget'] === true)).toEqual([false, true, false]);
    expect(next[2]).toBe(nodes[2]);
    const none = withDropTarget(next, undefined);
    expect(none.some((n) => n.data['dropTarget'] === true)).toBe(false);
    expect(none[2]).toBe(nodes[2]);
  });
});
