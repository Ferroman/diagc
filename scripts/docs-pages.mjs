// The documentation as pages of the site. docs/ is Markdown that reads on GitHub; this
// turns the same files into HTML in the landing page's look, with links that work between
// the pages. It only makes strings: scripts/build-site.mjs reads the files and writes the
// result, and packages/diagc/src/docsPages.test.ts calls it directly.
import path from 'node:path';
import { Marked } from 'marked';

/** A heading's id, as GitHub makes it: lower case, punctuation dropped, a hyphen for each
 * space. One slugger per page, because a repeated heading gets -1, -2. The docs link to
 * headings by these ids, so the same `#anchor` has to work in both places. */
export function slugger() {
  const seen = new Map();
  return (text) => {
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/** The words of inline tokens, with the markup dropped. */
const plain = (tokens) => tokens.map((t) => (t.tokens !== undefined ? plain(t.tokens) : (t.text ?? ''))).join('');

/** A page's path under docs/ on the site. A folder's README is its index. */
export const outPath = (file) =>
  path.posix.basename(file) === 'README.md'
    ? path.posix.join(path.posix.dirname(file), 'index.html')
    : file.replace(/\.md$/, '.html');

const isAbsolute = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

const firstLink = (tokens) => {
  for (const t of tokens ?? []) {
    if (t.type === 'link') return t;
    const inner = firstLink(t.tokens);
    if (inner !== undefined) return inner;
  }
  return undefined;
};

/** The navigation, read from the docs index, which is the one place that lists every page
 * (a test keeps it complete). The index comes first, then a page linked above the first
 * `##` (the examples), then each section: its `##` heading, and the first link of every
 * row of its table, with the row's second cell as the page's description. */
export function readNav(indexMarkdown) {
  const tokens = new Marked().lexer(indexMarkdown);
  const title = tokens.find((t) => t.type === 'heading' && t.depth === 1);
  const entries = [
    { file: 'README.md', title: title === undefined ? 'Documentation' : plain(title.tokens), description: '', section: undefined },
  ];
  let section;
  const add = (link, description) => {
    if (link === undefined || isAbsolute(link.href)) return;
    const file = path.posix.normalize(link.href.split('#')[0]);
    if (file.endsWith('.md')) entries.push({ file, title: plain(link.tokens), description, section });
  };
  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === 2) section = plain(t.tokens);
    else if (t.type === 'table') {
      for (const row of t.rows) add(firstLink(row[0]?.tokens), row[1] === undefined ? '' : plain(row[1].tokens));
    } else if (t.type === 'paragraph' && section === undefined) add(firstLink(t.tokens), '');
  }
  return entries;
}
