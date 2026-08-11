// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyTheme, darkTheme, lightTheme, themeToCssVars } from './theme';

describe('theme', () => {
  it('emits --dg- prefixed css vars for every token', () => {
    const vars = themeToCssVars(lightTheme);
    expect(vars['--dg-bg']).toBe(lightTheme.bg);
    expect(vars['--dg-node-fill']).toBe(lightTheme.nodeFill);
    expect(Object.keys(vars)).toHaveLength(Object.keys(lightTheme).length);
    expect(Object.keys(vars).every((k) => k.startsWith('--dg-'))).toBe(true);
  });

  it('applies vars to an element', () => {
    const el = document.createElement('div');
    applyTheme(el, darkTheme);
    expect(el.style.getPropertyValue('--dg-bg')).toBe(darkTheme.bg);
  });

  it('light and dark define the same token set', () => {
    expect(Object.keys(darkTheme).sort()).toEqual(Object.keys(lightTheme).sort());
  });

  it('defines table tokens in both themes', () => {
    for (const t of [lightTheme, darkTheme]) {
      const vars = themeToCssVars(t);
      expect(vars['--dg-table-header-bg']).toBeDefined();
      expect(vars['--dg-table-border']).toBeDefined();
      expect(vars['--dg-table-pk']).toBeDefined();
    }
  });
});
