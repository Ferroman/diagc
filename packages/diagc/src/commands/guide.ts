import type { Command } from '../cli/command';
import { runGuide } from '../guide';
import { cliVersion } from '../home';

/** `diagc guide [topic]`: how to write a diagram, as Markdown on stdout. */
export const guide: Command<never> = {
  flags: [],
  async run({ positionals }, { io, home }) {
    // The guide is tens of kilobytes and is read through a pipe by an agent. It goes
    // out as one plain write, as guide.ts's own default writes it, and the run ends
    // only once the pipe has taken all of it: a page that stops mid-sentence would
    // read as the whole guide.
    return runGuide(
      positionals,
      { guideDir: home.guideDir, startersDir: home.startersDir, version: cliVersion(home.root) },
      { out: (text) => io.write(`${text}\n`), err: io.err },
    );
  },
};
