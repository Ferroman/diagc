import type { CliIo } from '../cli/io';

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
