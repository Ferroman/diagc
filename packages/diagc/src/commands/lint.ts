import type { Command } from '../cli/command';
import { formatLintReport, lintFile, type LintReport } from '../lint';
import { RELATIVE_PATHS } from '../paths';
import { resolveSources } from './shared';

/** `diagc lint [files...] [--json]`: every finding, and exit 1 on any. */
export const lint: Command<'--json'> = {
  flags: ['--json'],
  async run({ positionals, flags }, { io, home, snapshots }) {
    const files = await resolveSources(io, positionals);
    if (files === undefined) return 1;
    const reports: LintReport[] = [];
    for (const file of files) {
      reports.push(
        ...(await lintFile(file, {
          rootDir: RELATIVE_PATHS.srcDir,
          coreEntry: home.coreEntry,
          resolver: snapshots.resolver,
        })),
      );
    }
    if (flags['--json'] === true) io.out(JSON.stringify(reports, null, 2));
    else for (const r of reports) io.out(formatLintReport(r));
    return reports.length > 0 ? 1 : 0;
  },
};
