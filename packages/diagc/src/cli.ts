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
import { processIo } from './cli/io';
import { run } from './cli/run';

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

/** End the process once stdout and stderr have taken everything written to them:
 * `process.exit` straight after a write drops what a pipe has not accepted yet. A
 * zero-length write's callback runs after everything queued before it. It ends with
 * `process.exit`, not `exitCode`, so an open handle (a keep-alive socket from a remote
 * include, a Chrome process) cannot keep the CLI running. */
async function exit(code: number): Promise<never> {
  await Promise.all([process.stdout, process.stderr].map((s) => new Promise((done) => s.write('', done))));
  process.exit(code);
}

/** The binary: argv through the process's own streams, then exit with the code. */
async function main(): Promise<never> {
  return exit(await run(process.argv.slice(2), processIo, USAGE));
}

void main();
