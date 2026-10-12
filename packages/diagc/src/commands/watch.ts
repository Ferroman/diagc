import { existsSync, statSync } from 'node:fs';
import fg from 'fast-glob';
import type { Command, CommandArgs, Context } from '../cli/command';
import { RELATIVE_PATHS } from '../paths';
import { lockedResolverFor } from '../snapshots';
import { formatCompileEvent, startWatch } from '../watch';
import { LOCKED, warnNoSources } from './shared';

/** Watch's start: the check for sources, the watcher, and the line that says it is
 * watching. Returns the watcher, which a test closes. */
export async function startWatching(
  { positionals, flags }: CommandArgs<'--out'>,
  { io, home }: Context,
): Promise<{ close(): Promise<void> }> {
  const dir = positionals[0] ?? RELATIVE_PATHS.srcDir;
  // A directory that does not exist holds no diagrams either; a file is left alone.
  if (
    !existsSync(dir) ||
    (statSync(dir).isDirectory() && (await fg('**/*.diagram.{ts,json}', { cwd: dir })).length === 0)
  )
    warnNoSources(io, dir);
  // Always locked, and --update-includes is refused here: watch is a long-running
  // live loop with no point at which "refetch and rewrite the lock" makes
  // sense, so it resolves through a locked resolver of its own rather than the run's
  // session (as the studio's watch loop does).
  const watcher = startWatch(dir, flags['--out'] ?? RELATIVE_PATHS.artifactsDir, {
    coreEntry: home.coreEntry,
    resolver: lockedResolverFor(RELATIVE_PATHS.srcDir),
    onEvent: (e) => {
      // Success goes to stdout, failure to stderr, so the streams stay parsed
      // separately by anyone piping them.
      if (e.ok) io.out(formatCompileEvent(e));
      else io.err(formatCompileEvent(e));
    },
  });
  io.out(`Watching ${dir} for *.diagram.{ts,json} changes...`);
  return watcher;
}

/** `diagc watch [dir]`: recompile on every change until the process is stopped. */
export const watch: Command<'--out'> = {
  flags: ['--out'],
  positionals: { max: 1, what: 'one directory' },
  whyNot: LOCKED,
  async run(args, ctx) {
    await startWatching(args, ctx);
    // No exit code ever comes: the run is never over on its own account, and the
    // watcher's handles keep the process alive until it is stopped.
    return new Promise<number>(() => {});
  },
};
