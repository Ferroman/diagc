import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { guideTopics, renderGuide, type GuideContext } from './guide';
import { cliVersion, findHome, homePaths } from './home';
import { lintFile } from './lint';

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
      for (const [i, src] of blocks.entries()) {
        // A fragment cannot be checked, and an agent copies what it is shown.
        expect(src, `block ${i + 1} is a fragment`).toContain('export default');
        const file = path.join(dir, `block-${i + 1}.diagram.ts`);
        writeFileSync(file, src);
        expect(await lintFile(file, { coreEntry: home.coreEntry }), `block ${i + 1}`).toEqual([]);
      }
    },
    60_000,
  );
});
