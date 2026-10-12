import type { Takes } from './cli/parse';
import { compile } from './commands/compile';
import { diff } from './commands/diff';
import { lint } from './commands/lint';
import { publish } from './commands/publish';
import { LOCKED } from './commands/shared';
import { watch } from './commands/watch';

/** What each command takes: the flags the reference's flag table lists for it, and a
 * cap on positional arguments where the command has no message of its own for extra
 * ones. In the order the refusal of a flag names the commands that take it. */
export const TAKES: Readonly<Record<string, Takes>> = {
  compile,
  lint,
  watch,
  publish,
  studio: { flags: [], positionals: { max: 0, what: 'no arguments' }, whyNot: LOCKED },
  eject: { flags: ['--out'], positionals: { max: 1, what: 'one diagram name' }, whyNot: LOCKED },
  diff,
  guide: { flags: [] },
  init: { flags: ['--type', '--agents'] },
};
