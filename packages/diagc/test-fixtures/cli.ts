import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandArgs, Context } from '../src/cli/command';
import type { CliIo } from '../src/cli/io';
import type { Flag, FlagValues } from '../src/cli/parse';
import { findHome, homePaths } from '../src/home';
import { resolveInclude } from '../src/includes';
import { snapshotSession, type SnapshotMode } from '../src/snapshots';

// What the tests of the CLI's commands share. It sits beside the fixtures and not in
// src/, which is what the build ships.

/** An io that keeps what it is given: stdout and stderr as the process would see them. */
export interface CapturedIo extends CliIo {
  readonly stdout: string;
  readonly stderr: string;
}

/** `tty` makes stdout a terminal of that width, as `processIo` reports one. */
export function captureIo(tty?: { columns: number }): CapturedIo {
  let stdout = '';
  let stderr = '';
  return {
    out: (line) => void (stdout += `${line}\n`),
    err: (line) => void (stderr += `${line}\n`),
    write: (text) => void (stdout += text),
    ...(tty !== undefined ? { tty } : {}),
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

export const home = homePaths(findHome(fileURLToPath(import.meta.url)));

/** A command's context over `io`, with a fresh snapshot session as a run makes one. */
export function contextFor(io: CliIo, mode: SnapshotMode = 'locked'): Context {
  return { io, usage: 'USAGE', home, snapshots: snapshotSession(resolveInclude, '.diagrams', mode) };
}

/** A command's arguments. */
export function argsOf<F extends Flag>(
  positionals: string[] = [],
  flags: Partial<Pick<FlagValues, F>> = {},
): CommandArgs<F> {
  return { positionals, flags };
}

/** A diagram source: one service node, with the given extra fields. */
export function diagram(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    id,
    name: id,
    nodes: [{ id: 'a', name: 'A', type: 'service' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
    ...extra,
  };
}

/** A relation to a node that is not there: the source does not compile. */
export const DANGLING = { relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'uses' }] };
/** A node type no one knows: compile warns, lint reports it. */
export const MISTYPED = { nodes: [{ id: 'a', name: 'A', type: 'servise' }] };

/** Each source under `dir/.diagrams/src`, by name. */
export function writeSources(dir: string, models: Record<string, Record<string, unknown>>): void {
  for (const [name, model] of Object.entries(models)) {
    const file = path.join(dir, '.diagrams', 'src', `${name}.diagram.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(model));
  }
}

/** Run `fn` in a new empty directory as the current one, as the CLI runs in the user's:
 * the commands read paths relative to it. The directory goes afterwards. */
export async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'diagc-command-')));
  const was = process.cwd();
  process.chdir(dir);
  try {
    return await fn(dir);
  } finally {
    process.chdir(was);
    rmSync(dir, { recursive: true, force: true });
  }
}
