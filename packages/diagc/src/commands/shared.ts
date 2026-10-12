import type { CliIo } from '../cli/io';
import { diagramName } from '../names';

/** The sources compile and lint read when they are named none. */
export const SOURCES = '.diagrams/src/**/*.diagram.{ts,json}';

/** Where artifacts go without --out. */
export const ARTIFACTS_DIR = '.diagrams/.artifacts';

/** Why watch, studio and eject refuse --update-includes. */
export const LOCKED = { '--update-includes': 'it always resolves includes locked' };

/** The one message a repository with no diagrams gets, on stderr: `lint --json`'s
 * stdout stays an array and the exit codes hold, so CI without diagrams passes. */
export function warnNoSources(io: CliIo, dir = '.diagrams/src'): void {
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
