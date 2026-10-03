// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findHome } from './home';

// site/site.js run against site/index.html, the pair the site ships. The script is a
// plain one (no module syntax), so it is evaluated here the way a <script> tag runs it.
const root = findHome(fileURLToPath(import.meta.url)).root;
const read = (f: string): string => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const page = read(path.join(root, 'site', 'index.html'));
const script = read(path.join(root, 'site', 'site.js'));

// A docs page is rendered by scripts/docs-pages.mjs, loaded as docsPages.test.ts loads it.
const { renderDocs } = (await import(pathToFileURL(path.join(root, 'scripts', 'docs-pages.mjs')).href)) as {
  renderDocs: (input: { files: Map<string, string>; exists: (repoPath: string) => boolean }) => { pages: Map<string, string> };
};

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (el === null) throw new Error(`no ${selector} on the page`);
  return el;
};
/** Click, and say whether the page's own handler cancelled the default action. jsdom
 * cannot follow a link, so a listener that runs after the page's (the event bubbles up
 * to the document) records that decision and then cancels the click itself. */
const click = (el: Element, init: MouseEventInit = {}): boolean => {
  let cancelled = false;
  document.addEventListener(
    'click',
    (e) => {
      cancelled = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true },
  );
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  return cancelled;
};

/** The text of every span the script marked as one kind of token. */
const marked = (code: Element, kind: string): string[] =>
  [...code.querySelectorAll(`.tok-${kind}`)].map((s) => s.textContent ?? '');

beforeEach(() => {
  document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/i.exec(page)?.[1] ?? '';
  new Function(script)();
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  window.getSelection()?.removeAllRanges();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('the landing page script', () => {
  it('loads a demo into the stage on a click', () => {
    const demo = document.querySelectorAll<HTMLAnchorElement>('.thumbs a[data-live]')[1]!;
    expect(click(demo)).toBe(true);
    expect($<HTMLIFrameElement>('#stage-frame iframe').getAttribute('src')).toBe(demo.getAttribute('href'));
    expect($('#stage-title').textContent).toBe(demo.dataset['title']);
    expect($<HTMLAnchorElement>('#stage-open').getAttribute('href')).toBe(demo.getAttribute('href'));
    expect($('.stage-poster').hidden).toBe(true);
    expect($('.stage-live').hidden).toBe(false);
  });

  it('leaves a modified click to the browser', () => {
    expect(click($('.thumbs a[data-live]'), { ctrlKey: true })).toBe(false);
    expect(document.querySelector('#stage-frame iframe')).toBeNull();
  });

  it('puts the picture back on Close', () => {
    click($('.stage-poster'));
    expect(document.querySelector('#stage-frame iframe')).not.toBeNull();
    click($('#stage-close'));
    expect(document.querySelector('#stage-frame iframe')).toBeNull();
    expect($('.stage-poster').hidden).toBe(false);
    expect($('.stage-live').hidden).toBe(true);
  });

  it('copies the install line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    click($('#copy-install'));
    await vi.waitFor(() => expect($('#copy-install').textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith($('#install-command').textContent);
  });

  it('selects the install line when there is no clipboard', async () => {
    click($('#copy-install'));
    await vi.waitFor(() => expect($('#copy-install').textContent).toBe('Selected'));
    expect(window.getSelection()?.getRangeAt(0).toString()).toBe($('#install-command').textContent);
  });

  it('colours the code sample and leaves its text as it was', () => {
    const starter = read(path.join(root, '.diagrams', 'src', 'examples', 'basic', 'starter.diagram.ts')).trimEnd();
    const code = $('#starter code');
    expect(code.textContent).toBe(starter);
    expect(marked(code, 'keyword')).toEqual(expect.arrayContaining(['import', 'from', 'const', 'export', 'default']));
    expect(marked(code, 'string')).toContain("'@diagc/core'");
    expect(marked(code, 'comment')).toContain(
      '// `contains` nests, `relate` draws an arrow. The system rests folded, with the',
    );
    expect(marked(code, 'call')).toEqual(expect.arrayContaining(['model', 'node', 'contains', 'relate']));
    expect(marked(code, 'property')).toEqual(expect.arrayContaining(['type', 'name', 'kind', 'label']));
  });

  it('colours nothing inside a comment or a string', () => {
    const sample = "const a = 'import x(1)'; // const b = `c`\nlet n = f(1.5);";
    const code = $('#starter code');
    code.textContent = sample;
    new Function(script)();
    expect(marked(code, 'keyword')).toEqual(['const', 'let']);
    expect(marked(code, 'string')).toEqual(["'import x(1)'"]);
    expect(marked(code, 'comment')).toEqual(['// const b = `c`']);
    expect(marked(code, 'call')).toEqual(['f']);
    expect(marked(code, 'number')).toEqual(['1.5']);
    expect(code.textContent).toBe(sample);
  });

  it('shows the theme switch, on the state that is remembered', () => {
    expect($('#theme-switch').hidden).toBe(false);
    expect($('#theme-switch').textContent).toBe('◐ System');
    expect($('#theme-switch').getAttribute('aria-label')).toBe('Theme: system. Switch to light.');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('cycles system, light and dark, remembering each and marking the root', () => {
    const button = $('#theme-switch');
    click(button);
    expect(button.textContent).toBe('☀ Light');
    expect(localStorage.getItem('diagc-theme')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    click(button);
    expect(button.textContent).toBe('☾ Dark');
    expect(button.getAttribute('aria-label')).toBe('Theme: dark. Switch to system.');
    expect(localStorage.getItem('diagc-theme')).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    click(button);
    expect(button.textContent).toBe('◐ System');
    expect(localStorage.getItem('diagc-theme')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('starts from a remembered theme', () => {
    localStorage.setItem('diagc-theme', 'dark');
    new Function(script)();
    expect($('#theme-switch').textContent).toBe('☾ Dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('follows a choice made on a published page', () => {
    localStorage.setItem('diagc-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'diagc-theme' }));
    expect($('#theme-switch').textContent).toBe('☾ Dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});

describe('the script on a docs page', () => {
  beforeEach(() => {
    const markdown = '# Docs\n\n```ts\nconst a = 1;\n```\n\n```bash\nexport A=1 # for now\n```\n\n```\nwrote 1 file for you\n```\n';
    const { pages } = renderDocs({ files: new Map([['README.md', markdown]]), exists: () => true });
    document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/i.exec(pages.get('docs/index.html') ?? '')?.[1] ?? '';
    new Function(script)();
  });

  it('colours a TypeScript block', () => {
    expect(marked($('code.language-ts'), 'keyword')).toEqual(['const']);
  });

  it('leaves a shell block in one colour: the token rules read TypeScript', () => {
    expect($('code.language-bash').children).toHaveLength(0);
    expect($('code.language-bash').textContent).toBe('export A=1 # for now\n');
  });

  it('leaves a block that names no language in one colour: it is output, not code', () => {
    expect($('pre code:not([class])').children).toHaveLength(0);
    expect($('pre code:not([class])').textContent).toBe('wrote 1 file for you\n');
  });

  it('shows the theme switch', () => {
    expect($('#theme-switch').hidden).toBe(false);
  });

  it("brings the marked page into view in a sidebar that is longer than the screen", () => {
    // jsdom lays nothing out, so the sizes are given: a list box 800 high, and the page's
    // own entry 30 high, 1200 down the list. Centred, it sits 385 below the box's top.
    const side = $('.docs-side');
    const here = $('.docs-side [aria-current="page"]');
    Object.defineProperty(side, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(here, 'offsetTop', { value: 1200, configurable: true });
    Object.defineProperty(here, 'offsetHeight', { value: 30, configurable: true });
    new Function(script)();
    expect(side.scrollTop).toBe(815);
  });
});
