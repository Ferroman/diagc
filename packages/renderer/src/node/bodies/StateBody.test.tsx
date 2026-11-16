// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SM_STATE_TYPE } from '@diagc/core/internal';
import { renderBody } from './render-body';

const base = { typeId: SM_STATE_TYPE, label: 'Reserved' };

describe('StateBody', () => {
  it('draws a leaf with its name, a divider and one line per behaviour', () => {
    const c = renderBody({ ...base, behaviors: ['entry / reserveStock', 'remind [overdue] / email'] });
    expect(c.querySelector('.dg-sm-state-name')?.textContent).toBe('Reserved');
    expect(c.querySelector('.dg-sm-divider')).not.toBeNull();
    const lines = [...c.querySelectorAll('.dg-sm-behavior')].map((l) => l.textContent);
    expect(lines).toEqual(['entry / reserveStock', 'remind [overdue] / email']);
  });

  it('draws no divider for a leaf without behaviours', () => {
    const c = renderBody(base);
    expect(c.querySelector('.dg-sm-divider')).toBeNull();
    expect(c.querySelector('.dg-sm-behavior')).toBeNull();
  });

  it('draws a folded composite with the composite glyph and its behaviours', () => {
    const c = renderBody({ ...base, state: 'collapsed', composite: true, behaviors: ['entry / x'] });
    expect(c.querySelector('[data-testid="sm-composite-glyph"]')).not.toBeNull();
    expect([...c.querySelectorAll('.dg-sm-behavior')].map((l) => l.textContent)).toEqual(['entry / x']);
  });

  it('draws an expanded composite with its name in a header and no glyph', () => {
    const c = renderBody({ ...base, state: 'expanded', composite: true });
    expect(c.querySelector('.dg-group-header')?.textContent).toContain('Reserved');
    expect(c.querySelector('[data-testid="sm-composite-glyph"]')).toBeNull();
    expect(c.querySelector('.dg-sm-divider')).toBeNull();
  });

  it("lists an expanded composite's behaviours under its header", () => {
    const c = renderBody({ ...base, state: 'expanded', composite: true, behaviors: ['entry / x', 'exit / y'] });
    const compartment = c.querySelector('.dg-group-header + .dg-sm-open-behaviors');
    expect([...(compartment?.querySelectorAll('.dg-sm-behavior') ?? [])].map((l) => l.textContent)).toEqual([
      'entry / x',
      'exit / y',
    ]);
  });
});
