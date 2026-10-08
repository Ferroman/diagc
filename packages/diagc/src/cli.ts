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
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { errMessage } from '@diagc/core/internal';
import { compileFile } from './compile';
import { compareDiagramSets, formatDiffSummary, loadDiagramSet, writeDiffPages } from './diff';
import { checkoutDiagrams, type CheckedOutRef } from './git-ref';
import { ejectDiagram } from './eject';
import { formatLintReport, lintFile, type LintReport } from './lint';
import { runGuide } from './guide';
import { cliVersion, findHome, homePaths } from './home';
import { diagramName, runInit } from './init';
import { resolveInclude } from './includes';
import { snapshotSession } from './snapshots';
import { formatCompileEvent, startWatch } from './watch';
import { galleryLink } from './publish/gallery';
import { publishDiagrams, type PublishOptions } from './publish/publish';
import { runStudio } from './studio';

const USAGE = `Usage: diagc <init|compile|lint|watch|publish|studio|eject|diff|guide> [files...] [--out dir]

Commands:
  init      init [name] [--type <type>] [--agents]: set a repository up — a starter
            diagram under .diagrams/src (compiled), the .gitignore lines, and with
            --agents a pointer to the guide for coding agents (AGENTS.md / CLAUDE.md,
            and a skill where Claude Code is in use)
  compile   Compile *.diagram.{ts,json} sources into overlay artifacts once
  lint      Report suspicious diagrams (typos, duplicates, unused or undrawn parts); exit 1 on any
  watch     Recompile — and live-recompile — a directory of sources
  publish   Compile and render an HTML/PNG site under .diagrams/
  studio    Run the visual studio against the current directory
  eject     Promote a JSON diagram to a generated TypeScript source (verified)
  diff      diff <from>[..<to>] [names...]: what changed in the diagrams between two git
            refs (or a ref and the working tree), with before/after pages and PNGs
  guide     guide [topic]: how to write a diagram, for a person or a coding agent — the
            DSL, then one topic per diagram type ('guide all' prints every topic)

Options:
  --out dir       Artifact output directory (default .diagrams/.artifacts;
                  diff: .diagrams/diff/<from>..<to>)
  --no-images     Publish (or diff) HTML without rendering PNG images
  --link url      Publish with a link to url in the index header
  --json          lint: print the findings as a JSON array; diff: the changes as JSON
  --labels a,b    diff: name the two sides (default: the refs)
  --image-url t   diff: summary.md's image links as t, {path} standing for each PNG
  --update-includes  Refetch remote includes and rewrite the snapshot lock
  --type <type>   init: the starter to copy (default basic; 'diagc guide' lists the types)
  --agents        init: write the coding-agent block into AGENTS.md / CLAUDE.md, and
                  the skill into .claude/skills/diagc/ where Claude Code is in use
  --help, -h      Show this help and exit
`;

interface Args {
  command: string;
  files: string[];
  out: string;
  /** `--out` was passed: diff only defaults its own directory when it was not */
  outGiven: boolean;
  images: boolean;
  updateIncludes: boolean;
  /** `--json`: lint's findings as one JSON array on stdout */
  json: boolean;
  /** `--link`: validated here, so a bad address fails before anything is compiled */
  link?: string;
  /** diff `--image-url`: a URL template for summary.md's images, `{path}` per PNG */
  imageUrl?: string;
  /** diff `--labels before,after`: names for the two sides in place of the refs */
  labels?: [string, string];
  /** init `--type`: which starter to copy */
  type?: string;
  /** init `--agents`: write the coding-agent block and the Claude Code skill */
  agents: boolean;
}

/** Parse argv into command + flags. Unknown flags (anything `--…` that is not
 * recognized) are an error rather than being silently treated as a file path,
 * so a typo surfaces loudly instead of quietly skewing the file set. */
export function parseArgs(argv: string[]): Args {
  let command = 'compile';
  const files: string[] = [];
  let out = '.diagrams/.artifacts';
  let outGiven = false;
  let images = true;
  let updateIncludes = false;
  let json = false;
  let link: string | undefined;
  let imageUrl: string | undefined;
  let labels: [string, string] | undefined;
  let type: string | undefined;
  let agents = false;
  let commandSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--out') {
      // No fallback to the default: a trailing --out would quietly write somewhere the
      // user did not ask for, and a missing value would swallow the next flag as the dir.
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new BadFlagValueError('--out', 'needs a directory, e.g. --out build/artifacts');
      out = value;
      outGiven = true;
      i++;
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
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--type') {
      // No fallback: a missing value would otherwise swallow the next flag as the type.
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new BadFlagValueError('--type', "needs a diagram type, e.g. --type c4 ('diagc guide' lists them)");
      type = value;
      i++;
      continue;
    }
    if (arg === '--agents') {
      agents = true;
      continue;
    }
    if (arg === '--image-url') {
      const value = argv[++i] ?? '';
      if (!value.includes('{path}'))
        throw new BadFlagValueError('--image-url', 'needs a {path} placeholder, e.g. https://host/pr-1/{path}');
      imageUrl = value;
      continue;
    }
    if (arg === '--labels') {
      const parts = (argv[++i] ?? '').split(',');
      if (parts.length !== 2 || parts.some((p) => p.trim() === ''))
        throw new BadFlagValueError('--labels', 'takes two names, before and after: --labels main,#12');
      labels = [parts[0]!.trim(), parts[1]!.trim()];
      continue;
    }
    if (arg === '--link') {
      // No fallback for a missing value: there is no default address, and the URL
      // check is also what stops the next flag being swallowed as one.
      const value = argv[++i] ?? '';
      try {
        galleryLink(value);
      } catch (e) {
        throw new BadFlagValueError('--link', errMessage(e));
      }
      link = value;
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
  return {
    command,
    files,
    out,
    outGiven,
    images,
    updateIncludes,
    json,
    agents,
    ...(type !== undefined ? { type } : {}),
    ...(link !== undefined ? { link } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    ...(labels !== undefined ? { labels } : {}),
  };
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

/** Thrown by {@link parseArgs} for a flag whose value is missing or unusable; `main`
 * reports it the same way as an unknown flag. */
export class BadFlagValueError extends Error {
  constructor(flag: string, why: string) {
    super(`${flag}: ${why}`);
    this.name = 'BadFlagValueError';
  }
}

const SOURCES = '.diagrams/src/**/*.diagram.{ts,json}';

/** The one message a repository with no diagrams gets, on stderr: `lint --json`'s
 * stdout stays an array and the exit codes hold, so CI without diagrams passes. */
function warnNoSources(dir = '.diagrams/src'): void {
  console.error(`No diagrams under ${dir} — run 'diagc init' to create one.`);
}

/** Where `publish` compiles to and builds pages from. One object for both steps, so
 * the pages are always made from the artifacts this run just wrote. `--out` moves the
 * artifacts only: the pages and PNGs stay where `.gitignore`, the docs and the READMEs
 * that embed them expect to find them. */
export function publishDirs(
  args: Pick<Args, 'out'>,
): Pick<PublishOptions, 'srcDir' | 'artifactsDir' | 'htmlDir' | 'staticDir' | 'assetsDir'> {
  const srcDir = '.diagrams/src';
  return {
    srcDir,
    artifactsDir: args.out,
    htmlDir: '.diagrams/html',
    staticDir: '.diagrams/static',
    assetsDir: path.join(srcDir, 'assets'),
  };
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
    if (e instanceof UnknownFlagError || e instanceof BadFlagValueError) {
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
    const files = args.files.length > 0 ? args.files : await fg(SOURCES);
    if (args.files.length === 0 && files.length === 0) warnNoSources();
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
  } else if (args.command === 'lint') {
    const files = args.files.length > 0 ? args.files : await fg(SOURCES);
    if (args.files.length === 0 && files.length === 0) warnNoSources();
    const reports: LintReport[] = [];
    for (const file of files) {
      reports.push(
        ...(await lintFile(file, { rootDir: '.diagrams/src', coreEntry: home.coreEntry, resolver: snap.resolver })),
      );
    }
    if (args.json) console.log(JSON.stringify(reports, null, 2));
    else for (const r of reports) console.log(formatLintReport(r));
    process.exit(reports.length > 0 ? 1 : 0);
  } else if (args.command === 'watch') {
    // Always locked, independent of args.updateIncludes: watch is a long-running
    // live loop with no point at which "refetch and rewrite the lock" makes
    // sense, so it ignores the flag by design rather than inheriting the shared
    // session's mode (mirrors studio.ts's own hardcoded 'locked' session).
    if (args.updateIncludes) console.error('ignoring --update-includes: watch always runs locked');
    const dir = args.files[0] ?? '.diagrams/src';
    if (
      existsSync(dir) &&
      statSync(dir).isDirectory() &&
      (await fg('**/*.diagram.{ts,json}', { cwd: dir })).length === 0
    )
      warnNoSources(dir);
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
          ? 'viewer shell not built — run `pnpm --filter @diagc/viewer build` in the monorepo.'
          : `viewer shell missing from this install (${home.viewerShell}) — reinstall diagc.`,
      );
      process.exit(1);
    }
    const dirs = publishDirs(args);
    // Compile first so artifacts reflect current sources (TS + include expansion).
    const sources = await fg('**/*.diagram.{ts,json}', { cwd: dirs.srcDir, absolute: true });
    if (sources.length === 0) warnNoSources(dirs.srcDir);
    for (const f of sources) {
      try {
        await compileFile(f, dirs.artifactsDir, {
          rootDir: dirs.srcDir,
          coreEntry: home.coreEntry,
          resolver: snap.resolver,
        });
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
        console.log('No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.');
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
      names: args.files,
      ...(renderPng !== undefined ? { renderPng } : {}),
      ...(args.link !== undefined ? { link: args.link } : {}),
    });
    console.log(`✓ ${res.pages.length} page(s) -> ${dirs.htmlDir}`);
    if (res.images.length > 0) console.log(`✓ ${res.images.length} image(s) -> ${dirs.staticDir}`);
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
    const name = args.files[0] === undefined ? undefined : diagramName(args.files[0]);
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
  } else if (args.command === 'diff') {
    process.exit(await runDiff(args, home));
  } else if (args.command === 'guide') {
    // exitCode and a return, not process.exit: the guide is tens of kilobytes and
    // is read through a pipe by an agent. Exiting while part of it is still
    // queued would hand over a page that stops mid-sentence.
    process.exitCode = runGuide(args.files, {
      guideDir: home.guideDir,
      startersDir: home.startersDir,
      version: cliVersion(home.root),
    });
    return;
  } else if (args.command === 'init') {
    if (args.files.length > 1) {
      console.error(`diagc: init takes one name, got ${args.files.length} — e.g. diagc init shop --type c4`);
      process.exit(1);
    }
    process.exitCode = await runInit({
      cwd: process.cwd(),
      ...(args.files[0] !== undefined ? { name: args.files[0] } : {}),
      ...(args.type !== undefined ? { type: args.type } : {}),
      agents: args.agents,
      startersDir: home.startersDir,
      skillFile: home.skillFile,
      version: cliVersion(home.root),
      coreEntry: home.coreEntry,
      resolver: snap.resolver,
    });
    return;
  } else {
    console.error(`diagc: Unknown command '${args.command}'.`);
    console.error(USAGE);
    process.exit(1);
  }
}

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

async function runDiff(args: Args, home: ReturnType<typeof homePaths>): Promise<number> {
  const range = args.files[0];
  if (range === undefined) {
    console.error('diagc: diff needs a git ref (diff v1.0) or a range (diff v1.0..v2.0).');
    console.error(USAGE);
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
    const fromLabel = args.labels?.[0] ?? from;
    const toLabel = args.labels?.[1] ?? to ?? 'working tree';
    const beforeSet = await loadDiagramSet(fromLabel, before.diagramsDir, home.coreEntry);
    const afterSet = await loadDiagramSet(toLabel, afterDir, home.coreEntry);
    const diffs = compareDiagramSets(beforeSet, afterSet, args.files.slice(1));
    if (args.json) {
      console.log(
        JSON.stringify(
          { from: fromLabel, to: toLabel, diagrams: diffs.map(({ before: _b, after: _a, ...rest }) => rest) },
          null,
          2,
        ),
      );
    } else {
      console.log(formatDiffSummary(diffs, fromLabel, toLabel));
    }
    if (!diffs.some((d) => d.status === 'added' || d.status === 'removed' || d.status === 'changed')) return 0;
    if (!existsSync(home.viewerShell)) {
      console.error('viewer shell not available — writing the summary only (see `diagc publish` for how to build it).');
      return 0;
    }
    let renderPng: ((htmlPath: string, pngPath: string) => Promise<void>) | undefined;
    if (args.images) {
      const snapshot = await import('./publish/snapshot');
      if (snapshot.findChrome() === undefined)
        console.error('No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.');
      else renderPng = snapshot.renderPng;
    }
    const outDir = args.outGiven ? args.out : diffOutDir(from, to);
    const res = await writeDiffPages(diffs, {
      outDir,
      shellPath: home.viewerShell,
      libraryDir: home.libraryDir,
      before: beforeSet,
      after: afterSet,
      ...(renderPng !== undefined ? { renderPng } : {}),
      ...(args.imageUrl !== undefined ? { imageUrl: args.imageUrl } : {}),
    });
    // stderr, so `--json` output stays parseable on stdout
    console.error(
      `✓ ${res.pages.length} page(s)${res.images.length > 0 ? `, ${res.images.length} image(s)` : ''} -> ${outDir}`,
    );
    console.error(`✓ side by side -> ${res.index}`);
    console.error(`✓ for an ADR -> ${res.summary}`);
    return 0;
  } catch (e) {
    console.error(`diagc: ${errMessage(e)}`);
    return 1;
  } finally {
    for (const c of checkouts) await c.cleanup();
  }
}

main().catch((e) => {
  console.error(errMessage(e));
  process.exit(1);
});
