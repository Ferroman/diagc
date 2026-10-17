import { describe, expect, it } from 'vitest';
import { checkTaken, parseArgv, UsageError, type Takes } from './parse';

/** What `parseArgv` throws for `argv`. */
function refusal(argv: string[]): UsageError {
  try {
    parseArgv(argv);
  } catch (e) {
    if (e instanceof UsageError) return e;
    throw e;
  }
  throw new Error(`parseArgv(${JSON.stringify(argv)}) threw nothing`);
}

describe('parseArgv', () => {
  it('reads the command, its positional arguments and its flags, flags before or after the command', () => {
    expect(parseArgv(['init', 'shop', '--type', 'c4', '--agents'])).toEqual({
      command: 'init',
      positionals: ['shop'],
      flags: { '--type': 'c4', '--agents': true },
    });
    expect(parseArgv(['--agents', 'init'])).toEqual({ command: 'init', positionals: [], flags: { '--agents': true } });
    expect(parseArgv(['compile', 'a.diagram.ts', 'b.diagram.ts', '--out', 'dist', '--no-images'])).toEqual({
      command: 'compile',
      positionals: ['a.diagram.ts', 'b.diagram.ts'],
      flags: { '--out': 'dist', '--no-images': true },
    });
  });

  it('reads no command as compile', () => {
    expect(parseArgv([])).toEqual({ command: 'compile', positionals: [], flags: {} });
    expect(parseArgv(['--update-includes'])).toEqual({
      command: 'compile',
      positionals: [],
      flags: { '--update-includes': true },
    });
  });

  it("reads each flag's value", () => {
    expect(
      parseArgv([
        'diff',
        'a..b',
        'shop',
        '--labels',
        'main, #12',
        '--image-url',
        'https://x/{path}?raw=true',
        '--json',
        '--out',
        'x',
      ]),
    ).toEqual({
      command: 'diff',
      positionals: ['a..b', 'shop'],
      flags: { '--labels': ['main', '#12'], '--image-url': 'https://x/{path}?raw=true', '--json': true, '--out': 'x' },
    });
    expect(parseArgv(['publish', '--link', 'https://github.com/o/r']).flags).toEqual({
      '--link': 'https://github.com/o/r',
    });
    expect(parseArgv(['publish', '--style', 'sketch', '--theme', 'dark']).flags).toEqual({
      '--style': 'sketch',
      '--theme': 'dark',
    });
  });

  it("reads show's view flags", () => {
    expect(
      parseArgv([
        'show',
        'shop',
        '--plane',
        'logical',
        '--layers',
        'a, b',
        '--depth',
        '2',
        '--root',
        'p',
        '--ascii',
        '--color',
      ]).flags,
    ).toEqual({
      '--plane': 'logical',
      '--layers': ['a', 'b'],
      '--depth': 2,
      '--root': 'p',
      '--ascii': true,
      '--color': true,
    });
    expect(parseArgv(['show', 'shop', '--layers', '', '--no-color', '--depth', '0']).flags).toEqual({
      '--layers': [],
      '--no-color': true,
      '--depth': 0,
    });
  });

  it('refuses a style it does not know and a theme that is neither light nor dark, naming the choices', () => {
    expect(() => parseArgv(['publish', '--style', 'sketchy'])).toThrow(
      /--style: no style 'sketchy'; one of clean, sketch/,
    );
    expect(() => parseArgv(['publish', '--style'])).toThrow(/--style: needs a style id/);
    expect(() => parseArgv(['publish', '--theme', 'blue'])).toThrow(/--theme: light or dark/);
    expect(() => parseArgv(['publish', '--theme'])).toThrow(/--theme: light or dark/);
  });

  it('takes the argument after a flag as its value, so it is neither the command nor a flag', () => {
    expect(parseArgv(['--out', 'lint', 'compile'])).toMatchObject({ command: 'compile', flags: { '--out': 'lint' } });
    expect(parseArgv(['--out', '-h'])).toMatchObject({ command: 'compile', flags: { '--out': '-h' } });
    expect(parseArgv(['--out', 'a', '--out', 'b']).flags).toEqual({ '--out': 'b' });
  });

  it('reads an argument with one dash, other than -h, as an argument', () => {
    expect(parseArgv(['-x', '-y'])).toEqual({ command: '-x', positionals: ['-y'], flags: {} });
    expect(parseArgv([''])).toEqual({ command: '', positionals: [], flags: {} });
  });

  it('asks for the usage with exit 0 for --help or -h, anywhere before a mistake', () => {
    for (const argv of [['--help'], ['watch', '-h'], ['compile', 'a.diagram.ts', '--help'], ['--help', '--bogus']]) {
      expect(refusal(argv)).toMatchObject({ exitCode: 0 });
    }
  });

  it('refuses the first mistake in argv, with exit 1', () => {
    const refused: [string[], string][] = [
      [['publish', '--nope'], "Unknown flag '--nope'"],
      [['--bogus', '--help'], "Unknown flag '--bogus'"],
      [['compile', '--out'], '--out: needs a directory, e.g. --out build/artifacts'],
      [['compile', '--out', '--json'], '--out: needs a directory, e.g. --out build/artifacts'],
      [['init', '--type'], "--type: needs a diagram type, e.g. --type c4 ('diagc guide' lists them)"],
      [['init', '--type', '--agents'], "--type: needs a diagram type, e.g. --type c4 ('diagc guide' lists them)"],
      [['publish', '--link'], "--link: link must be an http(s) URL, got ''"],
      [['publish', '--link', 'javascript:alert(1)'], "--link: link must be an http(s) URL, got 'javascript:alert(1)'"],
      [['publish', '--link', '--no-images'], "--link: link must be an http(s) URL, got '--no-images'"],
      [['diff', 'a', '--labels', 'main'], '--labels: takes two names, before and after: --labels main,#12'],
      [['diff', 'a', '--labels', 'main, '], '--labels: takes two names, before and after: --labels main,#12'],
      [['diff', 'a', '--labels', 'a,b,c'], '--labels: takes two names, before and after: --labels main,#12'],
      [
        ['diff', 'a', '--image-url', 'https://x/'],
        '--image-url: needs a {path} placeholder, e.g. https://host/pr-1/{path}',
      ],
      [['diff', 'a', '--image-url'], '--image-url: needs a {path} placeholder, e.g. https://host/pr-1/{path}'],
      [['init', '--out', '--type'], '--out: needs a directory, e.g. --out build/artifacts'],
      [['--json', '--type'], "--type: needs a diagram type, e.g. --type c4 ('diagc guide' lists them)"],
      [['show', 'a', '--plane'], '--plane: needs a plane id, e.g. --plane logical'],
      [['show', 'a', '--plane', '--ascii'], '--plane: needs a plane id, e.g. --plane logical'],
      [['show', 'a', '--root'], '--root: needs a node id, e.g. --root checkout'],
      [['show', 'a', '--layers'], "--layers: needs layer ids, e.g. --layers security,data ('' for none)"],
      [['show', 'a', '--depth'], '--depth: a whole number of levels to open, e.g. --depth 1'],
      [['show', 'a', '--depth', '-1'], '--depth: a whole number of levels to open, e.g. --depth 1'],
      [['show', 'a', '--depth', '1.5'], '--depth: a whole number of levels to open, e.g. --depth 1'],
      [['show', 'a', '--depth', 'x'], '--depth: a whole number of levels to open, e.g. --depth 1'],
    ];
    for (const [argv, message] of refused) expect([argv, refusal(argv)]).toEqual([argv, new UsageError(message, 1)]);
    expect(refusal(['--nope']).exitCode).toBe(1);
  });
});

describe('checkTaken', () => {
  // Commands of this test's own: the order is the one the refusal lists them in.
  const commands: Record<string, Takes> = {
    one: { flags: ['--out', '--json'] },
    two: { flags: ['--json', '--agents'], positionals: { max: 1, what: 'one name' } },
    three: { flags: ['--json'], whyNot: { '--out': 'it writes nothing' } },
    four: { flags: [] },
  };
  const check = (argv: string[]) => () => checkTaken(parseArgv(argv), commands);

  it('takes the flags and the arguments the command lists', () => {
    expect(check(['one', 'a', 'b', 'c', '--out', 'x', '--json'])).not.toThrow();
    expect(check(['two', 'a', '--agents'])).not.toThrow();
    expect(check(['four', 'a', 'b'])).not.toThrow();
  });

  it('refuses a flag the command does not take, naming the commands that do, with exit 1', () => {
    expect(check(['four', '--out', 'x'])).toThrow(new UsageError('four does not take --out; one does.', 1));
    expect(check(['one', '--agents'])).toThrow('one does not take --agents; two does.');
    expect(check(['four', '--json'])).toThrow('four does not take --json; one, two and three do.');
    expect(check(['three', '--out', 'x'])).toThrow('three does not take --out (it writes nothing); one does.');
  });

  it("refuses the first such flag in the flag table's order, not argv's", () => {
    // --out comes before --json, and --json before --agents, in the table
    expect(check(['four', '--json', '--out', 'x'])).toThrow('four does not take --out; one does.');
    expect(check(['one', '--agents', '--json', '--no-images'])).toThrow('one does not take --no-images; ');
  });

  it('refuses an argument past the cap, after the flags', () => {
    expect(check(['two', 'a', 'b'])).toThrow(new UsageError("two takes one name; 'b' is one too many.", 1));
    expect(check(['two', 'a', 'b', '--out', 'x'])).toThrow('two does not take --out; one does.');
  });

  it('leaves an unknown command to the dispatch', () => {
    expect(check(['nope', '--out', 'x', 'a', 'b'])).not.toThrow();
  });
});
