/*
 * diagc — author software-architecture diagrams as code.
 * Copyright (C) 2026 Bogdan Frankovskyi
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License version 3 as
 * published by the Free Software Foundation, with the additional permissions
 * granted under section 7 that are set out in the LICENSE file alongside this
 * package. Those permissions let you license diagram sources you author, and
 * the output produced from them, under terms of your choosing.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { errMessage } from '@diagramming/core';
import { compileFile } from './compile';
import { ejectDiagram } from './eject';
import { findHome, homePaths } from './home';
import { resolveInclude } from './includes';
import { snapshotSession } from './snapshots';
import { formatCompileEvent, startWatch } from './watch';
import { publishDiagrams } from './publish/publish';
import { runStudio } from './studio';

const USAGE = `Usage: diagc <compile|watch|publish|studio|eject> [files...] [--out dir]

Commands:
  compile   Compile *.diagram.{ts,json} sources into overlay artifacts once
  watch     Recompile — and live-recompile — a directory of sources
  publish   Compile and render an HTML/PNG site under .diagrams/
  studio    Run the visual studio against the current directory
  eject     Promote a JSON diagram to a generated TypeScript source (verified)

Options:
  --out dir       Artifact output directory (default .diagrams/.artifacts)
  --no-images     Publish HTML without rendering PNG images
  --update-includes  Refetch remote includes and rewrite the snapshot lock
  --help, -h      Show this help and exit
`;

interface Args {
  command: string;
  files: string[];
  out: string;
  images: boolean;
  updateIncludes: boolean;
}

/** Parse argv into command + flags. Unknown flags (anything `--…` that is not
 * recognized) are an error rather than being silently treated as a file path,
 * so a typo surfaces loudly instead of quietly skewing the file set. */
export function parseArgs(argv: string[]): Args {
  let command = 'compile';
  const files: string[] = [];
  let out = '.diagrams/.artifacts';
  let images = true;
  let updateIncludes = false;
  let commandSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--out') {
      out = argv[++i] ?? out;
      continue;
    }
    if (arg === '--no-images') {
      images = false;
      continue;
    }
    if (arg === '--update-includes') {
      updateIncludes = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') throw new HelpRequested();
    if (arg.startsWith('--')) throw new UnknownFlagError(arg);
    // The first non-flag argument names the command; anything after it is a
    // file path (flags may appear before or after the command).
    if (!commandSeen) {
      command = arg;
      commandSeen = true;
    } else {
      files.push(arg);
    }
  }
  return { command, files, out, images, updateIncludes };
}

/** Thrown by {@link parseArgs} for `--help`/`-h`; `main` prints usage and exits 0. */
export class HelpRequested extends Error {
  constructor() {
    super('help requested');
    this.name = 'HelpRequested';
  }
}

/** Thrown by {@link parseArgs} for an unrecognized flag; `main` prints the
 * offending flag plus usage and exits 1. */
export class UnknownFlagError extends Error {
  constructor(flag: string) {
    super(`Unknown flag '${flag}'`);
    this.name = 'UnknownFlagError';
  }
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof HelpRequested) {
      console.log(USAGE);
      process.exit(0);
    }
    if (e instanceof UnknownFlagError) {
      console.error(`diagc: ${e.message}\n`);
      console.error(USAGE);
      process.exit(1);
    }
    throw e;
  }
  const home = homePaths(findHome(fileURLToPath(import.meta.url)));
  // One session per CLI invocation, shared across every compile+publish in this
  // run: the in-memory lock + touched set must span the whole run for prune()
  // to see everything a full-tree compile actually resolved. `watch` builds its
  // own separate always-locked session below instead of sharing this one.
  const snap = snapshotSession(resolveInclude, '.diagrams', args.updateIncludes ? 'update' : 'locked');

  if (args.command === 'compile') {
    const files = args.files.length > 0 ? args.files : await fg('.diagrams/src/**/*.diagram.{ts,json}');
    let failed = false;
    for (const file of files) {
      try {
        const artifact = await compileFile(file, args.out, {
          rootDir: '.diagrams/src',
          coreEntry: home.coreEntry,
          resolver: snap.resolver,
        });
        console.log(formatCompileEvent({ file, ok: true, artifact }));
      } catch (e) {
        failed = true;
        console.error(formatCompileEvent({ file, ok: false, error: errMessage(e) }));
      }
    }
    // A source that fails before include resolution (e.g. a pre-compose
    // validation error) never touches its remote URLs, so pruning here would
    // drop their still-valid lock entries and vendored files right along with
    // the genuinely stale ones — skip the prune until every file compiles clean.
    if (args.updateIncludes && args.files.length === 0 && !failed) await snap.prune();
    process.exit(failed ? 1 : 0);
  } else if (args.command === 'watch') {
    // Always locked, independent of args.updateIncludes: watch is a long-running
    // live loop with no point at which "refetch and rewrite the lock" makes
    // sense, so it ignores the flag by design rather than inheriting the shared
    // session's mode (mirrors studio.ts's own hardcoded 'locked' session).
    if (args.updateIncludes) console.error('ignoring --update-includes: watch always runs locked');
    const dir = args.files[0] ?? '.diagrams/src';
    const watchSnap = snapshotSession(resolveInclude, '.diagrams', 'locked');
    startWatch(dir, args.out, {
      coreEntry: home.coreEntry,
      resolver: watchSnap.resolver,
      onEvent: (e) => {
        // Success goes to stdout, failure to stderr, so the streams stay parsed
        // separately by anyone piping them.
        if (e.ok) console.log(formatCompileEvent(e));
        else console.error(formatCompileEvent(e));
      },
    });
    console.log(`Watching ${dir} for *.diagram.{ts,json} changes...`);
  } else if (args.command === 'publish') {
    if (!existsSync(home.viewerShell)) {
      // Only a checkout can be missing it; an installed package ships the shell,
      // so there the message would send the reader off to build a repo they
      // do not have.
      console.error(
        home.layout === 'monorepo'
          ? 'viewer shell not built — run `pnpm --filter @diagramming/viewer build` in the monorepo.'
          : `viewer shell missing from this install (${home.viewerShell}) — reinstall diagc.`,
      );
      process.exit(1);
    }
    const srcDir = '.diagrams/src';
    const artifactsDir = '.diagrams/.artifacts';
    // Compile first so artifacts reflect current sources (TS + include expansion).
    const sources = await fg('**/*.diagram.{ts,json}', { cwd: srcDir, absolute: true });
    for (const f of sources) {
      try {
        await compileFile(f, artifactsDir, { rootDir: srcDir, coreEntry: home.coreEntry, resolver: snap.resolver });
      } catch (e) {
        console.error(`✗ ${f}\n${errMessage(e)}`);
      }
    }
    // publish's glob above ignores args.files (that only scopes which rendered
    // pages come out below), so it always compiles the whole source tree —
    // an update run here is always full-tree, so the prune is unguarded.
    if (args.updateIncludes) await snap.prune();
    let images = args.images;
    let renderPng: ((htmlPath: string, pngPath: string) => Promise<void>) | undefined;
    if (args.images) {
      const snapshot = await import('./publish/snapshot');
      if (snapshot.findChrome() === undefined) {
        console.log(
          'No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.',
        );
        images = false;
      } else {
        renderPng = snapshot.renderPng;
      }
    }
    const res = await publishDiagrams({
      srcDir,
      artifactsDir,
      htmlDir: '.diagrams/html',
      staticDir: '.diagrams/static',
      shellPath: home.viewerShell,
      libraryDir: home.libraryDir,
      assetsDir: path.join(srcDir, 'assets'),
      images,
      names: args.files,
      ...(renderPng !== undefined ? { renderPng } : {}),
    });
    console.log(`✓ ${res.pages.length} page(s) -> .diagrams/html`);
    if (res.images.length > 0) console.log(`✓ ${res.images.length} image(s) -> .diagrams/static`);
    console.log(`✓ gallery -> ${res.gallery}`);
    process.exit(0);
  } else if (args.command === 'studio') {
    // Studio's own compile-watch loop always resolves includes locked (see
    // studio.ts) — same reasoning as watch above.
    if (args.updateIncludes) console.error('ignoring --update-includes: studio always runs locked');
    await runStudio(home, process.cwd());
    return;
  } else if (args.command === 'eject') {
    // ejectDiagram's post-swap recompile always resolves includes locked (see
    // eject.ts) — same reasoning as watch above.
    if (args.updateIncludes) console.error('ignoring --update-includes: eject always runs locked');
    const name = args.files[0]?.replace(/^\.diagrams\/src\//, '').replace(/\.diagram\.(ts|json)$/, '');
    if (name === undefined || name === '') {
      console.error('diagc: eject needs a diagram name.');
      console.error(USAGE);
      process.exit(1);
    }
    try {
      const res = await ejectDiagram('.diagrams/src', args.out, name, { coreEntry: home.coreEntry });
      console.log(`✓ ${res.tsPath}`);
      process.exit(0);
    } catch (e) {
      console.error(errMessage(e));
      process.exit(1);
    }
  } else {
    console.error(`diagc: Unknown command '${args.command}'.`);
    console.error(USAGE);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(errMessage(e));
  process.exit(1);
});
