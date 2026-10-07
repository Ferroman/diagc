import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// What the tests of the site share. scripts/docs-pages.mjs renders docs/ as pages; it is
// plain JavaScript outside this package, so it is loaded by URL and its shape is declared
// here, once. It sits beside the fixtures and not in src/, which is what the build ships.
export interface NavEntry {
  file: string;
  title: string;
  description: string;
  section: string | undefined;
}
export interface DocsPages {
  slugger: () => (text: string) => string;
  outPath: (file: string) => string;
  readNav: (indexMarkdown: string) => NavEntry[];
  renderDocs: (input: { files: Map<string, string>; exists: (repoPath: string) => boolean }) => {
    pages: Map<string, string>;
    errors: string[];
  };
}

export const loadDocsPages = async (root: string): Promise<DocsPages> =>
  (await import(pathToFileURL(path.join(root, 'scripts', 'docs-pages.mjs')).href)) as DocsPages;

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      )
    : [];

/** The repository's docs as the renderer takes them: a path under docs/ -> its Markdown. */
export const readDocs = (root: string): Map<string, string> => {
  const docs = path.join(root, 'docs');
  return new Map(
    walk(docs)
      .filter((f) => f.endsWith('.md'))
      .map((f) => [path.relative(docs, f).split(path.sep).join('/'), readFileSync(f, 'utf8')] as const),
  );
};

/** Whether the repository has a file, as the renderer asks it. */
export const inRepo =
  (root: string) =>
  (repoPath: string): boolean =>
    existsSync(path.join(root, repoPath));
