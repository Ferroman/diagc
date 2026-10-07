import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inRepo, loadDocsPages, readDocs } from '../test-fixtures/docs-site';
import { findHome } from './home';

// scripts/docs-pages.mjs, the module that renders docs/ as pages of the site. The tests sit
// in this package for the reasons docsExamples.test.ts gives.
const root = findHome(fileURLToPath(import.meta.url)).root;
const { slugger, outPath, readNav, renderDocs } = await loadDocsPages(root);

describe('a heading id', () => {
  const id = (text: string): string => slugger()(text);

  it('is the heading in lower case, with a hyphen for each space', () => {
    expect(id('Share an interactive page')).toBe('share-an-interactive-page');
  });

  it('drops punctuation and keeps the hyphens of the spaces around it, as GitHub does', () => {
    expect(id("What's next?")).toBe('whats-next');
    expect(id('diagc publish — pages & pictures')).toBe('diagc-publish--pages--pictures');
    expect(id('m.node(id, opts?) → NodeRef')).toBe('mnodeid-opts--noderef');
  });

  it('keeps letters of any script, digits, hyphens and underscores', () => {
    expect(id('Diátaxis in 4 parts')).toBe('diátaxis-in-4-parts');
    expect(id('snake_case and kebab-case')).toBe('snake_case-and-kebab-case');
  });

  it('numbers a repeated heading from the second one on', () => {
    const slug = slugger();
    expect([slug('Export'), slug('Export'), slug('Export')]).toEqual(['export', 'export-1', 'export-2']);
  });

  it('steps past an id that a heading of its own already has', () => {
    const slug = slugger();
    expect([slug('Export 1'), slug('Export'), slug('Export')]).toEqual(['export-1', 'export', 'export-2']);
  });

  it('keeps a combining mark with its letter', () => {
    expect(id('cafe\u0301 bar')).toBe('cafe\u0301-bar');
  });
});

describe('a page the index names twice', () => {
  const TWICE = [
    '# Docs',
    '',
    'New here? Start with [the first one](tutorials/first.md).',
    '',
    '## Tutorials',
    '',
    '| | |',
    '| --- | --- |',
    '| [First steps](tutorials/first.md) | Zero to one. |',
    '| [First, again](tutorials/first.md) | A second row. |',
  ].join('\n');

  it('is listed once: its row in a section wins over a mention above the sections', () => {
    expect(readNav(TWICE).map((e) => [e.file, e.title, e.section])).toEqual([
      ['README.md', 'Docs', undefined],
      ['tutorials/first.md', 'First steps', 'Tutorials'],
    ]);
  });

  it('is rendered once, with no link of its own reported', () => {
    const files = new Map([
      ['README.md', TWICE],
      ['tutorials/first.md', '# First\n\n[index](../README.md)\n'],
    ]);
    const { pages, errors } = renderDocs({ files, exists: () => true });
    expect(errors).toEqual([]);
    expect(
      (pages.get('docs/index.html') ?? '')
        .match(/<aside class="docs-side">[\s\S]*?<\/aside>/)?.[0]
        .match(/first\.html"/g),
    ).toHaveLength(1);
  });
});

describe('a page path', () => {
  it('keeps the name and takes .html', () => {
    expect(outPath('how-to/publish-and-share.md')).toBe('how-to/publish-and-share.html');
  });

  it("makes a folder's README its index", () => {
    expect(outPath('README.md')).toBe('index.html');
    expect(outPath('examples/README.md')).toBe('examples/index.html');
  });
});

const INDEX = [
  '# Documentation',
  '',
  '**[Examples](examples/README.md)** — every type, each one also [live](https://example.org/live)',
  '',
  '## Tutorials',
  '',
  'Learn by doing, or read [the model](reference/model.md) first.',
  '',
  '| | |',
  '| --- | --- |',
  '| [Your first diagram](tutorials/01-first.md) | Zero to a picture. |',
  '',
  '## Reference',
  '',
  '| | |',
  '| --- | --- |',
  '| [`diagc` CLI](reference/cli.md) | Every command. |',
  '| [Model](reference/model.md) | The `DiagramModel` types. |',
  '| [The site](https://example.org/) | Not a page of ours. |',
].join('\n');

describe('the navigation', () => {
  const nav = readNav(INDEX);

  it('starts with the index itself, then the pages named above the first section', () => {
    expect(nav.slice(0, 2)).toEqual([
      { file: 'README.md', title: 'Documentation', description: '', section: undefined },
      { file: 'examples/README.md', title: 'Examples', description: '', section: undefined },
    ]);
  });

  it("lists each section's pages in the index's order, with their descriptions", () => {
    expect(nav.slice(2)).toEqual([
      {
        file: 'tutorials/01-first.md',
        title: 'Your first diagram',
        description: 'Zero to a picture.',
        section: 'Tutorials',
      },
      { file: 'reference/cli.md', title: 'diagc CLI', description: 'Every command.', section: 'Reference' },
      { file: 'reference/model.md', title: 'Model', description: 'The DiagramModel types.', section: 'Reference' },
    ]);
  });
});

/** A small docs tree: an index that lists every given page, then the pages. */
const build = (
  given: Record<string, string>,
  exists: (repoPath: string) => boolean = () => true,
): { pages: Map<string, string>; errors: string[] } => {
  const index = ['# Docs', '', '| | |', '| --- | --- |', ...Object.keys(given).map((f) => `| [${f}](${f}) | |`)].join(
    '\n',
  );
  return renderDocs({ files: new Map(Object.entries({ 'README.md': index, ...given })), exists });
};
/** The article of one built page: the links under test are the ones the Markdown wrote. */
const article = (pages: Map<string, string>, page: string): string =>
  /<article>([\s\S]*)<\/article>/.exec(pages.get(page) ?? '')?.[1] ?? '';
const CLI = '# CLI\n\n## Publish\n\n## Export\n\n## Export\n';

describe('a link in a docs page', () => {
  it('to another page leads to that page, with its heading', () => {
    const { pages, errors } = build({
      'how-to/a.md': '# A\n\n[cli](../reference/cli.md#publish)\n',
      'reference/cli.md': CLI,
    });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/how-to/a.html')).toContain('<a href="../reference/cli.html#publish">cli</a>');
  });

  it("to a folder's README leads to its index", () => {
    const { pages, errors } = build({
      'how-to/a.md': '# A\n\n[docs](../README.md) [ex](../examples/README.md)\n',
      'examples/README.md': '# Ex\n',
    });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/how-to/a.html')).toContain('<a href="../index.html">docs</a>');
    expect(article(pages, 'docs/how-to/a.html')).toContain('<a href="../examples/index.html">ex</a>');
  });

  it("to a picture leads to the site's copy of it", () => {
    const { pages, errors } = build({ 'how-to/a.md': '# A\n\n![p](../../.diagrams/static/docs/pipeline.png)\n' });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/how-to/a.html')).toContain('src="../../static/docs/pipeline.png"');
  });

  it('to any other file of the repository leads to GitHub', () => {
    const { pages, errors } = build({
      'how-to/a.md':
        '# A\n\n[src](../../.diagrams/src/examples/basic/starter.diagram.ts) [c](../../CONTRIBUTING.md#the-site)\n',
    });
    expect(errors).toEqual([]);
    const html = article(pages, 'docs/how-to/a.html');
    expect(html).toContain(
      'href="https://github.com/Ferroman/diagc/blob/main/.diagrams/src/examples/basic/starter.diagram.ts"',
    );
    expect(html).toContain('href="https://github.com/Ferroman/diagc/blob/main/CONTRIBUTING.md#the-site"');
  });

  it('to a heading of its own page, or to another site, is left as written', () => {
    const { pages, errors } = build({
      'how-to/a.md':
        '# A\n\n## Export\n\n[e](#export) [x](https://example.org/a.md) [m](mailto:a@example.org) [p](//example.org/a.md)\n',
    });
    expect(errors).toEqual([]);
    const html = article(pages, 'docs/how-to/a.html');
    expect(html).toContain('<a href="#export">e</a>');
    expect(html).toContain('<a href="https://example.org/a.md">x</a>');
    expect(html).toContain('<a href="mailto:a@example.org">m</a>');
    expect(html).toContain('<a href="//example.org/a.md">p</a>');
  });

  it('to an encoded heading of another page finds it under its letters', () => {
    const { errors } = build({
      'how-to/a.md': '# A\n\n[d](b.md#di%C3%A1taxis)\n',
      'how-to/b.md': '# B\n\n## Diátaxis\n',
    });
    expect(errors).toEqual([]);
  });

  it('to a page whose name has a space finds it, and writes the space as a link must', () => {
    const files = new Map([
      ['README.md', '# Docs\n\n| | |\n| --- | --- |\n| [My page](how-to/my%20page.md) | |\n| [A](how-to/a.md) | |\n'],
      ['how-to/my page.md', '# My page\n'],
      ['how-to/a.md', '# A\n\n[mine](my%20page.md)\n'],
    ]);
    const { pages, errors } = renderDocs({ files, exists: () => true });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/how-to/a.html')).toContain('<a href="my%20page.html">mine</a>');
    expect(pages.get('docs/how-to/a.html')).toContain('<a href="my%20page.html">My page</a>');
  });

  it('finds a repeated heading under its number, and an encoded one under its letters', () => {
    const { errors } = build({
      'how-to/a.md': '# A\n\n## Diátaxis\n\n[second](../reference/cli.md#export-1) [d](#di%C3%A1taxis)\n',
      'reference/cli.md': CLI,
    });
    expect(errors).toEqual([]);
  });

  it('from a page two folders deep still reaches the pictures and the index', () => {
    const { pages, errors } = build({
      'a/b/c.md': '# C\n\n![p](../../../.diagrams/static/x.png) [up](../../README.md)\n',
    });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/a/b/c.html')).toContain('src="../../../static/x.png"');
    expect(article(pages, 'docs/a/b/c.html')).toContain('<a href="../../index.html">up</a>');
  });

  it('inside a listing or a code span is text, not a link', () => {
    const { pages, errors } = build({
      'how-to/a.md': '# A\n\nWrite `![Shop](missing.png)`:\n\n```markdown\n[x](missing.md)\n```\n',
    });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/how-to/a.html')).toContain('[x](missing.md)');
  });
});

describe('a dead link in a docs page', () => {
  const dead = (markdown: string, exists: (repoPath: string) => boolean = () => true): string[] =>
    build({ 'how-to/a.md': markdown, 'reference/cli.md': CLI }, exists).errors;

  it('to a page that does not exist is reported with its file', () => {
    expect(dead('# A\n\n[x](missing.md)\n')).toEqual(['docs/how-to/a.md: missing.md — no such page']);
  });

  it('to a heading the page does not have is reported', () => {
    expect(dead('# A\n\n[x](#nope)\n')).toEqual(['docs/how-to/a.md: #nope — no such heading on this page']);
    expect(dead('# A\n\n[x](../reference/cli.md#nope)\n')).toEqual([
      'docs/how-to/a.md: ../reference/cli.md#nope — no such heading on that page',
    ]);
  });

  it('to a picture or a file that is not in the repository is reported', () => {
    const gone = (): boolean => false;
    expect(dead('# A\n\n![p](../../.diagrams/static/gone.png)\n', gone)).toEqual([
      'docs/how-to/a.md: ../../.diagrams/static/gone.png — no such picture',
    ]);
    expect(dead('# A\n\n[f](../../gone.txt)\n', gone)).toEqual([
      'docs/how-to/a.md: ../../gone.txt — no such file in the repository',
    ]);
  });

  it('to a picture outside the published ones is reported: the site would not serve it', () => {
    expect(dead('# A\n\n![p](../../site/img/studio.png)\n')).toEqual([
      'docs/how-to/a.md: ../../site/img/studio.png — a picture must be under .diagrams/static/',
    ]);
  });

  it('that leaves the repository is reported', () => {
    expect(dead('# A\n\n[x](../../../elsewhere.md)\n')).toEqual([
      'docs/how-to/a.md: ../../../elsewhere.md — leaves the repository',
    ]);
  });

  it('with a scheme a page has no use for is reported: a link must not run a script', () => {
    expect(dead('# A\n\n[x](javascript:alert(1))\n')).toEqual([
      'docs/how-to/a.md: javascript:alert(1) — only http, https and mailto links leave the site',
    ]);
  });

  it('is reported once for each, so one run shows them all', () => {
    expect(dead('# A\n\n[x](missing.md) [y](#nope)\n\n| t |\n| --- |\n| [z](gone.md) |\n')).toHaveLength(3);
  });

  it('is reported for a page the index does not list', () => {
    const files = new Map([
      ['README.md', '# Docs\n'],
      ['how-to/orphan.md', '# Orphan\n'],
    ]);
    expect(renderDocs({ files, exists: () => true }).errors).toEqual([
      'docs/how-to/orphan.md: not listed in docs/README.md',
    ]);
  });
});

describe('a heading in a docs page', () => {
  it('carries the id its links use', () => {
    const { pages } = build({ 'reference/cli.md': CLI });
    const html = article(pages, 'docs/reference/cli.html');
    expect(html).toContain('<h1 id="cli">CLI</h1>');
    expect(html).toContain('<h2 id="export">Export</h2>');
    expect(html).toContain('<h2 id="export-1">Export</h2>');
  });

  it('reads an entity as the character it stands for, as GitHub does', () => {
    const { pages } = build({ 'how-to/a.md': '# Q&amp;A\n\n## Pages &amp; pictures\n\n## Two\n' });
    const html = pages.get('docs/how-to/a.html') ?? '';
    expect(html).toContain('<h2 id="pages--pictures">Pages &amp; pictures</h2>');
    expect(html).toContain('<title>Q&amp;A — diagc docs</title>');
    expect(html).toContain('<a href="#pages--pictures">Pages &amp; pictures</a>');
  });
});

describe('a docs page', () => {
  const INDEX_OF_THREE = [
    '# Docs',
    '',
    '## Tutorials',
    '',
    '| | |',
    '| --- | --- |',
    '| [First](tutorials/first.md) | Zero to a "picture" & back. |',
    '',
    '## How-to guides',
    '',
    '| | |',
    '| --- | --- |',
    '| [Publish](how-to/publish.md) | |',
  ].join('\n');
  const { pages, errors } = renderDocs({
    files: new Map([
      ['README.md', INDEX_OF_THREE],
      ['tutorials/first.md', '# First <steps> & more\n\nOne.\n'],
      [
        'how-to/publish.md',
        '# `diagc` publish\n\n## Export\n\nPress <kbd>P</kbd>.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n![pic](../../.diagrams/static/x.png)\n\n## Share <now>\n',
      ],
    ]),
    exists: () => true,
  });
  const first = pages.get('docs/tutorials/first.html') ?? '';
  const publish = pages.get('docs/how-to/publish.html') ?? '';
  const index = pages.get('docs/index.html') ?? '';

  it('renders with no dead link', () => {
    expect(errors).toEqual([]);
  });

  it('is titled by its heading, in words', () => {
    expect(publish).toContain('<title>diagc publish — diagc docs</title>');
    expect(first).toContain('<title>First &lt;steps&gt; &amp; more — diagc docs</title>');
  });

  it('takes its description from the index, and has none when the index gives none', () => {
    expect(first).toContain('<meta name="description" content="Zero to a &quot;picture&quot; &amp; back.">');
    expect(publish).not.toContain('<meta name="description"');
  });

  it('applies the remembered theme before its stylesheets are read', () => {
    expect(publish.indexOf("localStorage.getItem('diagc-theme')")).toBeGreaterThan(-1);
    expect(publish.indexOf("localStorage.getItem('diagc-theme')")).toBeLessThan(
      publish.indexOf('<link rel="stylesheet"'),
    );
  });

  it("reaches the site's stylesheets and script from its own folder", () => {
    for (const ref of ['href="../../site.css"', 'href="../../docs.css"', 'src="../../site.js"'])
      expect(publish).toContain(ref);
    for (const ref of ['href="../site.css"', 'href="../docs.css"', 'src="../site.js"']) expect(index).toContain(ref);
    const deep = build({ 'a/b/c.md': '# C\n' }).pages.get('docs/a/b/c.html') ?? '';
    for (const ref of [
      'href="../../../site.css"',
      'href="../../../docs.css"',
      'src="../../../site.js"',
      'href="../../../index.html#features"',
    ]) {
      expect(deep).toContain(ref);
    }
  });

  it('starts with a way past the header and the list of pages, to the article', () => {
    expect(publish).toMatch(/<body class="docs">\s*<a class="skip" href="#Article">Skip to the article<\/a>/);
    expect(publish).toContain('<main id="Article">');
    expect(publish.match(/id="Article"/g)).toHaveLength(1);
  });

  it('has its own title as its first heading: the sidebar names its sections without one', () => {
    expect(/<h[1-6]/.exec(publish.slice(publish.indexOf('<body')))?.[0]).toBe('<h1');
  });

  it("has the landing page's header, leading back to it", () => {
    // Link by link: the landing page links its own sections, and a docs page links the same
    // places from where it is.
    const links = (html: string): string[][] =>
      [
        .../<header class="nav">([\s\S]*?)<\/header>/
          .exec(html)![1]!
          .matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g),
      ].map((m) => [m[1]!, m[2]!]);
    const landing = readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
    const fromHowTo = ([href, label]: string[]): string[] => [
      href === '#top'
        ? '../../index.html'
        : href === '#docs'
          ? '../../docs/index.html'
          : href!.startsWith('#')
            ? `../../index.html${href}`
            : href!,
      label!,
    ];
    expect(links(publish)).toEqual(links(landing).map(fromHowTo));
    expect(links(publish)).toHaveLength(6);
    expect(publish).toContain('<a href="../../docs/index.html" aria-current="true">Docs</a>');
    expect(publish).toContain('<button type="button" id="theme-switch" hidden></button>');
  });

  it('lists every page by section in its sidebar, and marks the one it is', () => {
    const side = /<aside class="docs-side">([\s\S]*?)<\/aside>/.exec(publish)?.[1] ?? '';
    expect(side).toContain('<p class="docs-group">Tutorials</p>');
    expect(side).toContain('<p class="docs-group">How-to guides</p>');
    expect(side).toContain('<a href="../index.html">Docs</a>');
    expect(side).toContain('<a href="../tutorials/first.html">First</a>');
    expect(side).toContain('<a href="publish.html" aria-current="page">Publish</a>');
    expect(side.match(/aria-current/g)).toHaveLength(1);
  });

  it('has the same list folded, for a narrow screen', () => {
    const side = /<aside class="docs-side">([\s\S]*?)<\/aside>/.exec(publish)?.[1];
    const menu = /<details class="docs-menu"><summary>All pages<\/summary>([\s\S]*?)<\/details>/.exec(publish)?.[1];
    expect(side).toContain('<p class="docs-group">Tutorials</p>');
    expect(menu).toBe(side);
  });

  it('lists its own second-level headings when it has two or more', () => {
    const toc = /<aside class="docs-toc">([\s\S]*?)<\/aside>/.exec(publish)?.[1] ?? '';
    expect(toc).toContain('<a href="#export">Export</a>');
    expect(toc).toContain('<a href="#share-now">Share &lt;now&gt;</a>');
    expect(first).not.toContain('docs-toc');
  });

  it('lists none for a page with one, and never a third-level heading', () => {
    const { pages: built } = build({
      'how-to/one.md': '# One\n\n## Only\n\n### Deeper\n',
      'how-to/two.md': '# Two\n\n## First\n\n### Deeper\n\n## Second\n',
    });
    expect(built.get('docs/how-to/one.html')).not.toContain('docs-toc');
    const toc = /<aside class="docs-toc">([\s\S]*?)<\/aside>/.exec(built.get('docs/how-to/two.html') ?? '')?.[1] ?? '';
    expect(toc).toContain('href="#first"');
    expect(toc).toContain('href="#second"');
    expect(toc).not.toContain('href="#deeper"');
  });

  it("leads to the previous and the next page in the sidebar's order, across sections", () => {
    const pager = (html: string): string => /<nav class="docs-pager"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
    expect(pager(first)).toContain('<a class="prev" href="../index.html"><small>Previous</small>Docs</a>');
    expect(pager(first)).toContain('<a class="next" href="../how-to/publish.html"><small>Next</small>Publish</a>');
    expect(pager(index)).not.toContain('class="prev"');
    expect(pager(publish)).not.toContain('class="next"');
  });

  it('leads to its Markdown on GitHub', () => {
    expect(publish).toContain(
      '<a href="https://github.com/Ferroman/diagc/blob/main/docs/how-to/publish.md">View this page on GitHub</a>',
    );
  });

  it('shows raw HTML as text', () => {
    expect(publish).toContain('Press &lt;kbd&gt;P&lt;/kbd&gt;.');
    expect(publish).not.toContain('<kbd>');
  });

  it('drops an HTML comment, as GitHub does: a release marker is not prose', () => {
    const { pages } = build({
      'how-to/a.md':
        '# A\n\n| a |\n| --- |\n| pinned <!-- x-release-please-version --> |\n\n<!-- a block comment -->\n\nAfter.\n',
    });
    const html = article(pages, 'docs/how-to/a.html');
    expect(html).not.toContain('x-release-please-version');
    expect(html).not.toContain('a block comment');
    expect(html).toContain('pinned');
    expect(html).toContain('<p>After.</p>');
  });

  it('shows markup as text after an inline tag too', () => {
    // After <kbd> or <code>, marked takes what follows for HTML and would pass it through.
    const { pages } = build({ 'how-to/a.md': '# A\n\nPress <kbd><img/src=x/onerror=alert(1)></kbd> now.\n' });
    const html = article(pages, 'docs/how-to/a.html');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img/src=x/onerror=alert(1)&gt;');
  });

  it('escapes a page title and a section name wherever it shows them', () => {
    const escaped = renderDocs({
      files: new Map([
        [
          'README.md',
          '# Docs\n\n## Q&A <fast> "now"\n\n| | |\n| --- | --- |\n| [A <b> & "c"](a.md) | |\n| [Z](z.md) | |\n',
        ],
        ['a.md', '# A\n'],
        ['z.md', '# Z\n\n![x <y> & "z"](../.diagrams/static/p.png)\n'],
      ]),
      exists: () => true,
    });
    const z = escaped.pages.get('docs/z.html') ?? '';
    expect(escaped.errors).toEqual([]);
    expect(z).toContain('<p class="docs-group">Q&amp;A &lt;fast&gt; &quot;now&quot;</p>');
    expect(z).toContain('<a href="a.html">A &lt;b&gt; &amp; &quot;c&quot;</a>');
    expect(z).toContain('<small>Previous</small>A &lt;b&gt; &amp; &quot;c&quot;</a>');
    expect(z).toContain('alt="x &lt;y&gt; &amp; &quot;z&quot;"');
  });

  it('puts a table in a box of its own, so a wide one scrolls there', () => {
    expect(publish).toMatch(/<div class="table-wrap"><table>[\s\S]*?<\/table>\s*<\/div>/);
  });

  it('loads a picture when the reader reaches it', () => {
    expect(publish).toContain('<img src="../../static/x.png" alt="pic" loading="lazy">');
  });
});

// The docs as they are. Pages deploys only from main, so this is what stops a dead link,
// or a page missing from the index, before it is merged.
describe('the real docs', () => {
  const files = readDocs(root);
  const exists = inRepo(root);

  it('render with no dead link, every page listed in the index', () => {
    expect(renderDocs({ files, exists }).errors).toEqual([]);
  });

  it('show no HTML comment as text', () => {
    // Two pages name a comment in a code span, which is the page saying it, not leaking it.
    const prose = (html: string): string =>
      html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code[^>]*>[\s\S]*?<\/code>/g, '');
    const { pages } = renderDocs({ files, exists });
    expect([...pages].filter(([, html]) => prose(html).includes('&lt;!--')).map(([page]) => page)).toEqual([]);
  });

  it('become one page each', () => {
    expect(files.size).toBeGreaterThanOrEqual(39);
    expect(renderDocs({ files, exists }).pages.size).toBe(files.size);
  });

  it('would be stopped by a dead link in any of them', () => {
    const broken = new Map(files);
    broken.set(
      'how-to/add-a-legend.md',
      `${files.get('how-to/add-a-legend.md') ?? ''}\n\n[gone](../reference/no-such-page.md)\n`,
    );
    expect(renderDocs({ files: broken, exists }).errors).toEqual([
      'docs/how-to/add-a-legend.md: ../reference/no-such-page.md — no such page',
    ]);
  });

  it('load only stylesheets and a script the site has', () => {
    const page = renderDocs({ files, exists }).pages.get('docs/index.html') ?? '';
    const own = [...page.matchAll(/(?:href|src)="\.\.\/([^"/]+\.(?:css|js))"/g)].map((m) => m[1]!);
    expect(own).toEqual(['site.css', 'docs.css', 'site.js']);
    expect(own.filter((f) => !existsSync(path.join(root, 'site', f)))).toEqual([]);
  });
});
