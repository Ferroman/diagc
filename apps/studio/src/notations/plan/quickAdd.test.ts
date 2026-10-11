import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
import { planQuickAdd } from './quickAdd';

/** build (Feb 2 – Feb 27) holding the event m1; an undated zone; alice */
const schedule: DiagramModel = (() => {
  const m = model('s');
  const p = m.plan();
  p.zone('build', { start: '2026-02-02', end: '2026-02-27' }).event('m1', { at: '2026-02-16' });
  p.person('alice', 'Alice');
  const j = m.toJSON();
  j.nodes.push({ id: 'undated', name: 'Undated', type: 'plan-zone' });
  return j;
})();
const answer = (id: string) =>
  planQuickAdd({
    model: schedule,
    source: schedule.nodes.find((n) => n.id === id)!,
    ctx: { notation: 'plan', plane: 'plan', borrowsContainment: false, penLayer: null },
    kindTo: (to) => `kind-to-${to}`,
  });

describe('planQuickAdd', () => {
  it('a dated zone or event grows its successor, an undated one nothing, anything else the generic sibling', () => {
    expect([answer('build'), answer('m1')].map((a) => typeof a === 'object' && a.label)).toEqual([
      'Add the next zone',
      'Add the next event',
    ]);
    expect(answer('undated')).toBe('none');
    expect(answer('alice')).toBeUndefined();
  });

  it('links the successor with the kind the connect gesture would draw', () => {
    const next = answer('build');
    const built = typeof next === 'object' ? next.build() : undefined;
    expect(built?.command).toMatchObject({ commands: [{}, { opts: { kind: `kind-to-${built?.id}` } }] });
  });
});
