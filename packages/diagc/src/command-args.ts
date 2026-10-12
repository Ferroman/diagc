import type { Args } from './cli';

/** Thrown by {@link checkCommandArgs} for a flag or an argument the command does not
 * take; `main` reports it the same way as an unknown flag. */
export class ArgNotTakenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgNotTakenError';
  }
}

const LOCKED = { '--update-includes': 'it always resolves includes locked' };

/** What each command takes: the flags the reference's flag table lists for it, and a
 * cap on positional arguments where the command has no message of its own for extra
 * ones. `why` says why a flag another command takes means nothing here. */
const TAKES: Record<string, { flags: string[]; max?: [number, string]; why?: Record<string, string> }> = {
  compile: { flags: ['--out', '--update-includes'] },
  lint: { flags: ['--json'] },
  watch: { flags: ['--out'], max: [1, 'one directory'], why: LOCKED },
  publish: { flags: ['--out', '--no-images', '--link', '--update-includes'] },
  studio: { flags: [], max: [0, 'no arguments'], why: LOCKED },
  eject: { flags: ['--out'], max: [1, 'one diagram name'], why: LOCKED },
  diff: { flags: ['--out', '--no-images', '--json', '--labels', '--image-url'] },
  guide: { flags: [] },
  init: { flags: ['--type', '--agents'] },
};

/** The flags `args` says were passed. */
function flagsGiven(args: Args): string[] {
  const given: [boolean, string][] = [
    [args.outGiven, '--out'],
    [!args.images, '--no-images'],
    [args.link !== undefined, '--link'],
    [args.json, '--json'],
    [args.labels !== undefined, '--labels'],
    [args.imageUrl !== undefined, '--image-url'],
    [args.updateIncludes, '--update-includes'],
    [args.type !== undefined, '--type'],
    [args.agents, '--agents'],
  ];
  return given.filter(([on]) => on).map(([, flag]) => flag);
}

/** Refuse a flag or an argument `args.command` does not take. Ignored, it would be a
 * wrong file set or an output the user never sees (`init --out build`). */
export function checkCommandArgs(args: Args): void {
  const takes = TAKES[args.command];
  if (takes === undefined) return; // an unknown command has its own message
  for (const flag of flagsGiven(args)) {
    if (takes.flags.includes(flag)) continue;
    const takers = Object.keys(TAKES).filter((c) => TAKES[c]!.flags.includes(flag));
    const list = takers.length === 1 ? takers[0]! : `${takers.slice(0, -1).join(', ')} and ${takers.at(-1)!}`;
    const why = takes.why?.[flag] === undefined ? '' : ` (${takes.why[flag]})`;
    throw new ArgNotTakenError(
      `${args.command} does not take ${flag}${why}; ${list} ${takers.length === 1 ? 'does' : 'do'}.`,
    );
  }
  const extra = takes.max === undefined ? undefined : args.files[takes.max[0]];
  if (extra !== undefined)
    throw new ArgNotTakenError(`${args.command} takes ${takes.max![1]}; '${extra}' is one too many.`);
}
