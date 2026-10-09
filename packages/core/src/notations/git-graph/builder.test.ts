import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';

describe('builder: git graph DSL', () => {
  it('declares the git plane first and emits lanes, commits and links', () => {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master', { name: 'Master', color: '#7ba7d9' });
    const nightly = g.branch('nightly');
    const v10 = master.commit('1.0');
    const n1 = nightly.commit({ from: v10 });
    const n2 = nightly.commit();
    const v20 = master.merge(n2, { tag: '2.0', gap: 2 });
    const json = m.toJSON();
    expect(json.planes).toEqual([{ id: 'git-graph', name: 'Git graph', notation: 'git-graph' }]);
    expect(json.nodes).toEqual([
      { id: 'master', name: 'Master', type: 'branch', color: '#7ba7d9' },
      { id: 'nightly', name: 'nightly', type: 'branch' },
      { id: 'master-1', name: '1.0', type: 'commit' },
      { id: 'nightly-1', name: '', type: 'commit' },
      { id: 'nightly-2', name: '', type: 'commit' },
      { id: 'master-2', name: '2.0', type: 'commit', metadata: { gap: 2 } },
    ]);
    expect(json.containment).toEqual([
      { parent: 'master', child: 'master-1' },
      { parent: 'nightly', child: 'nightly-1' },
      { parent: 'nightly', child: 'nightly-2' },
      { parent: 'master', child: 'master-2' },
    ]);
    expect(json.relations).toEqual([
      { id: 'master-1->nightly-1#0', from: 'master-1', to: 'nightly-1', kind: 'branch' },
      { id: 'nightly-1->nightly-2#0', from: 'nightly-1', to: 'nightly-2', kind: 'commit' },
      { id: 'nightly-2->master-2#0', from: 'nightly-2', to: 'master-2', kind: 'merge' },
      { id: 'master-1->master-2#0', from: 'master-1', to: 'master-2', kind: 'commit' },
    ]);
    expect(n1.id).toBe('nightly-1');
    expect(v20.branch).toBe(master);
  });

  it('a commit may name its id and colour, and is an ordinary NodeRef', () => {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master');
    const v1 = master.commit({ id: 'v1', tag: '1.0', color: '#fff' });
    const note = m.node('note', { type: 'comment' });
    m.relate(v1, note, { kind: 'sync' });
    const json = m.toJSON();
    expect(json.nodes[1]).toEqual({ id: 'v1', name: '1.0', type: 'commit', color: '#fff' });
    expect(json.relations).toEqual([{ id: 'v1->note#0', from: 'v1', to: 'note', kind: 'sync' }]);
  });

  it('gitGraph options name the plane', () => {
    const m = model('g');
    m.gitGraph({ plane: 'history', name: 'History' });
    expect(m.toJSON().planes).toEqual([{ id: 'history', name: 'History', notation: 'git-graph' }]);
  });

  it('refuses a git plane that would not be the default plane, and a second git plane', () => {
    const m = model('g');
    m.plane('arch');
    expect(() => m.gitGraph()).toThrow('gitGraph() must come before plane()');
    const m2 = model('g2');
    m2.gitGraph();
    expect(() => m2.gitGraph()).toThrow('gitGraph() already declared');
  });

  it('refuses from on the same lane and merging a lane into itself', () => {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master');
    const v1 = master.commit('1.0');
    expect(() => master.commit({ from: v1 })).toThrow('use commit() to continue a lane');
    expect(() => master.merge(v1)).toThrow('cannot merge a lane into itself');
  });
});
