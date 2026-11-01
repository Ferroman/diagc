import { errMessage } from '@diagc/core/internal';
import type { Command } from '../cli/command';
import { compileFile } from '../compile';
import { RELATIVE_PATHS } from '../paths';
import { formatCompileEvent } from '../watch';
import { resolveSources } from './shared';

/** `diagc compile [files...]`: the files or diagrams named, or every source, into artifacts. */
export const compile: Command<'--out' | '--update-includes'> = {
  flags: ['--out', '--update-includes'],
  async run({ positionals, flags }, { io, home, snapshots }) {
    const files = await resolveSources(io, positionals);
    if (files === undefined) return 1;
    let failed = false;
    for (const file of files) {
      try {
        const artifact = await compileFile(file, flags['--out'] ?? RELATIVE_PATHS.artifactsDir, {
          rootDir: RELATIVE_PATHS.srcDir,
          coreEntry: home.coreEntry,
          resolver: snapshots.resolver,
          warn: io.err,
        });
        io.out(formatCompileEvent({ file, ok: true, artifact }));
      } catch (e) {
        failed = true;
        io.err(formatCompileEvent({ file, ok: false, error: errMessage(e) }));
      }
    }
    // A source that fails before include resolution (e.g. a pre-compose
    // validation error) never touches its remote URLs, so pruning here would
    // drop their still-valid lock entries and vendored files right along with
    // the genuinely stale ones — skip the prune until every file compiles clean.
    if (flags['--update-includes'] === true && positionals.length === 0 && !failed) await snapshots.prune();
    return failed ? 1 : 0;
  },
};
