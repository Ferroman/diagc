// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGallery } from './gallery';
import { THEME_HEAD_SCRIPT, THEME_STORAGE_KEY, THEME_SWITCH, themeCss } from './pageTheme';

// The pieces are inline scripts in generated HTML, so they are run here the way a
// browser runs them: as the text between the tags.
const run = (html: string): void => {
  new Function(/<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '')();
};
const system = (dark: boolean): void => {
  vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener: () => {} }));
};
const mount = (): HTMLButtonElement => {
  document.body.innerHTML = THEME_SWITCH.replace(/<script>[\s\S]*<\/script>/, '');
  run(THEME_SWITCH);
  return document.getElementById('dg-theme') as HTMLButtonElement;
};
const marked = (): string | undefined => document.documentElement.dataset['theme'];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
  document.body.innerHTML = '';
});

describe('the head script', () => {
  it('marks the root with a remembered theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    run(THEME_HEAD_SCRIPT);
    expect(marked()).toBe('dark');
  });

  it('leaves the root alone when nothing is remembered, or the value is not a theme', () => {
    run(THEME_HEAD_SCRIPT);
    expect(marked()).toBeUndefined();
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    run(THEME_HEAD_SCRIPT);
    expect(marked()).toBeUndefined();
  });

  it('survives a store that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => run(THEME_HEAD_SCRIPT)).not.toThrow();
  });
});

describe('the switch', () => {
  it('is hidden in the markup, and shows itself offering the other theme', () => {
    expect(THEME_SWITCH).toContain('<button type="button" id="dg-theme" hidden>');
    system(false);
    const button = mount();
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
    expect(button.textContent).toBe('☾');
  });

  it("remembers a theme that differs from the system's, and forgets it on the way back", () => {
    system(false);
    const button = mount();
    button.click();
    expect(marked()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');
    expect(button.textContent).toBe('☀');
    button.click();
    expect(marked()).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('offers light on a dark system', () => {
    system(true);
    expect(mount().getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('follows a choice made on another page', () => {
    system(false);
    const button = mount();
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    expect(marked()).toBe('dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('still switches when the store throws', () => {
    system(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const button = mount();
    button.click();
    expect(marked()).toBe('dark');
  });
});

describe('themeCss', () => {
  it('gives the dark set to a dark system and to a forced dark root, and lets light be forced', () => {
    const css = themeCss('--bg:#fff', '--bg:#000');
    expect(css).toContain(':root{color-scheme:light dark;--bg:#fff}');
    expect(css).toContain('@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#000}}');
    expect(css).toContain(':root[data-theme=dark]{color-scheme:dark;--bg:#000}');
    expect(css).toContain(':root[data-theme=light]{color-scheme:light}');
  });
});

describe('the index page', () => {
  const html = buildGallery([{ name: 'shop', title: 'Shop', hasImage: true }], { link: 'https://example.com/repo' });

  it('applies the remembered theme before its styles are read', () => {
    expect(html).toContain(THEME_HEAD_SCRIPT);
    expect(html.indexOf(THEME_HEAD_SCRIPT)).toBeLessThan(html.indexOf('<style>'));
  });

  it('carries both colour sets and the switch', () => {
    expect(html).toContain(':root[data-theme=dark]');
    expect(html).toContain('id="dg-theme"');
    // no page colour is left written into a rule
    expect(html).not.toMatch(/background:#fafafa|color:#222|border:1px solid #ddd/);
  });
});
