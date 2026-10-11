import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { gitGraphQuickAdd } from './quickAdd';

/** master: master-1 → master-2; dev: empty; a comment */
const graph = (() => {
  const m = model('g');
  const g = m.gitGraph();
  const master = g.branch('master', { name: 'Master' });
  g.branch('dev', { name: 'Dev' });
  master.commit('1.0');
  master.commit('2.0');
  m.node('note', { name: 'a remark', type: 'comment' });
  return m.toJSON();
})();
const answer = (id: string) =>
  gitGraphQuickAdd({
    model: graph,
    source: graph.nodes.find((n) => n.id === id)!,
    ctx: { notation: 'git-graph', plane: undefined, borrowsContainment: false, penLayer: null },
    kindTo: () => 'sync',
  });

describe('gitGraphQuickAdd', () => {
  it("grows a lane, or its tip commit's lane, and nothing else", () => {
    const [first, tip] = graph.nodes.filter((n) => n.type === 'commit').map((n) => n.id);
    expect([answer('master'), answer('dev'), answer(tip!)].map((a) => typeof a === 'object' && a.label)).toEqual([
      'Add a commit',
      'Add a commit',
      'Add a commit',
    ]);
    expect(answer(first!)).toBe('none');
    expect(answer('note')).toBe('none');
  });
});
