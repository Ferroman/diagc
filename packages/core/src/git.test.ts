import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTATIONS, type DiagramModel, type DiagramNode, type DiagramRelation } from './types';
import { GIT_KINDS, GIT_NOTATION, gapOf, gitGraph, isGitKind, latestCommit, mergedAway } from './git';

const commit = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, name: '', type: 'commit', ...extra });
const link = (kind: string, from: string, to: string): DiagramRelation => ({ id: `${from}->${to}#${kind}`, from, to, kind });

/** master: m1 → m2 (gap 2); nightly: n1 (from m1) → n2 → n3 (merges t1); team: t1 (from n1); one stray */
function sample(): DiagramModel {
  return {
    version: 1,
    id: 'g',
    name: 'g',
    nodes: [
      { id: 'master', name: 'Master', type: 'branch', color: '#112233' },
      { id: 'nightly', name: 'Nightly', type: 'branch' },
      { id: 'team', name: 'Team', type: 'branch' },
      commit('m1', { name: '1.0' }),
      commit('m2', { name: '2.0', metadata: { gap: 2 } }),
      commit('n1'),
      commit('n2'),
      commit('n3'),
      commit('t1'),
      commit('stray'),
    ],
    containment: [
      { parent: 'master', child: 'm1' },
      { parent: 'master', child: 'm2' },
      { parent: 'nightly', child: 'n1' },
      { parent: 'nightly', child: 'n2' },
      { parent: 'nightly', child: 'n3' },
      { parent: 'team', child: 't1' },
    ],
    relations: [
      link('commit', 'm1', 'm2'),
      link('branch', 'm1', 'n1'),
      link('commit', 'n1', 'n2'),
      link('commit', 'n2', 'n3'),
      link('branch', 'n1', 't1'),
      link('merge', 't1', 'n3'),
    ],
    layers: [],
    planes: [{ id: 'git', name: 'Git', notation: 'git-graph' }],
  };
}

const cols = (g: ReturnType<typeof gitGraph>): Record<string, number> => Object.fromEntries(g.columns);

describe('git graph', () => {
  it('git-graph is a built-in notation with three link kinds', () => {
    expect(BUILTIN_NOTATIONS).toContain('git-graph');
    expect(GIT_NOTATION).toBe('git-graph');
    expect(GIT_KINDS).toEqual(['commit', 'branch', 'merge']);
    expect(isGitKind('merge')).toBe(true);
    expect(isGitKind('sync')).toBe(false);
  });

  it('lists lanes in declaration order with their commits, and the strays', () => {
    const g = gitGraph(sample(), 'git');
    expect(g.lanes.map((l) => l.id)).toEqual(['master', 'nightly', 'team']);
    expect(g.lanes.map((l) => l.commits.map((c) => c.id))).toEqual([['m1', 'm2'], ['n1', 'n2', 'n3'], ['t1']]);
    expect(g.laneOf.get('t1')).toBe('team');
    expect(g.strays.map((s) => s.id)).toEqual(['stray']);
    expect(g.cycleEdges).toEqual([]);
  });

  it('puts every commit one column past all its parents, plus its gap', () => {
    expect(cols(gitGraph(sample(), 'git'))).toEqual({ m1: 0, m2: 3, n1: 1, n2: 2, n3: 3, t1: 2, stray: 0 });
  });

  it('only git-kind links between commits count', () => {
    const m = sample();
    m.relations.push(link('sync', 'm2', 'n2'));
    expect(cols(gitGraph(m, 'git')).n2).toBe(2);
  });

  it('latestCommit is the rightmost commit, the later declared on a tie, undefined on an empty lane', () => {
    const m = sample();
    m.nodes.push({ id: 'empty', name: 'Empty', type: 'branch' }, commit('x1'), commit('x2'));
    m.nodes.push({ id: 'tie', name: 'Tie', type: 'branch' });
    m.containment.push({ parent: 'tie', child: 'x1' }, { parent: 'tie', child: 'x2' });
    const g = gitGraph(m, 'git');
    expect(latestCommit(g, 'nightly')?.id).toBe('n3');
    expect(latestCommit(g, 'master')?.id).toBe('m2');
    expect(latestCommit(g, 'tie')?.id).toBe('x2');
    expect(latestCommit(g, 'empty')).toBeUndefined();
  });

  it('gapOf reads an integer or a digit string and ignores anything else', () => {
    expect(gapOf(commit('a', { metadata: { gap: 2 } }))).toBe(2);
    expect(gapOf(commit('a', { metadata: { gap: '3' } }))).toBe(3);
    expect(gapOf(commit('a', { metadata: { gap: -1 } }))).toBe(0);
    expect(gapOf(commit('a', { metadata: { gap: 1.5 } }))).toBe(0);
    expect(gapOf(commit('a', { metadata: { gap: 'x' } }))).toBe(0);
    expect(gapOf(commit('a'))).toBe(0);
  });

  it('mergedAway is true only for a commit with an outgoing merge link', () => {
    const m = sample();
    expect(mergedAway(m, 't1')).toBe(true);
    expect(mergedAway(m, 'n3')).toBe(false);
  });

  it('cuts a cycle at the earliest-declared remaining commit and reports the dropped links', () => {
    const m = sample();
    m.relations.push(link('merge', 'n3', 'n1'));
    const g = gitGraph(m, 'git');
    expect(g.cycleEdges).toEqual(['n3->n1#merge']);
    expect(cols(g)).toEqual({ m1: 0, m2: 3, n1: 1, n2: 2, n3: 3, t1: 2, stray: 0 });
  });

  it('resolves containment per plane, borrowing like the view does', () => {
    const m = sample();
    m.planes.push({ id: 'other', name: 'Other', containmentOf: 'git' });
    m.containment.push({ parent: 'team', child: 'n2', plane: 'x' }); // another plane's edge: ignored
    m.planes.push({ id: 'x', name: 'X' });
    expect(gitGraph(m, 'other').laneOf.get('n2')).toBe('nightly');
    expect(gitGraph(m, 'git').laneOf.get('n2')).toBe('nightly');
    expect(gitGraph(m, 'x').lanes.find((l) => l.id === 'team')?.commits.map((c) => c.id)).toEqual(['n2']);
  });
});
