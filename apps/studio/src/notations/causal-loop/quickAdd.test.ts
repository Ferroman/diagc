import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { causalLoopQuickAdd } from './quickAdd';

describe('causalLoopQuickAdd', () => {
  it('offers nothing on a group, and leaves a variable to the generic sibling', () => {
    const m = model('cld');
    m.node('grp', { name: 'Demand' }).contains(m.node('inner', { name: 'Backlog' }));
    const j = m.toJSON();
    const src = (id: string) => ({
      model: j,
      source: j.nodes.find((n) => n.id === id)!,
      ctx: { notation: 'causal-loop' as const, plane: undefined, borrowsContainment: false, penLayer: null },
      kindTo: () => 'sync',
    });
    expect(causalLoopQuickAdd(src('grp'))).toBe('none');
    expect(causalLoopQuickAdd(src('inner'))).toBeUndefined();
  });
});
