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
import { fileURLToPath } from 'node:url';
import { errMessage } from '@diagc/core/internal';
import type { Context } from './cli/command';
import { processIo } from './cli/io';
import { checkTaken, parseArgv, UsageError, type ParsedArgv } from './cli/parse';
import { compile } from './commands/compile';
import { diff } from './commands/diff';
import { lint } from './commands/lint';
import { publish } from './commands/publish';
import { watch } from './commands/watch';
import { ejectDiagram } from './eject';
import { runGuide } from './guide';
import { cliVersion, findHome, homePaths } from './home';
import { runInit } from './init';
import { resolveInclude } from './includes';
import { diagramName } from './names';
import { snapshotSession } from './snapshots';
import { runStudio } from './studio';
import { TAKES } from './command-args';

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

/** The arguments the commands below read, from argv as parsed. */
function flatArgs({ command, positionals, flags }: ParsedArgv): Args {
  return {
    command,
    files: positionals,
    out: flags['--out'] ?? '.diagrams/.artifacts',
    outGiven: flags['--out'] !== undefined,
    images: flags['--no-images'] === undefined,
    updateIncludes: flags['--update-includes'] === true,
    json: flags['--json'] === true,
    agents: flags['--agents'] === true,
    ...(flags['--type'] !== undefined ? { type: flags['--type'] } : {}),
    ...(flags['--link'] !== undefined ? { link: flags['--link'] } : {}),
    ...(flags['--image-url'] !== undefined ? { imageUrl: flags['--image-url'] } : {}),
    ...(flags['--labels'] !== undefined ? { labels: flags['--labels'] } : {}),
  };
}

/** End the process once stdout and stderr have taken everything written to them:
 * `process.exit` straight after a write drops what a pipe has not accepted yet. A
 * zero-length write's callback runs after everything queued before it. It ends with
 * `process.exit`, not `exitCode`, so an open handle (a keep-alive socket from a remote
 * include, a Chrome process) cannot keep the CLI running. */
async function exit(code: number): Promise<never> {
  await Promise.all([process.stdout, process.stderr].map((s) => new Promise((done) => s.write('', done))));
  process.exit(code);
}

async function main() {
  let parsed: ParsedArgv;
  let args: Args;
  try {
    parsed = parseArgv(process.argv.slice(2));
    checkTaken(parsed, TAKES);
    args = flatArgs(parsed);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    if (e.exitCode === 0) console.log(USAGE);
    else {
      console.error(`diagc: ${e.message}\n`);
      console.error(USAGE);
    }
    return exit(e.exitCode);
  }
  const home = homePaths(findHome(fileURLToPath(import.meta.url)));
  // One session per CLI invocation, shared across every compile+publish in this
  // run: the in-memory lock + touched set must span the whole run for prune()
  // to see everything a full-tree compile actually resolved. `watch` builds its
  // own separate always-locked session below instead of sharing this one.
  const snap = snapshotSession(resolveInclude, '.diagrams', args.updateIncludes ? 'update' : 'locked');

  const ctx: Context = { io: processIo, usage: USAGE, home, snapshots: snap };

  if (args.command === 'compile') {
    return exit(await compile.run(parsed, ctx));
  } else if (args.command === 'lint') {
    return exit(await lint.run(parsed, ctx));
  } else if (args.command === 'watch') {
    return exit(await watch.run(parsed, ctx));
  } else if (args.command === 'publish') {
    return exit(await publish.run(parsed, ctx));
  } else if (args.command === 'studio') {
    // Studio's own compile-watch loop always resolves includes locked (see
    // studio.ts) — same reasoning as watch above.
    await runStudio(home, process.cwd());
    return;
  } else if (args.command === 'eject') {
    // ejectDiagram's post-swap recompile always resolves includes locked (see
    // eject.ts) — same reasoning as watch above.
    const name = args.files[0] === undefined ? undefined : diagramName(args.files[0]);
    if (name === undefined || name === '') {
      console.error('diagc: eject needs a diagram name.');
      console.error(USAGE);
      return exit(1);
    }
    try {
      const res = await ejectDiagram('.diagrams/src', args.out, name, { coreEntry: home.coreEntry });
      console.log(`✓ ${res.tsPath}`);
      return exit(0);
    } catch (e) {
      console.error(errMessage(e));
      return exit(1);
    }
  } else if (args.command === 'diff') {
    return exit(await diff.run(parsed, ctx));
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
      return exit(1);
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
    return exit(1);
  }
}

main().catch((e) => {
  console.error(errMessage(e));
  return exit(1);
});
