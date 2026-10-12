import type { Command } from '../cli/command';
import { cliVersion } from '../home';
import { runInit } from '../init';

/** `diagc init [name]`: set a repository up for diagc. */
export const init: Command<'--type' | '--agents'> = {
  flags: ['--type', '--agents'],
  async run({ positionals, flags }, { io, home, snapshots }) {
    if (positionals.length > 1) {
      io.err(`diagc: init takes one name, got ${positionals.length} — e.g. diagc init shop --type c4`);
      return 1;
    }
    return runInit(
      {
        cwd: process.cwd(),
        ...(positionals[0] !== undefined ? { name: positionals[0] } : {}),
        ...(flags['--type'] !== undefined ? { type: flags['--type'] } : {}),
        agents: flags['--agents'] === true,
        startersDir: home.startersDir,
        skillFile: home.skillFile,
        version: cliVersion(home.root),
        coreEntry: home.coreEntry,
        resolver: snapshots.resolver,
      },
      io,
    );
  },
};
