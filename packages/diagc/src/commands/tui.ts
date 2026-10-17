import { mkdir } from 'node:fs/promises';
import type { Command } from '../cli/command';
import { diagramName } from '../names';
import { RELATIVE_PATHS } from '../paths';
import { screenColorMode } from '../text/ansi';
import { runTui, watchSources } from '../tui/app';
import { processTerminal } from '../tui/terminal';
import { LOCKED, sourceOf } from './shared';

/** `diagc tui [name]`: the diagrams in the terminal, live, until it is quit. */
export const tui: Command<never> = {
  flags: [],
  positionals: { max: 1, what: 'one diagram name' },
  // Its compile-watch loop resolves includes locked, as the studio's does.
  whyNot: LOCKED,
  async run({ positionals }, { io, home }) {
    const name = positionals[0] === undefined ? undefined : diagramName(positionals[0]);
    if (name !== undefined && sourceOf(name) === undefined) {
      io.err(`diagc: no diagram '${name}'`);
      return 1;
    }
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
      io.err("diagc: tui needs a terminal; use 'diagc show <name>' to print a diagram.");
      return 1;
    }
    const { srcDir, artifactsDir } = RELATIVE_PATHS;
    await mkdir(srcDir, { recursive: true });
    await runTui({
      terminal: processTerminal(process.stdin, process.stdout),
      srcDir,
      artifactsDir,
      ...(name !== undefined ? { name } : {}),
      watch: watchSources(srcDir, artifactsDir, home.coreEntry),
      color: screenColorMode(process.env),
    });
    return 0;
  },
};
