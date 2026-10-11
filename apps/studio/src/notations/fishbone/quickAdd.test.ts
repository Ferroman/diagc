import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { fishboneQuickAdd } from './quickAdd';

const fish = (() => {
  const m = model('fish');
  m.fishbone('outage', 'Outage').category('code', 'Code').cause('migration', 'Migration').cause('sub', 'Sub');
  m.node('note', { name: 'a remark', type: 'comment' });
  return m.toJSON();
})();
const answer = (id: string) => {
  const out = fishboneQuickAdd({
    model: fish,
    source: fish.nodes.find((n) => n.id === id)!,
    ctx: { notation: 'fishbone', plane: undefined, borrowsContainment: false, penLayer: null },
    kindTo: () => 'sync',
  });
  return typeof out === 'object' ? out.label : out;
};

describe('fishboneQuickAdd', () => {
  it('grows the fish down to the depth addChild allows, and nothing off it', () => {
    expect(['outage', 'code', 'migration', 'sub', 'note'].map(answer)).toEqual([
      'Add a category',
      'Add a cause',
      'Add a cause',
      'none',
      'none',
    ]);
  });
});
