import { describe, expect, it } from 'vitest';
import { validate } from '../../validate/index';
import type { DiagramModel } from '../../types';

function emptyModel(): DiagramModel {
  return { version: 1, id: 'm', name: 'm', nodes: [], containment: [], relations: [], layers: [], planes: [] };
}

describe('validate: git graph', () => {
  /** master: m1 → m2; nightly: n1 (from m1) → n2 (merges t1); team: t1 (from n1) */
  function gitModel(): DiagramModel {
    const commit = (id: string): DiagramModel['nodes'][number] => ({ id, name: '', type: 'commit' });
    return {
      ...emptyModel(),
      nodes: [
        { id: 'master', name: 'Master', type: 'branch' },
        { id: 'nightly', name: 'Nightly', type: 'branch' },
        { id: 'team', name: 'Team', type: 'branch' },
        commit('m1'),
        commit('m2'),
        commit('n1'),
        commit('n2'),
        commit('t1'),
      ],
      containment: [
        { parent: 'master', child: 'm1' },
        { parent: 'master', child: 'm2' },
        { parent: 'nightly', child: 'n1' },
        { parent: 'nightly', child: 'n2' },
        { parent: 'team', child: 't1' },
      ],
      relations: [
        { id: 'a', from: 'm1', to: 'm2', kind: 'commit' },
        { id: 'b', from: 'm1', to: 'n1', kind: 'branch' },
        { id: 'c', from: 'n1', to: 'n2', kind: 'commit' },
        { id: 'd', from: 'n1', to: 't1', kind: 'branch' },
        { id: 'e', from: 't1', to: 'n2', kind: 'merge' },
      ],
      planes: [{ id: 'git', name: 'Git', notation: 'git-graph' }],
    };
  }

  it('accepts a well-formed graph', () => {
    expect(validate(gitModel())).toEqual([]);
  });

  it('ignores the git rules on a model with no git-graph plane', () => {
    const m = gitModel();
    m.planes = [{ id: 'git', name: 'Git' }];
    m.relations.push({ id: 'x', from: 'master', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([]);
  });

  it('git-link-endpoints: git links must join two commit nodes', () => {
    const m = gitModel();
    m.relations.push({ id: 'x', from: 'master', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-link-endpoints', message: "Relation 'x' (merge) must join two commit nodes", ref: 'x' },
    ]);
  });

  it('git-commit-lane: commit links stay in a lane, branch/merge links cross lanes', () => {
    const m = gitModel();
    m.relations.push(
      { id: 'x', from: 'm2', to: 'n2', kind: 'commit' },
      { id: 'y', from: 'm1', to: 'm2', kind: 'merge' },
    );
    expect(validate(m)).toEqual([
      { code: 'git-commit-lane', message: "Relation 'x' (commit) must stay within one lane", ref: 'x' },
      { code: 'git-commit-lane', message: "Relation 'y' (merge) must join commits of different lanes", ref: 'y' },
    ]);
  });

  it('git-parents: at most one incoming commit link and one incoming branch link', () => {
    const m = gitModel();
    m.nodes.push({ id: 'n0', name: '', type: 'commit' });
    m.containment.push({ parent: 'nightly', child: 'n0' });
    m.relations.push({ id: 'x', from: 'n0', to: 'n2', kind: 'commit' });
    expect(validate(m)).toEqual([
      { code: 'git-parents', message: "Commit 'n2' has more than one incoming commit link", ref: 'n2' },
    ]);
  });

  it('git-cycle: the git links must not form a cycle', () => {
    const m = gitModel();
    m.relations.push({ id: 'x', from: 'n2', to: 'n1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-commit-lane', message: "Relation 'x' (merge) must join commits of different lanes", ref: 'x' },
      { code: 'git-cycle', message: "Git links form a cycle (cut at relation 'x')", ref: 'x' },
    ]);
  });

  it('git-cycle: a cycle formed ENTIRELY of cross-lane links reports only the cycle, not git-commit-lane', () => {
    const m = gitModel();
    // the fixture already branches master -> nightly (m1->n1); merge nightly
    // back into master (n1->m1) closes the loop without ever repeating a lane,
    // so no relation here is a same-lane branch/merge or a cross-lane commit.
    m.relations.push({ id: 'x', from: 'n1', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-cycle', message: "Git links form a cycle (cut at relation 'x')", ref: 'x' },
    ]);
  });

  it('git-commit-outside-lane: a commit must sit in a branch on the git plane', () => {
    const m = gitModel();
    m.nodes.push({ id: 'loose', name: '', type: 'commit' });
    expect(validate(m)).toEqual([
      {
        code: 'git-commit-outside-lane',
        message: "Commit 'loose' is not contained by a branch on plane 'git'",
        ref: 'loose',
      },
    ]);
  });

  it('git-gap: a commit gap is a non-negative integer or a digit string', () => {
    const m = gitModel();
    m.nodes[3] = { ...m.nodes[3]!, metadata: { gap: '2' } };
    m.nodes[4] = { ...m.nodes[4]!, metadata: { gap: -1 } };
    expect(validate(m)).toEqual([{ code: 'git-gap', message: "Commit 'm2' has invalid gap '-1'", ref: 'm2' }]);
  });

  it('fires from a model-level git-graph notation with no planes at all', () => {
    const m = gitModel();
    m.planes = [];
    m.notation = 'git-graph';
    m.nodes.push({ id: 'loose', name: '', type: 'commit' });
    expect(validate(m)).toEqual([
      { code: 'git-commit-outside-lane', message: "Commit 'loose' is not contained by a branch", ref: 'loose' },
    ]);
  });

  it('validates a plane with no notation of its own when the model falls back to git-graph', () => {
    const m = gitModel();
    m.planes = [{ id: 'git', name: 'Git' }]; // no plane-level notation; model.notation applies
    m.notation = 'git-graph';
    m.relations.push({ id: 'x', from: 'master', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-link-endpoints', message: "Relation 'x' (merge) must join two commit nodes", ref: 'x' },
    ]);
  });
});
