import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTATIONS } from '@diagc/core';
import { ALL_TOPIC, guideTopics, renderGuide, type GuideContext } from './guide';
import { cliVersion, findHome, homePaths } from './home';
import { lintFile } from './lint';
import { starterTypes } from './starters';

// A test of the guide's TEXT — the files this checkout ships — where guide.test.ts
// tests the renderer on fixtures. Like docsExamples.test.ts it only ever runs in a
// checkout: tests do not ship.
const home = homePaths(findHome(fileURLToPath(import.meta.url)));
const ctx: GuideContext = { guideDir: home.guideDir, startersDir: home.startersDir, version: cliVersion(home.root) };

/** `undefined` is the index, as `renderGuide` takes it. */
const pages: [string, string | undefined][] = [['index', undefined], ...guideTopics(ctx.guideDir).map((t): [string, string] => [t, t])];

// The index is what an agent reads first, on every task: its size is a cost paid
// each time, so it is a budget and not a guideline.
const INDEX_MAX_LINES = 300;
const TOPIC_MAX_LINES = 120;

const tsBlocks = (md: string): string[] => [...md.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map((m) => m[1]!);

describe('guide content', () => {
  it.each(pages)('%s stays within its line budget', (_name, page) => {
    const lines = renderGuide(page, ctx).split('\n').length;
    expect(lines).toBeLessThanOrEqual(page === undefined ? INDEX_MAX_LINES : TOPIC_MAX_LINES);
  });

  it.each(pages)(
    '%s: every ts block is a whole module that compiles and lints clean',
    async (_name, page) => {
      const blocks = tsBlocks(renderGuide(page, ctx));
      expect(blocks.length).toBeGreaterThan(0);
      const dir = mkdtempSync(path.join(tmpdir(), 'diagc-guide-blocks-'));
      try {
        for (const [i, src] of blocks.entries()) {
          // A fragment cannot be checked, and an agent copies what it is shown.
          expect(src, `block ${i + 1} is a fragment`).toContain('export default');
          const file = path.join(dir, `block-${i + 1}.diagram.ts`);
          writeFileSync(file, src);
          expect(await lintFile(file, { coreEntry: home.coreEntry }), `block ${i + 1}`).toEqual([]);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe('guide coverage', () => {
  it('has a topic for every starter type but basic, and nothing else', () => {
    // Derived from the files, not listed: a new diagram type that ships a starter
    // without a topic (or the reverse) fails here. `basic` is the index's own.
    const types = starterTypes(ctx.startersDir);
    expect(guideTopics(ctx.guideDir)).toEqual(types.filter((t) => t !== 'basic'));
  });

  it('has a starter for every notation, for ER, for activity and for basic', () => {
    const types = starterTypes(ctx.startersDir);
    for (const id of [...BUILTIN_NOTATIONS, 'er', 'activity', 'basic']) expect(types, id).toContain(id);
  });

  it('keeps the names the renderer reserves free', () => {
    expect(guideTopics(ctx.guideDir)).not.toContain(ALL_TOPIC);
  });

  it('lists in docs/reference/cli.md the topics the package ships', () => {
    // That list is typed by hand; this is what makes a new topic page fail until
    // the reference names it.
    const cli = readFileSync(path.join(home.root, 'docs', 'reference', 'cli.md'), 'utf8');
    const line = cli.split('\n').find((l) => l.startsWith('- **Topics:**'));
    expect(line, 'a "**Topics:**" bullet in the guide section').toBeDefined();
    const listed = [...line!.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    expect(listed).toEqual(guideTopics(ctx.guideDir));
  });
});

describe('diagc guide, through the real CLI', () => {
  // The development entry: tsx-registered, no build step. Run from a directory with
  // no diagrams, because the guide must not need any.
  const bin = path.join(home.root, 'bin', 'diagc.mjs');
  const cwd = tmpdir();

  it('prints the whole guide through a pipe, complete', () => {
    const out = execFileSync(process.execPath, [bin, 'guide', ALL_TOPIC], { encoding: 'utf8', cwd });
    expect(out).toBe(`${renderGuide(ALL_TOPIC, ctx)}\n`);
  }, 30_000);

  it('prints one topic', () => {
    const out = execFileSync(process.execPath, [bin, 'guide', 'c4'], { encoding: 'utf8', cwd });
    expect(out).toBe(`${renderGuide('c4', ctx)}\n`);
  }, 30_000);

  it('refuses an unknown topic on stderr with exit 1 and nothing on stdout', () => {
    const r = spawnSync(process.execPath, [bin, 'guide', 'nope'], { encoding: 'utf8', cwd });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("diagc: No guide topic 'nope'. Topics: all, activity, c4");
  }, 30_000);

  it('lists guide in --help', () => {
    const out = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8', cwd });
    expect(out).toMatch(/^ {2}guide /m);
  }, 30_000);
});
