import { describe, expect, it } from 'vitest';
import { transitionLabelsPatch } from './transitionLabel';

describe('transitionLabelsPatch', () => {
  const stored = { labels: [{ id: 'transition', text: 'pay', t: 0.3 }] };

  it('leaves a transition with no stored label alone', () => {
    // Breaks if an edit of the parts starts storing a label nobody placed.
    expect(transitionLabelsPatch({}, { trigger: 'ship' })).toEqual({});
  });

  it('rewrites the stored text to the parts', () => {
    // Breaks if the stored label keeps text the parts no longer say.
    expect(transitionLabelsPatch(stored, { trigger: 'ship', guard: 'paid' })).toEqual({
      labels: [{ id: 'transition', text: 'ship [paid]', t: 0.3 }],
    });
  });

  it('drops the stored label once no part is left', () => {
    // Breaks if the stale text is drawn again after the last part is cleared.
    expect(transitionLabelsPatch(stored, {})).toEqual({ labels: null });
  });
});
