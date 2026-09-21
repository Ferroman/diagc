import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findHome } from './home';

// A test of the repo's docs, kept in this package for two reasons: it is the one package
// that is allowed to touch the filesystem, and the root vitest `include` only looks under
// packages/ and apps/. It only ever runs in a checkout — tests do not ship.
const root = findHome(fileURLToPath(import.meta.url)).root;
const SRC = path.join(root, '.diagrams', 'src');
const GALLERY = path.join(root, 'docs', 'examples', 'README.md');
const LIVE = 'https://ferroman.github.io/diagc/html/';

/** type folder under examples/ → the how-to that shows its starter */
const HOW_TO: Record<string, string> = {
  c4: 'draw-a-c4-diagram.md',
  activity: 'draw-an-activity-diagram.md',
  'git-graph': 'draw-a-git-branching-diagram.md',
  fishbone: 'draw-a-fishbone-diagram.md',
  'second-order': 'draw-a-second-order-thinking-diagram.md',
  'threat-model': 'draw-a-threat-model.md',
  er: 'draw-an-er-diagram.md',
  'causal-loop': 'draw-a-causal-loop-diagram.md',
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}
const isSource = (f: string): boolean => /\.diagram\.(ts|json)$/.test(f);
const nameOf = (f: string): string =>
  path.relative(SRC, f).split(path.sep).join('/').replace(/\.diagram\.(ts|json)$/, '');
const rel = (f: string): string => path.relative(root, f);
const isExternal = (t: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(t);

const pages = [path.join(root, 'README.md'), ...walk(path.join(root, 'docs')).filter((f) => f.endsWith('.md'))];

/** Link and image targets in a page's prose. Fenced blocks and code spans are dropped
 * first: a listing may show a sample embed (the tutorial's `![Shop](…)`) that is not a
 * link of ours. */
function targets(md: string): string[] {
  const prose = md.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]!);
}

describe('docs and examples', () => {
  it('lists every example in the gallery page', () => {
    const linked = new Set(
      targets(readFileSync(GALLERY, 'utf8'))
        .filter((t) => !isExternal(t))
        .map((t) => path.resolve(path.dirname(GALLERY), t.split('#')[0]!)),
    );
    const unlisted = walk(path.join(SRC, 'examples'))
      .filter(isSource)
      // an include target is a part of its umbrella, not an example of its own
      .filter((f) => !f.split(path.sep).includes('parts'))
      .filter((f) => !linked.has(f))
      .map(rel);
    expect(unlisted).toEqual([]);
  });

  it('has no dead relative link or image in README.md and docs/', () => {
    const dead: string[] = [];
    for (const page of pages) {
      for (const t of targets(readFileSync(page, 'utf8'))) {
        if (isExternal(t) || t.startsWith('#')) continue;
        const file = path.resolve(path.dirname(page), decodeURIComponent(t.split('#')[0]!));
        if (!existsSync(file)) dead.push(`${rel(page)} -> ${t}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('points every live-page link at a diagram that exists', () => {
    const names = new Set(walk(SRC).filter(isSource).map(nameOf));
    const bad: string[] = [];
    for (const page of pages) {
      for (const t of targets(readFileSync(page, 'utf8'))) {
        if (!t.startsWith(LIVE)) continue;
        const name = t.slice(LIVE.length).replace(/\.html(#.*)?$/, '');
        if (!names.has(name)) bad.push(`${rel(page)} -> ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('shows each starter in its how-to exactly as the file has it', () => {
    const drift: string[] = [];
    for (const [type, page] of Object.entries(HOW_TO)) {
      const starter = path.join(SRC, 'examples', type, 'starter.diagram.ts');
      if (!existsSync(starter)) continue; // that type's examples have not landed yet
      const howTo = path.join(root, 'docs', 'how-to', page);
      const shown = existsSync(howTo) ? readFileSync(howTo, 'utf8') : '';
      const listing = '```ts\n' + readFileSync(starter, 'utf8').trimEnd() + '\n```';
      if (!shown.includes(listing)) drift.push(`${page} does not show ${rel(starter)} verbatim`);
    }
    expect(drift).toEqual([]);
  });
});
