import { errMessage } from '@diagc/core/internal';
import { galleryLink } from '../publish/gallery';

/** What each flag holds once read: its value, or `true` for a flag that takes none. */
export interface FlagValues {
  '--out': string;
  '--no-images': true;
  '--link': string;
  '--json': true;
  '--labels': [string, string];
  '--image-url': string;
  '--update-includes': true;
  '--type': string;
  '--agents': true;
}

export type Flag = keyof FlagValues;

/** What a command takes, as the parser checks it before the command runs. */
export interface Takes<F extends Flag = Flag> {
  /** its flags: any other is refused */
  readonly flags: readonly F[];
  /** a cap on positional arguments, and how the refusal of one more names them;
   * absent where the command takes any number, or has its own message for extra ones */
  readonly positionals?: { readonly max: number; readonly what: string };
  /** why a flag other commands take means nothing here */
  readonly whyNot?: Partial<Record<Flag, string>>;
}

/** argv as read: the command, its positional arguments and the flags given. */
export interface ParsedArgv {
  /** the first argument that is neither a flag nor a flag's value; `compile` when there is none */
  command: string;
  positionals: string[];
  flags: Partial<FlagValues>;
}

/** A mistake in argv, or `--help`. Either way the usage is printed and the run ends with
 * `exitCode`: 0 for help, the usage on stdout; 1 for a mistake, on stderr after the message. */
export class UsageError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'UsageError';
  }
}

const badValue = (flag: Flag, why: string): UsageError => new UsageError(`${flag}: ${why}`, 1);

/** How a flag reads its value from the argument after it, which it takes whatever it is. */
type Reader<V> = (next: string | undefined) => V;

/** Every flag, in the order the refusal of one a command does not take goes through them:
 * how it reads its value, or null for a flag that takes none. */
const FLAGS: { [F in Flag]: FlagValues[F] extends true ? null : Reader<FlagValues[F]> } = {
  '--out': (next) => {
    // No fallback to the default: a trailing --out would quietly write somewhere the
    // user did not ask for, and a missing value would swallow the next flag as the dir.
    if (next === undefined || next.startsWith('--'))
      throw badValue('--out', 'needs a directory, e.g. --out build/artifacts');
    return next;
  },
  '--no-images': null,
  '--link': (next = '') => {
    // No fallback for a missing value: there is no default address, and the URL
    // check is also what stops the next flag being swallowed as one.
    try {
      galleryLink(next);
    } catch (e) {
      throw badValue('--link', errMessage(e));
    }
    return next;
  },
  '--json': null,
  '--labels': (next = '') => {
    const parts = next.split(',');
    if (parts.length !== 2 || parts.some((p) => p.trim() === ''))
      throw badValue('--labels', 'takes two names, before and after: --labels main,#12');
    return [parts[0]!.trim(), parts[1]!.trim()];
  },
  '--image-url': (next = '') => {
    if (!next.includes('{path}'))
      throw badValue('--image-url', 'needs a {path} placeholder, e.g. https://host/pr-1/{path}');
    return next;
  },
  '--update-includes': null,
  '--type': (next) => {
    // No fallback: a missing value would otherwise swallow the next flag as the type.
    if (next === undefined || next.startsWith('--'))
      throw badValue('--type', "needs a diagram type, e.g. --type c4 ('diagc guide' lists them)");
    return next;
  },
  '--agents': null,
};

const isFlag = (arg: string): arg is Flag => Object.hasOwn(FLAGS, arg);

/** Read argv against every flag there is, whichever command it names: which arguments
 * are values depends on the flags alone, and the command may come after its flags. The
 * first mistake in argv's order is thrown as a {@link UsageError}. An unknown flag is an
 * error rather than a file path, so a typo surfaces loudly instead of quietly skewing
 * the file set. */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  let command: string | undefined;
  const positionals: string[] = [];
  const flags: Partial<Record<Flag, unknown>> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (isFlag(arg)) {
      const read = FLAGS[arg];
      flags[arg] = read === null ? true : read(argv[++i]);
      continue;
    }
    if (arg === '--help' || arg === '-h') throw new UsageError('help requested', 0);
    if (arg.startsWith('--')) throw new UsageError(`Unknown flag '${arg}'`, 1);
    // The first argument that is not a flag names the command; anything after it is
    // the command's (flags may appear before or after the command).
    if (command === undefined) command = arg;
    else positionals.push(arg);
  }
  return { command: command ?? 'compile', positionals, flags: flags as Partial<FlagValues> };
}

/** "a", "a and b", "a, b and c" */
const listed = (names: readonly string[]): string =>
  names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;

/** Refuse a flag or an argument the command does not take. Ignored, it would be a wrong
 * file set or an output the user never sees (`init --out build`). The flag refused is
 * the first given in {@link FLAGS}' order, and the message names the commands in
 * `commands` that take it. An unknown command is left to the dispatch, which has its
 * own message. */
export function checkTaken(parsed: ParsedArgv, commands: Readonly<Record<string, Takes>>): void {
  const takes = commands[parsed.command];
  if (takes === undefined) return;
  for (const flag of Object.keys(FLAGS) as Flag[]) {
    if (parsed.flags[flag] === undefined || takes.flags.includes(flag)) continue;
    const takers = Object.keys(commands).filter((c) => commands[c]!.flags.includes(flag));
    const why = takes.whyNot?.[flag] === undefined ? '' : ` (${takes.whyNot[flag]})`;
    throw new UsageError(
      `${parsed.command} does not take ${flag}${why}; ${listed(takers)} ${takers.length === 1 ? 'does' : 'do'}.`,
      1,
    );
  }
  const cap = takes.positionals;
  const extra = cap === undefined ? undefined : parsed.positionals[cap.max];
  if (extra !== undefined) throw new UsageError(`${parsed.command} takes ${cap!.what}; '${extra}' is one too many.`, 1);
}
