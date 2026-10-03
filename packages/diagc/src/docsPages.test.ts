import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findHome } from './home';

// scripts/docs-pages.mjs, the module that renders docs/ as pages of the site. It is plain
// JavaScript outside this package, so it is loaded by URL and its shape is declared here.
// The tests sit in this package for the reasons docsExamples.test.ts gives.
interface NavEntry {
  file: string;
  title: string;
  description: string;
  section: string | undefined;
}
interface DocsPages {
  slugger: () => (text: string) => string;
  outPath: (file: string) => string;
  readNav: (indexMarkdown: string) => NavEntry[];
  renderDocs: (input: { files: Map<string, string>; exists: (repoPath: string) => boolean }) => {
    pages: Map<string, string>;
    errors: string[];
  };
}
const root = findHome(fileURLToPath(import.meta.url)).root;
const { slugger, outPath, readNav, renderDocs } = (await import(
  pathToFileURL(path.join(root, 'scripts', 'docs-pages.mjs')).href
)) as DocsPages;

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
      { file: 'tutorials/01-first.md', title: 'Your first diagram', description: 'Zero to a picture.', section: 'Tutorials' },
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
  const index = ['# Docs', '', '| | |', '| --- | --- |', ...Object.keys(given).map((f) => `| [${f}](${f}) | |`)].join('\n');
  return renderDocs({ files: new Map(Object.entries({ 'README.md': index, ...given })), exists });
};
/** The article of one built page: the links under test are the ones the Markdown wrote. */
const article = (pages: Map<string, string>, page: string): string =>
  /<article>([\s\S]*)<\/article>/.exec(pages.get(page) ?? '')?.[1] ?? '';
const CLI = '# CLI\n\n## Publish\n\n## Export\n\n## Export\n';

describe('a link in a docs page', () => {
  it('to another page leads to that page, with its heading', () => {
    const { pages, errors } = build({ 'how-to/a.md': '# A\n\n[cli](../reference/cli.md#publish)\n', 'reference/cli.md': CLI });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/how-to/a.html')).toContain('<a href="../reference/cli.html#publish">cli</a>');
  });

  it("to a folder's README leads to its index", () => {
    const { pages, errors } = build({ 'how-to/a.md': '# A\n\n[docs](../README.md) [ex](../examples/README.md)\n', 'examples/README.md': '# Ex\n' });
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
      'how-to/a.md': '# A\n\n[src](../../.diagrams/src/examples/basic/starter.diagram.ts) [c](../../CONTRIBUTING.md#the-site)\n',
    });
    expect(errors).toEqual([]);
    const html = article(pages, 'docs/how-to/a.html');
    expect(html).toContain('href="https://github.com/Ferroman/diagc/blob/main/.diagrams/src/examples/basic/starter.diagram.ts"');
    expect(html).toContain('href="https://github.com/Ferroman/diagc/blob/main/CONTRIBUTING.md#the-site"');
  });

  it('to a heading of its own page, or to another site, is left as written', () => {
    const { pages, errors } = build({ 'how-to/a.md': '# A\n\n## Export\n\n[e](#export) [x](https://example.org/a.md) [m](mailto:a@example.org)\n' });
    expect(errors).toEqual([]);
    const html = article(pages, 'docs/how-to/a.html');
    expect(html).toContain('<a href="#export">e</a>');
    expect(html).toContain('<a href="https://example.org/a.md">x</a>');
    expect(html).toContain('<a href="mailto:a@example.org">m</a>');
  });

  it('finds a repeated heading under its number, and an encoded one under its letters', () => {
    const { errors } = build({
      'how-to/a.md': '# A\n\n## Diátaxis\n\n[second](../reference/cli.md#export-1) [d](#di%C3%A1taxis)\n',
      'reference/cli.md': CLI,
    });
    expect(errors).toEqual([]);
  });

  it('from a page two folders deep still reaches the pictures and the index', () => {
    const { pages, errors } = build({ 'a/b/c.md': '# C\n\n![p](../../../.diagrams/static/x.png) [up](../../README.md)\n' });
    expect(errors).toEqual([]);
    expect(article(pages, 'docs/a/b/c.html')).toContain('src="../../../static/x.png"');
    expect(article(pages, 'docs/a/b/c.html')).toContain('<a href="../../index.html">up</a>');
  });

  it('inside a listing or a code span is text, not a link', () => {
    const { pages, errors } = build({ 'how-to/a.md': '# A\n\nWrite `![Shop](missing.png)`:\n\n```markdown\n[x](missing.md)\n```\n' });
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
    expect(dead('# A\n\n[f](../../gone.txt)\n', gone)).toEqual(['docs/how-to/a.md: ../../gone.txt — no such file in the repository']);
  });

  it('to a picture outside the published ones is reported: the site would not serve it', () => {
    expect(dead('# A\n\n![p](../../site/img/studio.png)\n')).toEqual([
      'docs/how-to/a.md: ../../site/img/studio.png — a picture must be under .diagrams/static/',
    ]);
  });

  it('that leaves the repository is reported', () => {
    expect(dead('# A\n\n[x](../../../elsewhere.md)\n')).toEqual(['docs/how-to/a.md: ../../../elsewhere.md — leaves the repository']);
  });

  it('is reported once for each, so one run shows them all', () => {
    expect(dead('# A\n\n[x](missing.md) [y](#nope)\n\n| t |\n| --- |\n| [z](gone.md) |\n')).toHaveLength(3);
  });

  it('is reported for a page the index does not list', () => {
    const files = new Map([
      ['README.md', '# Docs\n'],
      ['how-to/orphan.md', '# Orphan\n'],
    ]);
    expect(renderDocs({ files, exists: () => true }).errors).toEqual(['docs/how-to/orphan.md: not listed in docs/README.md']);
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
});
