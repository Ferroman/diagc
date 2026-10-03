// The documentation as pages of the site. docs/ is Markdown that reads on GitHub; this
// turns the same files into HTML in the landing page's look, with links that work between
// the pages. It only makes strings: scripts/build-site.mjs reads the files and writes the
// result, and packages/diagc/src/docsPages.test.ts calls it directly.
import path from 'node:path';
import { Marked } from 'marked';

export const REPO = 'https://github.com/Ferroman/diagc';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

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

/** Every page of the docs, and every link in them that leads nowhere.
 * `files`: a path under docs/ (posix) -> its Markdown. `exists(repoPath)`: whether the
 * repository has that file. Returns `pages`: a path under the site -> its HTML, and
 * `errors`: one line per dead link, `docs/<file>: <href> — <reason>`. The caller decides
 * what a dead link costs; here it is only found. */
export function renderDocs({ files, exists }) {
  const errors = [];
  const nav = readNav(files.get('README.md') ?? '').filter((entry) => files.has(entry.file));
  const listed = new Set(nav.map((entry) => entry.file));
  for (const file of files.keys()) if (!listed.has(file)) errors.push(`docs/${file}: not listed in docs/README.md`);

  // First every page's tokens and heading ids, so a link can be checked against its target.
  const parsed = new Map();
  for (const [file, markdown] of files) {
    const marked = new Marked();
    const tokens = marked.lexer(markdown);
    const slug = slugger();
    const headings = [];
    marked.walkTokens(tokens, (t) => {
      if (t.type !== 'heading') return;
      t.id = slug(plain(t.tokens));
      headings.push({ id: t.id, depth: t.depth, text: plain(t.tokens) });
    });
    parsed.set(file, { tokens, headings, ids: new Set(headings.map((h) => h.id)) });
  }

  const pages = new Map();
  nav.forEach((entry) => {
    const { file } = entry;
    const doc = parsed.get(file);
    const out = path.posix.join('docs', outPath(file));
    /** From this page to another path of the site. */
    const to = (sitePath) => path.posix.relative(path.posix.dirname(out), sitePath);
    const dead = (href, why) => {
      errors.push(`docs/${file}: ${href} — ${why}`);
      return href;
    };
    // Where a link written for GitHub leads on the site. Another docs page: that page.
    // A picture: the site's copy under static/. Any other file: its page on GitHub.
    const relink = (href, picture) => {
      if (isAbsolute(href)) return href;
      if (href.startsWith('#')) return doc.ids.has(decode(href.slice(1))) ? href : dead(href, 'no such heading on this page');
      const [target, hash] = href.split('#');
      const suffix = hash === undefined ? '' : `#${hash}`;
      const repoPath = path.posix.normalize(path.posix.join('docs', path.posix.dirname(file), decode(target)));
      if (repoPath.startsWith('..')) return dead(href, 'leaves the repository');
      if (repoPath.startsWith('.diagrams/static/')) {
        return exists(repoPath) ? to(repoPath.slice('.diagrams/'.length)) : dead(href, 'no such picture');
      }
      if (picture) return dead(href, 'a picture must be under .diagrams/static/');
      if (repoPath.startsWith('docs/') && repoPath.endsWith('.md')) {
        const other = repoPath.slice('docs/'.length);
        const there = parsed.get(other);
        if (there === undefined) return dead(href, 'no such page');
        if (hash !== undefined && !there.ids.has(decode(hash))) return dead(href, 'no such heading on that page');
        return to(path.posix.join('docs', outPath(other))) + suffix;
      }
      return exists(repoPath) ? `${REPO}/blob/main/${repoPath}${suffix}` : dead(href, 'no such file in the repository');
    };

    const marked = new Marked({
      renderer: {
        heading({ tokens, depth, id }) {
          return `<h${depth} id="${esc(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
        },
      },
    });
    marked.walkTokens(doc.tokens, (t) => {
      if (t.type === 'link') t.href = relink(t.href, false);
      else if (t.type === 'image') t.href = relink(t.href, true);
    });
    pages.set(out, `<article>\n${marked.parser(doc.tokens)}</article>\n`);
  });
  return { pages, errors };
}
