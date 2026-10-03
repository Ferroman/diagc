import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findHome } from './home';

// A test of the landing page in site/, kept in this package for the reasons
// docsExamples.test.ts gives. The page is hand-written HTML, so nothing else notices a
// demo that was renamed or a docs page that moved.
const root = findHome(fileURLToPath(import.meta.url)).root;
const SITE = path.join(root, 'site');
const SRC = path.join(root, '.diagrams', 'src');
const BLOB = 'https://github.com/Ferroman/diagc/blob/main/';
/** Written into the site by pages.yml, not kept in site/. */
const BUILT = new Set(['llms.txt']);

const read = (f: string): string => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const html = read(path.join(SITE, 'index.html'));
const css = read(path.join(SITE, 'site.css'));

const attrs = (name: string): string[] =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]!);
const refs = [...attrs('href'), ...attrs('src')];
const isExternal = (t: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(t);
const unescape = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const hasSource = (name: string): boolean =>
  existsSync(path.join(SRC, `${name}.diagram.ts`)) || existsSync(path.join(SRC, `${name}.diagram.json`));

describe('the landing page', () => {
  it('has a section for every link in its nav', () => {
    const anchors = refs.filter((t) => t.startsWith('#')).map((t) => t.slice(1));
    expect(anchors).toEqual(expect.arrayContaining(['features', 'how-it-works', 'demos', 'docs']));
    const ids = new Set(attrs('id'));
    expect(anchors.filter((a) => !ids.has(a))).toEqual([]);
  });

  it('points every live page at a diagram that exists', () => {
    const live = refs.filter((t) => t.startsWith('html/'));
    expect(live.length).toBeGreaterThanOrEqual(8);
    // html/index.html is the examples index that `publish` writes, not a diagram.
    const bad = live.filter((t) => t !== 'html/index.html' && !hasSource(t.slice('html/'.length).replace(/\.html$/, '')));
    expect(bad).toEqual([]);
  });

  it('shows only committed pictures of diagrams that exist', () => {
    const pictures = refs.filter((t) => t.startsWith('static/'));
    expect(pictures.length).toBeGreaterThanOrEqual(8);
    expect(pictures.filter((t) => !existsSync(path.join(root, '.diagrams', t)))).toEqual([]);
    // A picture whose source is gone is a leftover: `publish` no longer draws it.
    expect(pictures.filter((t) => !hasSource(t.slice('static/'.length).replace(/\.png$/, '')))).toEqual([]);
  });

  it('has no dead link into its own folder', () => {
    const own = refs.filter(
      (t) => !isExternal(t) && !t.startsWith('#') && !t.startsWith('html/') && !t.startsWith('static/') && !BUILT.has(t),
    );
    expect(own.length).toBeGreaterThanOrEqual(4);
    expect(own.filter((t) => !existsSync(path.join(SITE, t)))).toEqual([]);
  });

  it('links only docs files that exist', () => {
    const docs = refs.filter((t) => t.startsWith(BLOB));
    expect(docs.length).toBeGreaterThanOrEqual(10);
    expect(docs.filter((t) => !existsSync(path.join(root, t.slice(BLOB.length).split('#')[0]!)))).toEqual([]);
  });

  it('shows the install line the README gives', () => {
    const line = readFileSync(path.join(root, 'README.md'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('curl -fsSL'));
    expect(line).toBeDefined();
    expect(unescape(/<code id="install-command">([^<]*)<\/code>/.exec(html)?.[1] ?? '')).toBe(line);
  });

  it('shows the basic starter exactly as the file has it', () => {
    const starter = readFileSync(path.join(SRC, 'examples', 'basic', 'starter.diagram.ts'), 'utf8');
    const shown = /<pre id="starter"><code>([\s\S]*?)<\/code><\/pre>/.exec(html)?.[1] ?? '';
    expect(unescape(shown)).toBe(starter.trimEnd());
  });

  it('keeps every demo a plain link', () => {
    // Without JavaScript, and on a middle click, a demo must open as a normal page.
    const tags = [...html.matchAll(/<(\w+)\b([^>]*\sdata-live\b[^>]*)>/g)];
    expect(tags.length).toBeGreaterThanOrEqual(7);
    expect(tags.filter((m) => m[1] !== 'a' || !/\shref="html\/[^"]+\.html"/.test(m[2]!)).map((m) => m[0])).toEqual([]);
  });

  it('loads nothing from another host', () => {
    expect(attrs('src').filter(isExternal)).toEqual([]);
    const sheets = [...html.matchAll(/<link\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]!);
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    expect(sheets.filter(isExternal)).toEqual([]);
    expect(css).not.toBe('');
    expect(css).not.toMatch(/@import|url\(\s*['"]?(https?:)?\/\//i);
  });
});

describe('the front pages', () => {
  const readme = read(path.join(root, 'README.md'));

  it('say that the Obsidian plugin is built from a checkout', () => {
    // It is not part of the installed CLI, and a front page must not read as if it were.
    const bullet = readme.split('\n').find((l) => l.startsWith('- **Obsidian.**')) ?? '';
    const card = /<h3>Obsidian<\/h3>\s*<p>([^<]*)<\/p>/.exec(html)?.[1] ?? '';
    expect(bullet).toContain('checkout');
    expect(card).toContain('checkout');
  });

  it('point an agent at llms.txt', () => {
    expect(readme).toContain('https://ferroman.github.io/diagc/llms.txt');
    expect(refs).toContain('llms.txt');
  });
});
