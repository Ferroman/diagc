// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_HISTORY_TYPE,
  SM_TERMINATE_TYPE,
} from '@diagc/core/internal';
import { renderBody } from './render-body';

const glyph = (typeId: string, extra = {}) => renderBody({ typeId, label: '', ...extra });

describe('SmGlyphBody', () => {
  it('draws shallow history as H and deep history as H*', () => {
    expect(glyph(SM_HISTORY_TYPE).querySelector('.dg-sm-glyph')?.textContent).toBe('H');
    expect(glyph(SM_DEEP_HISTORY_TYPE).querySelector('.dg-sm-glyph')?.textContent).toBe('H*');
  });

  it('draws an exit point as an X inside a circle', () => {
    const c = glyph(SM_EXIT_TYPE);
    expect(c.querySelector('.dg-sm-ring')).not.toBeNull();
    expect(c.querySelector('[data-testid="sm-exit-x"]')).not.toBeNull();
  });

  it('draws terminate as an X with no circle', () => {
    const c = glyph(SM_TERMINATE_TYPE);
    expect(c.querySelector('[data-testid="sm-terminate-x"]')).not.toBeNull();
    expect(c.querySelector('.dg-sm-ring')).toBeNull();
  });

  it('draws an entry point as an empty circle', () => {
    const c = glyph(SM_ENTRY_TYPE);
    expect(c.querySelector('.dg-sm-ring')).not.toBeNull();
    expect(c.querySelector('svg')).toBeNull();
    expect(c.querySelector('.dg-sm-glyph')?.textContent).toBe('');
  });

  it('ignores color, as the neutral glyphs do', () => {
    for (const type of [SM_HISTORY_TYPE, SM_ENTRY_TYPE, SM_EXIT_TYPE, SM_TERMINATE_TYPE]) {
      const c = glyph(type, { color: '#ff0000' });
      expect(c.innerHTML).not.toContain('#ff0000');
      expect(c.innerHTML).not.toContain('rgb(255, 0, 0)');
    }
  });

  it('hangs its name below as a caption', () => {
    const c = glyph(SM_ENTRY_TYPE, { label: 'in' });
    expect(c.querySelector('.dg-glyph-caption')?.textContent).toBe('in');
  });
});
