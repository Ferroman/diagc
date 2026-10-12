import type { Command } from '../cli/command';
import { runStudio } from '../studio';
import { LOCKED } from './shared';

/** `diagc studio`: the studio against the current directory, until it is stopped. */
export const studio: Command<never> = {
  flags: [],
  positionals: { max: 0, what: 'no arguments' },
  whyNot: LOCKED,
  async run(_args, { home }) {
    // Studio's own compile-watch loop always resolves includes locked (see
    // studio.ts) — same reasoning as watch's.
    await runStudio(home, process.cwd());
    return 0;
  },
};
