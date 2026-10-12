import type { Takes } from './cli/parse';
import { compile } from './commands/compile';
import { lint } from './commands/lint';
import { LOCKED } from './commands/shared';
import { watch } from './commands/watch';

/** What each command takes: the flags the reference's flag table lists for it, and a
 * cap on positional arguments where the command has no message of its own for extra
 * ones. In the order the refusal of a flag names the commands that take it. */
export const TAKES: Readonly<Record<string, Takes>> = {
  compile,
  lint,
  watch,
  publish: { flags: ['--out', '--no-images', '--link', '--update-includes'] },
  studio: { flags: [], positionals: { max: 0, what: 'no arguments' }, whyNot: LOCKED },
  eject: { flags: ['--out'], positionals: { max: 1, what: 'one diagram name' }, whyNot: LOCKED },
  diff: { flags: ['--out', '--no-images', '--json', '--labels', '--image-url'] },
  guide: { flags: [] },
  init: { flags: ['--type', '--agents'] },
};
