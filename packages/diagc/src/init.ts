import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { errMessage, type IncludeResolver } from '@diagc/core';
import { isSafeName } from './api/handlers';
import { compileFile } from './compile';
import { readStarter, UnknownStarterError } from './starters';

/** What `diagc init` works with. `cwd` is the directory being set up — the
 * current directory in the CLI, a temp dir in tests — and every path is built
 * from it, so nothing here reads `process.cwd()`. */
export interface InitOptions {
  cwd: string;
  /** the diagram's name, folders allowed (`team/app`); `example` when omitted */
  name?: string;
  /** the starter to copy; `basic` when omitted */
  type?: string;
  /** write the coding-agent block into AGENTS.md / CLAUDE.md */
  agents: boolean;
  startersDir: string;
  /** what the `npm i -D @diagc/core@…` hint names */
  version: string;
  coreEntry: string;
  resolver?: IncludeResolver;
}

export interface InitIo {
  out(text: string): void;
  err(text: string): void;
}

export const DEFAULT_NAME = 'example';
export const DEFAULT_TYPE = 'basic';
const SRC_DIR = '.diagrams/src';
const ARTIFACTS_DIR = '.diagrams/.artifacts';
/** build output a repository should not commit; `init` adds what is missing */
export const IGNORED: readonly string[] = ['.diagrams/.artifacts/', '.diagrams/html/', '.diagrams/diff/'];

const COL = 38;
const done = (left: string, right: string): string => `✓ ${left.padEnd(COL)}${right}`;
const skipped = (left: string, right: string): string => `· ${left.padEnd(COL)}${right}`;

/** A refusal: one line on stderr and exit 1, with the tree untouched. */
export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitError';
  }
}

/** `shop.diagram.ts` and `.diagrams/src/shop` both mean `shop` — the trim `eject`
 * applies, so a name copied from a listing is not an "unsafe name". */
export function diagramName(arg: string): string {
  return arg.replace(/^\.diagrams\/src\//, '').replace(/\.diagram\.(ts|json)$/, '');
}

/** Which of `wanted` a `.gitignore` text still lacks. A line counts after trimming,
 * with or without a leading or trailing slash: `/.diagrams/html` already ignores
 * what `.diagrams/html/` would. */
export function missingIgnores(existing: string, wanted: readonly string[] = IGNORED): string[] {
  const norm = (l: string): string => l.trim().replace(/^\//, '').replace(/\/$/, '');
  const have = new Set(existing.split(/\r?\n/).map(norm));
  return wanted.filter((w) => !have.has(norm(w)));
}

/** Step 1: the starter. Returns the file it wrote, or nothing when the step was
 * skipped. Every check comes before the write, so a refusal leaves no file. */
async function starterStep(opts: InitOptions, io: InitIo): Promise<string | undefined> {
  const srcDir = path.join(opts.cwd, SRC_DIR);
  if (opts.name === undefined && opts.type === undefined) {
    // A plain `diagc init` in a repository that already has diagrams is here for
    // the other steps (`--agents` after an upgrade): do not add an `example`.
    const existing = await fg('**/*.diagram.{ts,json}', { cwd: srcDir });
    if (existing.length > 0) {
      io.out(skipped(SRC_DIR, `already has ${existing.length} diagram(s) — starter skipped`));
      return undefined;
    }
  }
  const name = diagramName(opts.name ?? DEFAULT_NAME);
  if (!isSafeName(name)) {
    throw new InitError(`'${name}' is not a diagram name — use lowercase letters, digits and '-', with '/' for a folder (shop, team/app).`);
  }
  for (const ext of ['ts', 'json']) {
    if (existsSync(path.join(srcDir, `${name}.diagram.${ext}`))) {
      throw new InitError(`${SRC_DIR}/${name}.diagram.${ext} already exists — pick another name, or run 'diagc init' with no name to leave it alone.`);
    }
  }
  const type = opts.type ?? DEFAULT_TYPE;
  let source: string;
  try {
    source = readStarter(opts.startersDir, type);
  } catch (e) {
    if (!(e instanceof UnknownStarterError)) throw e;
    // No types at all is not a wrong `--type`: the install lost its files.
    throw new InitError(
      e.types.length === 0
        ? `starter files missing from this install (${opts.startersDir}) — reinstall diagc.`
        : `${e.message} — e.g. diagc init ${name} --type ${e.types[0]}`,
    );
  }
  const file = path.join(srcDir, `${name}.diagram.ts`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source);
  io.out(done(`${SRC_DIR}/${name}.diagram.ts`, `(${type} starter)`));
  return file;
}

/** Step 2: `.gitignore`. Appends the missing lines; creates the file if there is none. */
async function gitignoreStep(cwd: string, io: InitIo): Promise<void> {
  const file = path.join(cwd, '.gitignore');
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  const missing = missingIgnores(existing);
  if (missing.length === 0) {
    io.out(skipped('.gitignore', 'already ignores the build output'));
    return;
  }
  // A file whose last line has no newline gets one first, or the first new entry
  // would be glued onto it.
  const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
  await writeFile(file, `${existing}${sep}${missing.join('\n')}\n`);
  io.out(done('.gitignore', `(+ ${missing.join(', ')})`));
}

/** Step 4: compile what was written, so the user starts from a diagram that is
 * known to build and sees where the artifact went. */
async function compileStep(file: string, opts: InitOptions, io: InitIo): Promise<void> {
  let artifact: string;
  try {
    artifact = await compileFile(file, path.join(opts.cwd, ARTIFACTS_DIR), {
      rootDir: path.join(opts.cwd, SRC_DIR),
      coreEntry: opts.coreEntry,
      ...(opts.resolver !== undefined ? { resolver: opts.resolver } : {}),
    });
  } catch (e) {
    throw new InitError(`the starter did not compile — ${errMessage(e)}`);
  }
  io.out(done('compiled', `-> ${path.relative(opts.cwd, artifact).split(path.sep).join('/')}`));
}

/** Step 5: what to do now. The `--agents` line goes when `--agents` was given; the
 * install hint only where there is a `package.json` to install into. */
function nextSteps(opts: InitOptions): string {
  const lines: [string, string][] = [
    ['diagc studio', 'look at it'],
    ['diagc guide', 'how to write diagrams (for you or your agent)'],
  ];
  if (!opts.agents) lines.push(['diagc init --agents', 'point coding agents at the guide (AGENTS.md)']);
  if (existsSync(path.join(opts.cwd, 'package.json'))) lines.push([`npm i -D @diagc/core@${opts.version}`, 'editor types for .diagram.ts']);
  return `\nNext:\n${lines.map(([cmd, what]) => `  ${cmd.padEnd(COL)}${what}`).join('\n')}`;
}

const stdio: InitIo = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
};

/** `diagc init`: run the steps in order and return the exit code. A refusal is one
 * line on stderr; anything else is a bug and is left to throw. */
export async function runInit(opts: InitOptions, io: InitIo = stdio): Promise<number> {
  try {
    const written = await starterStep(opts, io);
    await gitignoreStep(opts.cwd, io);
    if (written !== undefined) await compileStep(written, opts, io);
    io.out(nextSteps(opts));
    return 0;
  } catch (e) {
    if (e instanceof InitError) {
      io.err(`diagc: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
