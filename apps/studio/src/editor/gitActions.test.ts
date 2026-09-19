import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagramming/core';
import { appendCommit } from './gitActions';

/** master: master-1 → master-2; nightly: nightly-1 (from master-1); dev: empty */
function git(): DiagramModel {
  const m = model('g');
  const g = m.gitGraph();
  const master = g.branch('master', { name: 'Master' });
  const nightly = g.branch('nightly', { name: 'Nightly' });
  g.branch('dev', { name: 'Dev' });
  const v10 = master.commit('1.0');
  master.commit('2.0');
  nightly.commit({ from: v10 });
  return m.toJSON();
}

describe('appendCommit', () => {
  it('appends to the lane tip as one batch: node in the lane, linked from the latest commit', () => {
    const out = appendCommit(git(), 'git-graph', 'master');
    expect(out.id).toBe('master-3');
    expect(out.command).toEqual({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'master-3', name: '', type: 'commit' }, parent: { id: 'master', plane: 'git-graph' } },
        { type: 'add-relation', from: 'master-2', to: 'master-3', opts: { kind: 'commit' } },
      ],
    });
  });

  it('a first commit on an empty lane has no link; tag and gap land on the node', () => {
    const out = appendCommit(git(), 'git-graph', 'dev', { tag: 'RC1', gap: 2 });
    expect(out.command).toEqual({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'dev-1', name: 'RC1', type: 'commit', metadata: { gap: 2 } }, parent: { id: 'dev', plane: 'git-graph' } },
      ],
    });
  });

  it('the base view files the containment under the default plane, and a zero gap adds no metadata', () => {
    const out = appendCommit(git(), undefined, 'nightly', { gap: 0 });
    expect(out.command).toMatchObject({
      commands: [{ type: 'add-node', node: { id: 'nightly-2', name: '', type: 'commit' }, parent: { id: 'nightly', plane: 'git-graph' } }, { from: 'nightly-1', to: 'nightly-2' }],
    });
    expect((out.command as { commands: { node?: { metadata?: unknown } }[] }).commands[0]?.node?.metadata).toBeUndefined();
  });
});
