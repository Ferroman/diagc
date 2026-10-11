import { describe, expect, it } from 'vitest';
import { TM_FLOW_KIND, model } from '@diagc/core/internal';
import { threatModelQuickAdd } from './quickAdd';

const tm = (() => {
  const m = model('tm');
  const t = m.threatModel();
  t.boundary('dmz', 'DMZ').contains(t.process('web', 'Web app'));
  m.node('note', { name: 'x', type: 'comment' });
  return m.toJSON();
})();
const answer = (id: string) =>
  threatModelQuickAdd({
    model: tm,
    source: tm.nodes.find((n) => n.id === id)!,
    ctx: { notation: 'threat-model', plane: undefined, borrowsContainment: false, penLayer: null },
    kindTo: () => 'sync',
  });

describe('threatModelQuickAdd', () => {
  it('a boundary takes a process inside, an element a flow, a stray node the generic sibling', () => {
    expect([answer('dmz'), answer('web')].map((a) => typeof a === 'object' && a.label)).toEqual([
      'Add a process inside',
      'Add a flow to a new process',
    ]);
    expect(answer('note')).toBeUndefined();
  });

  it('draws the flow as a data flow whatever the connect gesture would', () => {
    const flow = answer('web');
    const built = typeof flow === 'object' ? flow.build() : undefined;
    expect(built?.command).toMatchObject({ commands: [{}, { opts: { kind: TM_FLOW_KIND } }] });
  });
});
