import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CliIo } from '../cli/io';
import { diagramName } from '../names';
import { RELATIVE_PATHS } from '../paths';
import type { PublishOptions } from '../publish/publish';

/** The sources compile and lint read when they are named none. */
export const SOURCES = `${RELATIVE_PATHS.srcDir}/**/*.diagram.{ts,json}`;

/** Why watch, studio and eject refuse --update-includes. */
export const LOCKED = { '--update-includes': 'it always resolves includes locked' };

/** The one message a repository with no diagrams gets, on stderr: `lint --json`'s
 * stdout stays an array and the exit codes hold, so CI without diagrams passes. */
export function warnNoSources(io: CliIo, dir = RELATIVE_PATHS.srcDir): void {
  io.err(`No diagrams under ${dir} — run 'diagc init' to create one.`);
}

/** `files...` as diagram names, read as eject reads one (`.diagrams/src/shop.diagram.json`
 * is `shop`). A name that matches nothing in `known` is an error on stderr, and the
 * result is then undefined: an empty selection would look like nothing to do. */
export function diagramNames(io: CliIo, files: readonly string[], known: ReadonlySet<string>): string[] | undefined {
  const names = files.map(diagramName);
  const unknown = names.filter((n) => !known.has(n));
  for (const n of unknown) io.err(`diagc: no diagram '${n}'`);
  return unknown.length === 0 ? names : undefined;
}

/** The PNG renderer, when images are wanted and a Chrome is found. Without a Chrome it
 * says so on stderr, and the pages go out as HTML only. Playwright loads only when a
 * picture is wanted. */
export async function pngRenderer(
  io: CliIo,
  images: boolean,
): Promise<NonNullable<PublishOptions['renderPng']> | undefined> {
  if (!images) return undefined;
  const snapshot = await import('../publish/snapshot');
  if (snapshot.findChrome() === undefined) {
    io.err('No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.');
    return undefined;
  }
  return snapshot.renderPng;
}

/** The source a diagram name reads from: its `.diagram.ts`, else its `.diagram.json`;
 * undefined when it has neither. TypeScript first, as the hand-written one of the two
 * (a `.diagram.json` beside it is the studio's, or a leftover from an eject). */
export function sourceOf(name: string, srcDir: string = RELATIVE_PATHS.srcDir): string | undefined {
  for (const ext of ['.diagram.ts', '.diagram.json']) {
    const file = path.posix.join(srcDir, `${name}${ext}`);
    if (existsSync(file)) return file;
  }
  return undefined;
}
