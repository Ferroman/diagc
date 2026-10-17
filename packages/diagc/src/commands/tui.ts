import { mkdir } from 'node:fs/promises';
import type { Command } from '../cli/command';
import { diagramName } from '../names';
import { RELATIVE_PATHS } from '../paths';
import { screenColorMode } from '../text/ansi';
import type { TextStyle } from '../text/dos';
import { runTui, watchSources } from '../tui/app';
import { processTerminal } from '../tui/terminal';
import { LOCKED, sourceOf } from './shared';

/** The styles a terminal draws, which `--style` may name here. */
const TEXT_STYLES: readonly TextStyle[] = ['clean', 'dos'];

/** `diagc tui [name]`: the diagrams in the terminal, live, until it is quit. */
export const tui: Command<'--style'> = {
  flags: ['--style'],
  positionals: { max: 1, what: 'one diagram name' },
  // Its compile-watch loop resolves includes locked, as the studio's does.
  whyNot: LOCKED,
  async run({ positionals, flags }, { io, home }) {
    const style = flags['--style'];
    if (style !== undefined && !TEXT_STYLES.includes(style as TextStyle)) {
      io.err(`diagc: the terminal draws the clean and dos styles, not '${style}'`);
      return 1;
    }
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
      ...(style !== undefined ? { style: style as TextStyle } : {}),
    });
    return 0;
  },
};
