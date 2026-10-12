import { describe, expect, it } from 'vitest';
import type { Args } from './cli';
import { ArgNotTakenError, checkCommandArgs } from './command-args';

// Args as parseArgs leaves them, built here: importing cli.ts runs the CLI. That
// parseArgs and this check agree on every documented combination is cli.test.ts's.
const check =
  (command: string, files: string[] = [], given: Partial<Args> = {}) =>
  () =>
    checkCommandArgs({
      command,
      files,
      out: '.diagrams/.artifacts',
      outGiven: false,
      images: true,
      updateIncludes: false,
      json: false,
      agents: false,
      ...given,
    });

describe('checkCommandArgs', () => {
  it('refuses a flag the command does not take, naming the commands that do', () => {
    expect(check('init', ['shop'], { out: 'build', outGiven: true })).toThrow(
      new ArgNotTakenError('init does not take --out; compile, watch, publish, eject and diff do.'),
    );
    expect(check('guide', [], { json: true })).toThrow('guide does not take --json; lint and diff do.');
    expect(check('lint', [], { updateIncludes: true })).toThrow(
      'lint does not take --update-includes; compile and publish do.',
    );
    expect(check('compile', [], { link: 'https://x.test' })).toThrow('compile does not take --link; publish does.');
    expect(check('diff', ['v1'], { type: 'c4' })).toThrow('diff does not take --type; init does.');
  });

  it('says why watch, studio and eject take no --update-includes', () => {
    for (const command of ['watch', 'studio', 'eject']) {
      expect(check(command, [], { updateIncludes: true })).toThrow(
        `${command} does not take --update-includes (it always resolves includes locked); compile and publish do.`,
      );
    }
  });

  it('refuses an argument past what the command takes', () => {
    expect(check('eject', ['shop', 'extra'])).toThrow("eject takes one diagram name; 'extra' is one too many.");
    expect(check('studio', ['x'])).toThrow("studio takes no arguments; 'x' is one too many.");
    expect(check('watch', ['a', 'b'])).toThrow("watch takes one directory; 'b' is one too many.");
  });

  it('leaves a missing argument, and init with two names, to the command', () => {
    // each has its own message: eject and diff name what is missing, init says it takes one name
    expect(check('eject')).not.toThrow();
    expect(check('diff')).not.toThrow();
    expect(check('init', ['a', 'b'])).not.toThrow();
    expect(check('nope', [], { json: true })).not.toThrow(); // and an unknown command to main
  });
});
