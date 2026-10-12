import { existsSync } from 'node:fs';
import path from 'node:path';
import { errMessage } from '@diagc/core/internal';
import type { Command } from '../cli/command';
import type { CliIo } from '../cli/io';
import {
  compareDiagramSets,
  formatDiffJson,
  formatDiffSummary,
  loadDiagramSet,
  writeDiffPages,
  type DiagramSet,
} from '../diff/index';
import { checkoutDiagrams, type CheckedOutRef } from '../git-ref';
import { diagramNames } from './shared';

/** `A..B` or `A` (against the working tree). */
export function parseRange(range: string): { from: string; to?: string } {
  const at = range.indexOf('..');
  if (at === -1) return { from: range };
  const from = range.slice(0, at);
  const to = range.slice(at + 2);
  if (from === '' || to === '' || to.startsWith('.'))
    throw new Error(`'${range}' is not a range: write <from>..<to>, or one ref to compare with the working tree`);
  return { from, to };
}

/** A ref as a directory name: `v1.0..feature/x` -> `v1.0..feature-x`. */
export function diffOutDir(from: string, to: string | undefined): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-');
  return path.join('.diagrams', 'diff', `${safe(from)}..${to !== undefined ? safe(to) : 'working-tree'}`);
}

/** Each sidecar diff left out of its pictures, on stderr so `--json` stays parseable. */
function warnLeftOut(io: CliIo, ...sets: DiagramSet[]): void {
  for (const set of sets) for (const w of set.warnings) io.err(w);
}

/** `diagc diff <from>[..<to>] [names...]`: what changed, and the pages that show it. */
export const diff: Command<'--out' | '--no-images' | '--json' | '--labels' | '--image-url'> = {
  flags: ['--out', '--no-images', '--json', '--labels', '--image-url'],
  async run({ positionals, flags }, { io, usage, home }) {
    const range = positionals[0];
    if (range === undefined) {
      io.err('diagc: diff needs a git ref (diff v1.0) or a range (diff v1.0..v2.0).');
      io.err(usage);
      return 1;
    }
    const checkouts: CheckedOutRef[] = [];
    try {
      const { from, to } = parseRange(range);
      const before = await checkoutDiagrams(from, process.cwd());
      checkouts.push(before);
      let afterDir = '.diagrams';
      if (to !== undefined) {
        const after = await checkoutDiagrams(to, process.cwd());
        checkouts.push(after);
        afterDir = after.diagramsDir;
      }
      const fromLabel = flags['--labels']?.[0] ?? from;
      const toLabel = flags['--labels']?.[1] ?? to ?? 'working tree';
      const beforeSet = await loadDiagramSet(fromLabel, before.diagramsDir, home.coreEntry);
      const afterSet = await loadDiagramSet(toLabel, afterDir, home.coreEntry);
      warnLeftOut(io, beforeSet, afterSet);
      const known = new Set([beforeSet, afterSet].flatMap((set) => [...set.versions.keys(), ...set.errors.keys()]));
      const names = diagramNames(io, positionals.slice(1), known);
      if (names === undefined) return 1;
      const diffs = compareDiagramSets(beforeSet, afterSet, names);
      io.out(
        flags['--json'] === true
          ? formatDiffJson(diffs, fromLabel, toLabel)
          : formatDiffSummary(diffs, fromLabel, toLabel),
      );
      if (!diffs.some((d) => d.status === 'added' || d.status === 'removed' || d.status === 'changed')) return 0;
      if (!existsSync(home.viewerShell)) {
        io.err('viewer shell not available — writing the summary only (see `diagc publish` for how to build it).');
        return 0;
      }
      let renderPng: ((htmlPath: string, pngPath: string) => Promise<void>) | undefined;
      if (flags['--no-images'] !== true) {
        const snapshot = await import('../publish/snapshot');
        if (snapshot.findChrome() === undefined)
          io.err('No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.');
        else renderPng = snapshot.renderPng;
      }
      const outDir = flags['--out'] ?? diffOutDir(from, to);
      const res = await writeDiffPages(diffs, {
        outDir,
        shellPath: home.viewerShell,
        libraryDir: home.libraryDir,
        before: beforeSet,
        after: afterSet,
        ...(renderPng !== undefined ? { renderPng } : {}),
        ...(flags['--image-url'] !== undefined ? { imageUrl: flags['--image-url'] } : {}),
      });
      // stderr, so `--json` output stays parseable on stdout
      io.err(
        `✓ ${res.pages.length} page(s)${res.images.length > 0 ? `, ${res.images.length} image(s)` : ''} -> ${outDir}`,
      );
      io.err(`✓ side by side -> ${res.index}`);
      io.err(`✓ for an ADR -> ${res.summary}`);
      return 0;
    } catch (e) {
      io.err(`diagc: ${errMessage(e)}`);
      return 1;
    } finally {
      for (const c of checkouts) await c.cleanup();
    }
  },
};
