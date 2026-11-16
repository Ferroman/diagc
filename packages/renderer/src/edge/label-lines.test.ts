import { describe, expect, it } from 'vitest';
import { SM_TRANSITION_KIND } from '@diagc/core/internal';
import { labelLines, wrapsLabel } from './label-lines';
import { EDGE_LABEL_MAX_CHARS } from '../node/label-size';

describe('wrapsLabel', () => {
  it('wraps a transition and cuts every other kind', () => {
    expect(wrapsLabel(SM_TRANSITION_KIND)).toBe(true);
    expect(wrapsLabel('uses')).toBe(false);
    expect(wrapsLabel(undefined)).toBe(false);
  });
});

describe('labelLines', () => {
  it('leaves a label that fits on one line', () => {
    expect(labelLines('pay [total > 0] / charge')).toEqual(['pay [total > 0] / charge']);
  });

  it('breaks before the effect, keeping the slash with it', () => {
    expect(labelLines('requestEdit [owns d] / send load')).toEqual(['requestEdit [owns d]', '/ send load']);
  });

  it('keeps a bracketed guard on one line while it fits', () => {
    expect(labelLines('reloadPage [clean and idle]')).toEqual(['reloadPage', '[clean and idle]']);
  });

  it('breaks inside a guard too long for a line', () => {
    expect(labelLines('go [the cart is not empty and paid]')).toEqual(['go [the cart is not', 'empty and paid]']);
  });

  it('keeps every line within the budget and loses no word', () => {
    const text = 'autosaveFires [dirty and not saving] / startSave then notify the watchers';
    const lines = labelLines(text);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(EDGE_LABEL_MAX_CHARS);
    expect(lines.join(' ')).toBe(text);
  });

  it('cuts a word longer than a line into pieces', () => {
    const word = 'x'.repeat(EDGE_LABEL_MAX_CHARS + 5);
    // the slash cannot ride with an effect that fills a line on its own
    expect(labelLines(`go / ${word}`)).toEqual(['go /', 'x'.repeat(EDGE_LABEL_MAX_CHARS), 'xxxxx']);
  });

  it('collapses runs of spaces', () => {
    expect(labelLines('  go   [ok]  ')).toEqual(['go [ok]']);
  });

  it('gives nothing for an empty label', () => {
    expect(labelLines('   ')).toEqual([]);
  });
});
