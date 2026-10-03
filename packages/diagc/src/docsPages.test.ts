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
}
const root = findHome(fileURLToPath(import.meta.url)).root;
const { slugger, outPath, readNav } = (await import(
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
