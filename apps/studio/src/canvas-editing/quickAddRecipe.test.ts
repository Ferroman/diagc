import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { addConnected, lookOf, parentIn, type QuickAddSource } from './quickAddRecipe';

const nested = (() => {
  const m = model('n');
  const sys = m.node('sys', { name: 'sys', type: 'system' });
  sys.contains(m.node('a', { name: 'a', color: '#123456', icon: 'server' }));
  m.node('b', { name: 'b' });
  return m.toJSON();
})();
const src = (id: string, penLayer: string | null = null): QuickAddSource => ({
  model: nested,
  source: nested.nodes.find((n) => n.id === id)!,
  ctx: { notation: undefined, plane: undefined, borrowsContainment: false, penLayer },
  kindTo: () => 'sync',
});

describe('quick-add building blocks', () => {
  it("parentIn reads the source's container on the viewed plane", () => {
    expect(parentIn(nested, undefined, 'a')).toBe('sys');
    expect(parentIn(nested, undefined, 'b')).toBeUndefined();
  });

  it('lookOf copies only the look channels a node sets', () => {
    expect(lookOf(src('a').source)).toEqual({ color: '#123456', icon: 'server' });
    expect(lookOf(src('b').source)).toEqual({});
  });

  it('addConnected adds the node and a relation to it in one batch, on the pen layer', () => {
    const node = { id: 'n1', name: '' };
    expect(
      addConnected(src('a', 'ops'), node, { id: 'n1', parent: { id: 'sys' }, scopedPlane: undefined }, 'k'),
    ).toEqual({
      type: 'batch',
      commands: [
        { type: 'add-node', node, parent: { id: 'sys' } },
        { type: 'add-relation', from: 'a', to: 'n1', opts: { kind: 'k', layer: 'ops' } },
      ],
    });
    expect(addConnected(src('b'), node, { id: 'n1', scopedPlane: undefined }, 'sync')).toEqual({
      type: 'batch',
      commands: [
        { type: 'add-node', node },
        { type: 'add-relation', from: 'b', to: 'n1', opts: { kind: 'sync' } },
      ],
    });
  });
});
