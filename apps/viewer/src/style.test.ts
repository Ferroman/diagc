import { describe, expect, it } from 'vitest';
import { canSwitchStyle, resolveStyle } from './style';

describe('resolveStyle', () => {
  it("draws the diagram's own style, and clean where it has none or names one the page does not know", () => {
    expect(resolveStyle({ param: null, picked: undefined, own: 'sketch' })).toBe('sketch');
    expect(resolveStyle({ param: null, picked: undefined, own: undefined })).toBe('clean');
    expect(resolveStyle({ param: null, picked: undefined, own: 'retired' })).toBe('clean');
  });

  it("puts the reader's pick above the diagram's own", () => {
    expect(resolveStyle({ param: null, picked: 'neon', own: 'sketch' })).toBe('neon');
    expect(resolveStyle({ param: null, picked: 'retired', own: 'sketch' })).toBe('sketch');
  });

  it('puts the URL above everything, and ignores one it does not know', () => {
    expect(resolveStyle({ param: 'dos', picked: 'neon', own: 'sketch' })).toBe('dos');
    expect(resolveStyle({ param: 'retired', picked: 'neon', own: 'sketch' })).toBe('neon');
    expect(resolveStyle({ param: '', picked: undefined, own: undefined })).toBe('clean');
  });
});

describe('canSwitchStyle', () => {
  it('lets the reader switch on a plain page', () => {
    expect(canSwitchStyle({ exportMode: false, param: null })).toBe(true);
  });

  it('offers no switch in an export, nor where the URL set the style', () => {
    expect(canSwitchStyle({ exportMode: true, param: null })).toBe(false);
    expect(canSwitchStyle({ exportMode: false, param: 'dos' })).toBe(false);
    // an unknown style in the URL sets nothing, so the switch stays
    expect(canSwitchStyle({ exportMode: false, param: 'retired' })).toBe(true);
  });
});
