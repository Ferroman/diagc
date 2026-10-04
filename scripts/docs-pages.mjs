// The documentation as pages of the site. docs/ is Markdown that reads on GitHub; this
// turns the same files into HTML in the landing page's look, with links that work between
// the pages. It only makes strings: scripts/build-site.mjs reads the files and writes the
// result, and packages/diagc/src/docsPages.test.ts calls it directly.
import path from 'node:path';
import { Marked, Renderer } from 'marked';

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
  // A page the index names twice is still one page: its row in a section wins over a
  // mention above the sections, and a first row over a later one. Rendered twice, it would
  // also have its links rewritten twice, and the second pass reports links nobody wrote.
  const inSection = new Set(entries.filter((e) => e.section !== undefined).map((e) => e.file));
  const seen = new Set();
  return entries.filter((e) => {
    if ((e.section === undefined && inSection.has(e.file)) || seen.has(e.file)) return false;
    seen.add(e.file);
    return true;
  });
}

/** One page: the landing page's head and header around the sidebar, the article and the
 * list of its headings. `root` is the way from the page up to the site's root. The header
 * is site/index.html's, with links that lead back to it; a test compares the two. The
 * sidebar is there twice, folded for a narrow screen and open beside the article for a
 * wide one, so neither needs a script; docs.css shows one of them. */
function page({ root, title, description, sidebar, article, headings, previous, next, source }) {
  const pager = (entry, label, side) =>
    entry === undefined ? '<span></span>' : `<a class="${side}" href="${esc(entry.href)}"><small>${label}</small>${esc(entry.title)}</a>`;
  const toc =
    headings.length < 2
      ? ''
      : `<aside class="docs-toc"><nav aria-label="On this page"><h2>On this page</h2><ul>${headings
          .map((h) => `<li><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`)
          .join('')}</ul></nav></aside>\n`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — diagc docs</title>
${description === '' ? '' : `<meta name="description" content="${esc(description)}">\n`}<script>try{var t=localStorage.getItem('diagc-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="${root}site.css">
<link rel="stylesheet" href="${root}docs.css">
<script src="${root}site.js" defer></script>
</head>
<body class="docs">
<header class="nav">
  <a class="brand" href="${root}index.html">diagc</a>
  <nav aria-label="Sections">
    <a href="${root}index.html#features">Features</a>
    <a href="${root}index.html#how-it-works">How it works</a>
    <a href="${root}index.html#demos">Demos</a>
    <a href="${root}docs/index.html" aria-current="true">Docs</a>
    <a href="${REPO}">GitHub</a>
    <button type="button" id="theme-switch" hidden></button>
  </nav>
</header>
<div class="docs-layout">
<details class="docs-menu"><summary>All pages</summary>${sidebar}</details>
<aside class="docs-side">${sidebar}</aside>
<main>
<article>
${article}</article>
<nav class="docs-pager" aria-label="Previous and next page">
${pager(previous, 'Previous', 'prev')}
${pager(next, 'Next', 'next')}
</nav>
<p class="docs-source"><a href="${esc(source)}">View this page on GitHub</a></p>
</main>
${toc}</div>
</body>
</html>
`;
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
  nav.forEach((entry, at) => {
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
      // Out of the site: a web or a mail address. Any other scheme (javascript:, data:) has
      // no place in a page of docs, and GitHub strips it too.
      if (isAbsolute(href)) {
        return /^(https?:|mailto:|\/\/)/i.test(href) ? href : dead(href, 'only http, https and mailto links leave the site');
      }
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
        // A wide table scrolls in a box of its own, so the page never scrolls sideways.
        table(token) {
          return `<div class="table-wrap">${Renderer.prototype.table.call(this, token)}</div>\n`;
        },
        // The docs use no raw HTML, and a stray <name> in prose must show, not vanish. A
        // comment is the exception, dropped as GitHub drops it: release-please finds the
        // version it bumps by one (docs/how-to/show-what-changed.md).
        html({ text }) {
          return /^\s*<!--[\s\S]*?-->\s*$/.test(text) ? '' : esc(text);
        },
        image({ href, title, text }) {
          return `<img src="${esc(href)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy">`;
        },
      },
    });
    marked.walkTokens(doc.tokens, (t) => {
      if (t.type === 'link') t.href = relink(t.href, false);
      else if (t.type === 'image') t.href = relink(t.href, true);
      // After an inline <kbd> or <code>, marked takes what follows for HTML and marks it as
      // escaped already. The tags are shown as text here, so what stands between them is too.
      else if (t.type === 'text' && t.escaped) t.escaped = false;
    });
    const href = (other) => to(path.posix.join('docs', outPath(other.file)));
    const item = (other) =>
      `<li><a href="${esc(href(other))}"${other.file === file ? ' aria-current="page"' : ''}>${esc(other.title)}</a></li>`;
    const sidebar = `<nav aria-label="Documentation">${[...new Set(nav.map((other) => other.section))]
      .map(
        (section) =>
          `${section === undefined ? '' : `<h2>${esc(section)}</h2>`}<ul>${nav
            .filter((other) => other.section === section)
            .map(item)
            .join('')}</ul>`,
      )
      .join('')}</nav>`;
    const beside = (other) => (other === undefined ? undefined : { href: href(other), title: other.title });
    pages.set(
      out,
      page({
        root: '../'.repeat(out.split('/').length - 1),
        title: doc.headings.find((h) => h.depth === 1)?.text ?? entry.title,
        description: entry.description,
        sidebar,
        article: marked.parser(doc.tokens),
        headings: doc.headings.filter((h) => h.depth === 2),
        previous: beside(nav[at - 1]),
        next: beside(nav[at + 1]),
        source: `${REPO}/blob/main/docs/${file}`,
      }),
    );
  });
  return { pages, errors };
}
