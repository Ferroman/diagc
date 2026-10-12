import { errMessage } from '@diagc/core/internal';
import type { Command } from '../cli/command';
import { ejectDiagram } from '../eject';
import { diagramName } from '../names';
import { ARTIFACTS_DIR, LOCKED } from './shared';

/** `diagc eject <name>`: a JSON diagram as a generated TypeScript source. */
export const eject: Command<'--out'> = {
  flags: ['--out'],
  positionals: { max: 1, what: 'one diagram name' },
  whyNot: LOCKED,
  async run({ positionals, flags }, { io, usage, home }) {
    // ejectDiagram's post-swap recompile always resolves includes locked (see
    // eject.ts) — same reasoning as watch's.
    const name = positionals[0] === undefined ? undefined : diagramName(positionals[0]);
    if (name === undefined || name === '') {
      io.err('diagc: eject needs a diagram name.');
      io.err(usage);
      return 1;
    }
    try {
      const res = await ejectDiagram('.diagrams/src', flags['--out'] ?? ARTIFACTS_DIR, name, {
        coreEntry: home.coreEntry,
      });
      io.out(`✓ ${res.tsPath}`);
      return 0;
    } catch (e) {
      io.err(errMessage(e));
      return 1;
    }
  },
};
