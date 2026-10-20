import { fileURLToPath } from 'node:url';
import { errMessage } from '@diagc/core/internal';
import { compile } from '../commands/compile';
import { diff } from '../commands/diff';
import { eject } from '../commands/eject';
import { guide } from '../commands/guide';
import { init } from '../commands/init';
import { lint } from '../commands/lint';
import { publish } from '../commands/publish';
import { show } from '../commands/show';
import { studio } from '../commands/studio';
import { tui } from '../commands/tui';
import { watch } from '../commands/watch';
import { cliVersion, findHome, homePaths } from '../home';
import { resolveInclude } from '../includes';
import { RELATIVE_PATHS } from '../paths';
import { snapshotSession } from '../snapshots';
import type { Command } from './command';
import type { CliIo } from './io';
import { checkTaken, parseArgv, UsageError, VersionRequest, type ParsedArgv } from './parse';

/** Every command by name, in the order the refusal of a flag names the commands that
 * take it. */
export const COMMANDS: Readonly<Record<string, Command>> = {
  compile,
  lint,
  watch,
  publish,
  show,
  studio,
  tui,
  eject,
  diff,
  guide,
  init,
};

/** The command argv names, run with what it runs with. */
async function dispatch(parsed: ParsedArgv, io: CliIo, usage: string): Promise<number> {
  const home = homePaths(findHome(fileURLToPath(import.meta.url)));
  // One session per run, shared by whatever compiles in it (see Context.snapshots).
  // Watch, the studio and eject resolve through locked resolvers of their own.
  const snapshots = snapshotSession(
    resolveInclude,
    RELATIVE_PATHS.diagramsDir,
    parsed.flags['--update-includes'] === true ? 'update' : 'locked',
  );
  const command = Object.hasOwn(COMMANDS, parsed.command) ? COMMANDS[parsed.command] : undefined;
  if (command === undefined) {
    io.err(`diagc: Unknown command '${parsed.command}'.`);
    io.err(usage);
    return 1;
  }
  return command.run(parsed, { io, usage, home, snapshots });
}

/** `diagc <argv>`: run the command argv names, writing through `io`, and settle with its
 * exit code; watch, which runs until the process is stopped, never settles. A mistake
 * in argv prints the usage; an error no command answers itself is one line on stderr
 * and exit 1. */
export async function run(argv: readonly string[], io: CliIo, usage: string): Promise<number> {
  try {
    const parsed = parseArgv(argv);
    checkTaken(parsed, COMMANDS);
    return await dispatch(parsed, io, usage);
  } catch (e) {
    if (e instanceof VersionRequest) {
      io.out(cliVersion(homePaths(findHome(fileURLToPath(import.meta.url))).root));
      return 0;
    }
    if (!(e instanceof UsageError)) {
      io.err(errMessage(e));
      return 1;
    }
    if (e.exitCode === 0) io.out(usage);
    else {
      io.err(`diagc: ${e.message}\n`);
      io.err(usage);
    }
    return e.exitCode;
  }
}
