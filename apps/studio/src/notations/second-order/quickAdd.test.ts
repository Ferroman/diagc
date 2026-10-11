import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { secondOrderQuickAdd } from './quickAdd';

describe('secondOrderQuickAdd', () => {
  it('asks "and then what?" of a decision or a consequence, and of nothing else', () => {
    const m = model('so');
    m.secondOrder().decision('d', 'Ship it').then('c1', 'Users churn', { valence: '-' });
    m.node('note', { name: 'x', type: 'comment' });
    const j = m.toJSON();
    const answer = (id: string) => {
      const out = secondOrderQuickAdd({
        model: j,
        source: j.nodes.find((n) => n.id === id)!,
        ctx: { notation: 'second-order', plane: undefined, borrowsContainment: false, penLayer: null },
        kindTo: () => 'sync',
      });
      return typeof out === 'object' ? out.label : out;
    };
    expect(['d', 'c1', 'note'].map(answer)).toEqual(['And then what?', 'And then what?', 'none']);
  });
});
