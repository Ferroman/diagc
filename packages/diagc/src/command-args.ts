import type { Takes } from './cli/parse';
import { compile } from './commands/compile';
import { diff } from './commands/diff';
import { eject } from './commands/eject';
import { guide } from './commands/guide';
import { init } from './commands/init';
import { lint } from './commands/lint';
import { publish } from './commands/publish';
import { studio } from './commands/studio';
import { watch } from './commands/watch';

/** What each command takes: the flags the reference's flag table lists for it, and a
 * cap on positional arguments where the command has no message of its own for extra
 * ones. In the order the refusal of a flag names the commands that take it. */
export const TAKES: Readonly<Record<string, Takes>> = {
  compile,
  lint,
  watch,
  publish,
  studio,
  eject,
  diff,
  guide,
  init,
};
