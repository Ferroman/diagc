import type { HomePaths } from '../home';
import type { SnapshotSession } from '../snapshots';
import type { CliIo } from './io';
import type { Flag, FlagValues, Takes } from './parse';

/** A command's arguments: its positional arguments, and the flags given of those it takes. */
export interface CommandArgs<F extends Flag> {
  positionals: string[];
  flags: Partial<Pick<FlagValues, F>>;
}

/** What a command runs with. */
export interface Context {
  io: CliIo;
  /** the usage, for a command that prints it after a missing argument */
  usage: string;
  home: HomePaths;
  /** The run's one include-snapshot session: the in-memory lock and the set of includes
   * it touched must span the whole run for its prune to see everything a full-tree
   * compile resolved. It resolves locked unless the run was given --update-includes. */
  snapshots: SnapshotSession;
}

/** One `diagc <command>`: what it takes, typed so that it reads only the flags it lists,
 * and what it does. */
export interface Command<F extends Flag = Flag> extends Takes<F> {
  /** Run, and settle with the exit code once the command is done. */
  run(args: CommandArgs<F>, ctx: Context): Promise<number>;
}
