import { describe, expect, it } from 'vitest';
import { fishboneTree, model, type DiagramModel } from '@diagramming/core';
import { addChild, addEffect, isSubCause, seedCategories } from './fishboneActions';

function fish(): DiagramModel {
  const m = model('f');
  const fb = m.fishbone('e', 'Effect');
  fb.category('c', 'Code').cause('a', 'A').cause('a1', 'A1');
  return m.toJSON();
}

describe('fishboneActions', () => {
  it('adds an effect, on the given plane', () => {
    const out = addEffect(fish(), 'p');
    expect(out).toEqual({ id: 'effect', command: { type: 'add-node', node: { id: 'effect', name: '', type: 'fb-effect', plane: 'p' } } });
  });

  it('adds the child the parent can take — category, cause, sub-cause — wired to it in one batch', () => {
    const m = fish();
    expect(addChild(m, 'e')).toEqual({
      id: 'category',
      command: {
        type: 'batch',
        commands: [
          { type: 'add-node', node: { id: 'category', name: '', type: 'fb-category' } },
          { type: 'add-relation', from: 'category', to: 'e', opts: { kind: 'cause-of' } },
        ],
      },
    });
    expect(addChild(m, 'c')?.command).toMatchObject({ commands: [{ node: { type: 'fb-cause' } }, { from: 'cause', to: 'c' }] });
    expect(addChild(m, 'a')?.command).toMatchObject({ commands: [{ node: { type: 'fb-cause' } }, { from: 'cause', to: 'a' }] });
  });

  it('refuses a fourth level, a non-fishbone parent and an unknown id', () => {
    const m = fish();
    expect(addChild(m, 'a1')).toBeNull();
    expect(addChild({ ...m, nodes: [...m.nodes, { id: 'n', name: 'n' }] }, 'n')).toBeNull();
    expect(addChild(m, 'nope')).toBeNull();
  });

  it('inherits the parent plane tag and keeps ids unique', () => {
    const m = fish();
    const tagged: DiagramModel = { ...m, nodes: m.nodes.map((n) => (n.id === 'c' ? { ...n, plane: 'p' } : n)) };
    const withCause = { ...tagged, nodes: [...tagged.nodes, { id: 'cause', name: '' }] };
    const out = addChild(withCause, 'c');
    expect(out?.id).toBe('cause-2');
    // toMatchObject requires equal array lengths for an array-valued property,
    // so the expected commands list matches the batch's full two commands
    // (as the earlier "adds the child..." test does), not just the first.
    expect(out?.command).toMatchObject({ commands: [{ node: { plane: 'p' } }, { to: 'c' }] });
  });

  it('seeds a preset as one batch of categories hung on the effect', () => {
    const m = model('f');
    m.fishbone('e', 'Effect');
    const out = seedCategories(m.toJSON(), 'e', '4S');
    expect(out?.ids).toEqual(['surroundings', 'suppliers', 'systems', 'skills']);
    // toMatchObject requires equal array lengths for an array-valued property,
    // so the first pair is checked against the same-length slice rather than
    // the full (8-command) batch, which the toHaveLength below covers instead.
    expect((out?.command as { commands: unknown[] }).commands.slice(0, 2)).toMatchObject([
      { type: 'add-node', node: { id: 'surroundings', name: 'Surroundings', type: 'fb-category' } },
      { type: 'add-relation', from: 'surroundings', to: 'e', opts: { kind: 'cause-of' } },
    ]);
    expect((out?.command as { commands: unknown[] }).commands).toHaveLength(8);
    expect(seedCategories(m.toJSON(), 'nope', '4S')).toBeNull();
  });

  it('seeds ids unique against the model too, not just the batch: a taken slug falls back to uniqueNodeId\'s -2 suffix', () => {
    const m = model('f');
    m.fishbone('e', 'Effect');
    const j = m.toJSON();
    const withSystems: DiagramModel = { ...j, nodes: [...j.nodes, { id: 'systems', name: 'Taken' }] };
    const out = seedCategories(withSystems, 'e', '4S');
    expect(out?.ids).toEqual(['surroundings', 'suppliers', 'systems-2', 'skills']);
  });

  it('isSubCause: true only for a sub-cause, false for a cause, a category and an unknown id', () => {
    const tree = fishboneTree(fish());
    expect(isSubCause(tree, 'a1')).toBe(true);
    expect(isSubCause(tree, 'a')).toBe(false);
    expect(isSubCause(tree, 'c')).toBe(false);
    expect(isSubCause(tree, 'nope')).toBe(false);
  });
});
