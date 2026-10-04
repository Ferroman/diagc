import { existsSync, statSync } from 'node:fs';
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
  /** write the coding-agent block into AGENTS.md / CLAUDE.md, and the Claude Code skill */
  agents: boolean;
  startersDir: string;
  /** the skill the package ships, copied into a repository that uses Claude Code */
  skillFile: string;
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

export const AGENTS_BEGIN = '<!-- diagc:begin -->';
export const AGENTS_END = '<!-- diagc:end -->';
/** What `--agents` writes. Commands, not DSL: the guide is where the DSL lives, so
 * this block does not go stale when the DSL grows. The markers let a later run
 * replace it in place. */
export const AGENTS_BLOCK = `${AGENTS_BEGIN}
## Diagrams

Diagrams live in \`.diagrams/src/*.diagram.ts\` and are built with \`diagc\`.

- Run \`diagc guide\` before writing or changing one; \`diagc guide <type>\` covers one diagram type.
- Run \`diagc lint --json\` until it reports nothing.
- Run \`diagc publish <name>\` and look at \`.diagrams/static/<name>.png\` to check the picture.
${AGENTS_END}
`;

/** Where the skill goes: the folder Claude Code reads a repository's skills from. */
export const SKILL_PATH = '.claude/skills/diagc/SKILL.md';

/** An earlier block: a begin marker, its end marker with no second begin between
 * them, and the closing newline the block carries. A begin whose end was deleted
 * by hand is not one — taking it up to the next block's end would delete
 * whatever the user wrote in between. */
const EARLIER_BLOCK = new RegExp(`${AGENTS_BEGIN}(?:(?!${AGENTS_BEGIN})[\\s\\S])*?${AGENTS_END}\\n?`);

/** `existing` with `block` added at the end, or — when an earlier block is there —
 * with that block replaced where it stands, so a second run never duplicates it
 * and a run after an upgrade refreshes it. `block` runs from the begin marker to
 * the newline after the end marker. */
export function withBlock(existing: string, block: string): { text: string; replaced: boolean } {
  // A function, so a `$&` in the block is text and not a back-reference.
  if (EARLIER_BLOCK.test(existing)) return { text: existing.replace(EARLIER_BLOCK, () => block), replaced: true };
  if (existing === '') return { text: block, replaced: false };
  const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return { text: `${existing}${sep}${block}`, replaced: false };
}

export const withAgentsBlock = (existing: string): { text: string; replaced: boolean } => withBlock(existing, AGENTS_BLOCK);

const COL = 38;
/** A line of two columns: the right one starts COL in, and never less than two spaces after
 * the left one. A path with a folder in its name is longer than the column, and padding
 * alone would run it into the text beside it. */
const columns = (left: string, right: string): string => `${left.padEnd(COL - 2)}  ${right}`;
const done = (left: string, right: string): string => `✓ ${columns(left, right)}`;
const skipped = (left: string, right: string): string => `· ${columns(left, right)}`;

/** A one-line failure on stderr with exit 1. A refusal leaves the tree untouched;
 * a compile failure comes after the writes, so the starter and `.gitignore` stay. */
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
  if (!isSafeName(name) || name.endsWith('/')) {
    throw new InitError(`'${name}' is not a diagram name — use lowercase letters, digits and '-', with '/' for a folder (shop, team/app).`);
  }
  // The type is checked before the name clash: a wrong `--type` is the more useful
  // thing to hear, and it too is checked before anything is written.
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
  for (const ext of ['ts', 'json']) {
    if (existsSync(path.join(srcDir, `${name}.diagram.${ext}`))) {
      throw new InitError(`${SRC_DIR}/${name}.diagram.${ext} already exists — pick another name, or run 'diagc init' with no name and no --type to leave it alone.`);
    }
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

/** Step 3: the coding-agent block, only with `--agents`. Into whichever of
 * AGENTS.md and CLAUDE.md exist; into a new AGENTS.md when neither does. */
async function agentsStep(cwd: string, io: InitIo): Promise<void> {
  const targets = ['AGENTS.md', 'CLAUDE.md'].filter((f) => existsSync(path.join(cwd, f)));
  if (targets.length === 0) targets.push('AGENTS.md');
  for (const name of targets) {
    const file = path.join(cwd, name);
    const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
    const { text, replaced } = withAgentsBlock(existing);
    await writeFile(file, text);
    io.out(done(name, replaced ? '(diagc block refreshed)' : '(diagc block added)'));
  }
}

/** What step 4 writes into the skill file, and whether that replaces an earlier block. */
interface SkillPlan {
  text: string;
  replaced: boolean;
}

/** `.claude/` is Claude Code's own folder, not neutral ground like `AGENTS.md`, so
 * the skill goes only where the repository already shows that tool in use. */
const usesClaudeCode = (cwd: string): boolean =>
  (statSync(path.join(cwd, '.claude'), { throwIfNoEntry: false })?.isDirectory() ?? false) || existsSync(path.join(cwd, 'CLAUDE.md'));

/** Everything step 4 has to read, read before the first write: an install that
 * lost its skill is a refusal, and a refusal leaves the tree untouched. A new file
 * is the shipped one, frontmatter and all; in a file that is already there only
 * the text between the markers is diagc's, as in AGENTS.md. Undefined where the
 * skill does not go. */
async function planSkill(opts: InitOptions): Promise<SkillPlan | undefined> {
  if (!opts.agents || !usesClaudeCode(opts.cwd)) return undefined;
  if (!existsSync(opts.skillFile)) throw new InitError(`skill file missing from this install (${opts.skillFile}) — reinstall diagc.`);
  const source = await readFile(opts.skillFile, 'utf8');
  const begin = source.indexOf(AGENTS_BEGIN);
  // The shipped file's own shape, held by skillContent.test.ts: a bug, not a refusal.
  if (begin === -1) throw new Error(`${opts.skillFile}: no ${AGENTS_BEGIN} marker`);
  const file = path.join(opts.cwd, SKILL_PATH);
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  // An empty file has no frontmatter to keep: it gets the whole skill, as a new one does.
  return existing.trim() === '' ? { text: source, replaced: false } : withBlock(existing, source.slice(begin));
}

/** Step 4: the Claude Code skill, with `--agents`. */
async function skillStep(cwd: string, plan: SkillPlan | undefined, io: InitIo): Promise<void> {
  if (plan === undefined) {
    io.out(skipped(SKILL_PATH, 'no .claude/ or CLAUDE.md here — skill skipped'));
    return;
  }
  const file = path.join(cwd, SKILL_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, plan.text);
  io.out(done(SKILL_PATH, plan.replaced ? '(diagc skill refreshed)' : '(diagc skill added)'));
}

/** Step 5: compile what was written, so the user starts from a diagram that is
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
    throw new InitError(`compile failed — ${errMessage(e)}`);
  }
  io.out(done('compiled', `-> ${path.relative(opts.cwd, artifact).split(path.sep).join('/')}`));
}

/** Step 6: what to do now. The `--agents` line goes when `--agents` was given; the
 * install hint only where there is a `package.json` to install into. */
function nextSteps(opts: InitOptions): string {
  const lines: [string, string][] = [
    ['diagc studio', 'look at it'],
    ['diagc guide', 'how to write diagrams (for you or your agent)'],
  ];
  if (!opts.agents) lines.push(['diagc init --agents', 'point coding agents at the guide (AGENTS.md, Claude Code skill)']);
  if (existsSync(path.join(opts.cwd, 'package.json'))) lines.push([`npm i -D @diagc/core@${opts.version}`, 'editor types for .diagram.ts']);
  return `\nNext:\n${lines.map(([cmd, what]) => `  ${columns(cmd, what)}`).join('\n')}`;
}

const stdio: InitIo = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
};

/** `diagc init`: run the steps in order and return the exit code. A refusal is one
 * line on stderr; anything else is a bug and is left to throw. */
export async function runInit(opts: InitOptions, io: InitIo = stdio): Promise<number> {
  try {
    const skill = await planSkill(opts);
    const written = await starterStep(opts, io);
    await gitignoreStep(opts.cwd, io);
    if (opts.agents) {
      await agentsStep(opts.cwd, io);
      await skillStep(opts.cwd, skill, io);
    }
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
