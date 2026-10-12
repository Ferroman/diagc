import { describe, expect, it } from 'vitest';
import { checkTaken, parseArgv, UsageError } from './cli/parse';
import { TAKES } from './command-args';

const check = (argv: string[]) => () => checkTaken(parseArgv(argv), TAKES);

describe('what each command takes', () => {
  it('refuses a flag the command does not take, naming the commands that do', () => {
    expect(check(['init', 'shop', '--out', 'build'])).toThrow(
      new UsageError('init does not take --out; compile, watch, publish, eject and diff do.', 1),
    );
    expect(check(['guide', '--json'])).toThrow('guide does not take --json; lint and diff do.');
    expect(check(['lint', '--update-includes'])).toThrow(
      'lint does not take --update-includes; compile and publish do.',
    );
    expect(check(['compile', '--link', 'https://x.test'])).toThrow('compile does not take --link; publish does.');
    expect(check(['diff', 'v1', '--type', 'c4'])).toThrow('diff does not take --type; init does.');
  });

  it('reads no command as compile', () => {
    expect(check(['--json'])).toThrow('compile does not take --json; lint and diff do.');
  });

  it('says why watch, studio and eject take no --update-includes', () => {
    for (const command of ['watch', 'studio', 'eject']) {
      expect(check([command, '--update-includes'])).toThrow(
        `${command} does not take --update-includes (it always resolves includes locked); compile and publish do.`,
      );
    }
  });

  it('refuses an argument past what the command takes', () => {
    expect(check(['eject', 'shop', 'extra'])).toThrow("eject takes one diagram name; 'extra' is one too many.");
    expect(check(['studio', 'x'])).toThrow("studio takes no arguments; 'x' is one too many.");
    expect(check(['watch', 'a', 'b'])).toThrow("watch takes one directory; 'b' is one too many.");
  });

  it('leaves a missing argument, and init or guide with two, to the command', () => {
    // each has its own message: eject and diff name what is missing, init and guide say they take one
    expect(check(['eject'])).not.toThrow();
    expect(check(['diff'])).not.toThrow();
    expect(check(['init', 'a', 'b'])).not.toThrow();
    expect(check(['guide', 'a', 'b'])).not.toThrow();
    expect(check(['nope', '--json'])).not.toThrow(); // and an unknown command to the dispatch
  });

  it('takes every flag on every command the flag table lists it for', () => {
    const takes: [string, string[]][] = [
      ['--out x', ['compile', 'watch', 'publish', 'eject', 'diff']],
      ['--no-images', ['publish', 'diff']],
      ['--link https://x.test', ['publish']],
      ['--labels a,b', ['diff']],
      ['--image-url https://x.test/{path}', ['diff']],
      ['--json', ['lint', 'diff']],
      ['--type c4', ['init']],
      ['--agents', ['init']],
      ['--update-includes', ['compile', 'publish']],
    ];
    for (const [flag, commands] of takes) {
      for (const command of commands) expect(check([command, ...flag.split(' ')])).not.toThrow();
    }
  });

  it('takes the arguments each command reads', () => {
    expect(check(['compile', 'a.diagram.ts', 'b.diagram.ts'])).not.toThrow();
    expect(check(['lint', 'a.diagram.ts', 'b.diagram.ts'])).not.toThrow();
    expect(check(['publish', 'shop', 'cart'])).not.toThrow();
    expect(check(['watch', '.diagrams/src/team'])).not.toThrow();
    expect(check(['eject', 'shop'])).not.toThrow();
    expect(check(['diff', 'v1..v2', 'shop', 'cart'])).not.toThrow();
    expect(check(['guide', 'c4'])).not.toThrow();
    expect(check(['init', 'shop'])).not.toThrow();
    expect(check(['studio'])).not.toThrow();
  });
});
