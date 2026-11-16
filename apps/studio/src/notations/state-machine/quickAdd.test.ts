import { describe, expect, it } from 'vitest';
import { SM_TRANSITION_KIND, type DiagramModel } from '@diagc/core/internal';
import { smConnectKind, stateMachineQuickAdd } from './quickAdd';

const sm: DiagramModel = {
  version: 1,
  id: 'sm',
  name: 'sm',
  relations: [],
  layers: [],
  planes: [],
  nodes: [
    { id: 'm', name: 'M', type: 'sm-machine' },
    { id: 'r', name: 'R', type: 'sm-region' },
    { id: 's', name: 'S', type: 'sm-state' },
    { id: 'i', name: '', type: 'sm-initial' },
    { id: 'c', name: '', type: 'sm-choice' },
    { id: 'f', name: '', type: 'sm-final' },
    { id: 'note', name: 'x', type: 'comment' },
  ],
  containment: [{ parent: 'm', child: 's' }],
};
const answer = (id: string) =>
  stateMachineQuickAdd({
    model: sm,
    source: sm.nodes.find((n) => n.id === id)!,
    ctx: { notation: 'state-machine', plane: undefined, borrowsContainment: false, penLayer: null },
    kindTo: () => 'sync',
  });
const built = (id: string) => {
  const a = answer(id);
  return typeof a === 'object' ? a.build() : undefined;
};

describe('stateMachineQuickAdd', () => {
  it('names what the + adds for each source', () => {
    const labels = ['s', 'i', 'c', 'r', 'm'].map((id) => {
      const a = answer(id);
      return typeof a === 'object' ? a.label : a;
    });
    expect(labels).toEqual([
      'Add the next state',
      'Add a state',
      'Add a state',
      'Add a state inside',
      'Add a state inside',
    ]);
    expect(answer('f')).toBeUndefined();
    expect(answer('note')).toBeUndefined();
  });

  it('a state, an initial and a choice grow a transition to a new state beside them, in the same parent', () => {
    for (const id of ['s', 'i', 'c']) {
      const b = built(id);
      expect(b?.beside).toBe(true);
      expect(b?.command).toMatchObject({
        type: 'batch',
        commands: [
          {
            type: 'add-node',
            node: { name: 'State', type: 'sm-state' },
            ...(id === 's' ? { parent: { id: 'm' } } : {}),
          },
          { type: 'add-relation', from: id, opts: { kind: SM_TRANSITION_KIND } },
        ],
      });
    }
  });

  it('a region and a machine take a state inside, with no transition', () => {
    for (const id of ['r', 'm']) {
      const b = built(id);
      expect(b?.beside).toBe(false);
      expect(b?.command).toMatchObject({
        type: 'batch',
        commands: [{ type: 'add-node', node: { name: 'State', type: 'sm-state' }, parent: { id } }],
      });
      expect((b?.command as { commands: unknown[] }).commands).toHaveLength(1);
    }
  });

  it('a connect draws a transition', () => {
    expect(smConnectKind()).toBe(SM_TRANSITION_KIND);
  });
});
