import { existsSync } from 'node:fs';
import path from 'node:path';
import { errMessage } from '@diagc/core/internal';
import type { Command, Context } from '../cli/command';
import { compileFile } from '../compile';
import { globSorted } from '../glob';
import { discoverDiagrams } from '../publish/discover';
import { publishDiagrams, type PublishOptions } from '../publish/publish';
import { formatCompileEvent } from '../watch';
import { ARTIFACTS_DIR, diagramNames, warnNoSources } from './shared';

type PublishDirs = Pick<PublishOptions, 'srcDir' | 'artifactsDir' | 'htmlDir' | 'staticDir' | 'assetsDir'>;

/** Where `publish` compiles to and builds pages from. One object for both steps, so
 * the pages are always made from the artifacts this run just wrote. `--out` moves the
 * artifacts only: the pages and PNGs stay where `.gitignore`, the docs and the READMEs
 * that embed them expect to find them. */
export function publishDirs(out: string): PublishDirs {
  const srcDir = '.diagrams/src';
  return {
    srcDir,
    artifactsDir: out,
    htmlDir: '.diagrams/html',
    staticDir: '.diagrams/static',
    assetsDir: path.join(srcDir, 'assets'),
  };
}

/** Compile every source first, so the pages reflect the sources as they are (TS and
 * include expansion), each failure on stderr in compile's form. Says whether one failed. */
async function compileSources(dirs: PublishDirs, { io, home, snapshots }: Context): Promise<boolean> {
  const sources = await globSorted('**/*.diagram.{ts,json}', { cwd: dirs.srcDir, absolute: true });
  if (sources.length === 0) warnNoSources(io, dirs.srcDir);
  let failed = false;
  for (const f of sources) {
    try {
      await compileFile(f, dirs.artifactsDir, {
        rootDir: dirs.srcDir,
        coreEntry: home.coreEntry,
        resolver: snapshots.resolver,
        warn: io.err,
      });
    } catch (e) {
      failed = true;
      io.err(formatCompileEvent({ file: f, ok: false, error: errMessage(e) }));
    }
  }
  return failed;
}

/** `diagc publish [names...]`: compile, then a page per diagram, the gallery, and PNGs. */
export const publish: Command<'--out' | '--no-images' | '--link' | '--update-includes'> = {
  flags: ['--out', '--no-images', '--link', '--update-includes'],
  async run({ positionals, flags }, ctx) {
    const { io, home, snapshots } = ctx;
    if (!existsSync(home.viewerShell)) {
      // Only a checkout can be missing it; an installed package ships the shell,
      // so there the message would send the reader off to build a repo they
      // do not have.
      io.err(
        home.layout === 'monorepo'
          ? 'viewer shell not built — run `pnpm --filter @diagc/viewer build` in the monorepo.'
          : `viewer shell missing from this install (${home.viewerShell}) — reinstall diagc.`,
      );
      return 1;
    }
    const dirs = publishDirs(flags['--out'] ?? ARTIFACTS_DIR);
    const failed = await compileSources(dirs, ctx);
    // publish compiles every source whatever names it is given (they only scope which
    // rendered pages come out below), so an update run here is always full-tree; like
    // compile's, its prune waits until every source compiles.
    if (flags['--update-includes'] === true && !failed) await snapshots.prune();
    const discovered = await discoverDiagrams(dirs.artifactsDir, dirs.srcDir);
    const names = diagramNames(io, positionals, new Set(discovered.map((d) => d.name)));
    if (names === undefined) return 1;
    let images = flags['--no-images'] !== true;
    let renderPng: ((htmlPath: string, pngPath: string) => Promise<void>) | undefined;
    if (images) {
      const snapshot = await import('../publish/snapshot');
      if (snapshot.findChrome() === undefined) {
        io.err('No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.');
        images = false;
      } else {
        renderPng = snapshot.renderPng;
      }
    }
    const res = await publishDiagrams({
      ...dirs,
      shellPath: home.viewerShell,
      libraryDir: home.libraryDir,
      images,
      names,
      ...(renderPng !== undefined ? { renderPng } : {}),
      ...(flags['--link'] !== undefined ? { link: flags['--link'] } : {}),
      warn: io.err,
    });
    io.out(`✓ ${res.pages.length} page(s) -> ${dirs.htmlDir}`);
    if (res.images.length > 0) io.out(`✓ ${res.images.length} image(s) -> ${dirs.staticDir}`);
    io.out(`✓ gallery -> ${res.gallery}`);
    return failed || res.skipped.length > 0 ? 1 : 0;
  },
};
