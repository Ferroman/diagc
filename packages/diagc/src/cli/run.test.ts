import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureIo, DANGLING, diagram, home, inTempDir, MISTYPED, writeSources } from '../../test-fixtures/cli';
import { COMMANDS, run } from './run';

// A usage of the test's own, ending in a newline as the real one does: cli.ts holds the
// real one, and importing it runs the CLI.
const USAGE = 'Usage: diagc <command>\n';

/** What `diagc <argv>` answers, run in process. */
async function diagc(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const io = captureIo();
  const code = await run(argv, io, USAGE);
  return { code, stdout: io.stdout, stderr: io.stderr };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the command table', () => {
  it('holds every command, in the order a refusal names them', () => {
    expect(Object.keys(COMMANDS)).toEqual([
      'compile',
      'lint',
      'watch',
      'publish',
      'show',
      'studio',
      'tui',
      'eject',
      'diff',
      'guide',
      'init',
    ]);
  });

  it('gives each command the flags the reference lists for it', () => {
    expect(Object.fromEntries(Object.entries(COMMANDS).map(([name, c]) => [name, c.flags]))).toEqual({
      compile: ['--out', '--update-includes'],
      lint: ['--json'],
      watch: ['--out'],
      publish: ['--out', '--no-images', '--link', '--update-includes', '--style', '--theme'],
      show: ['--plane', '--layers', '--depth', '--root', '--horizontal', '--ascii', '--color', '--no-color'],
      studio: [],
      tui: ['--style'],
      eject: ['--out'],
      diff: ['--out', '--no-images', '--json', '--labels', '--image-url'],
      guide: [],
      init: ['--type', '--agents'],
    });
  });
});

describe('run', () => {
  it('prints the usage on stdout and exits 0 for --help or -h anywhere before a mistake', async () => {
    const helps = [
      ['--help'],
      ['-h'],
      ['compile', '--help'],
      ['frob', '--help'],
      ['--help', '--bogus'],
      ['--json', '-h'],
    ];
    for (const argv of helps)
      expect([argv, await diagc(argv)]).toEqual([argv, { code: 0, stdout: `${USAGE}\n`, stderr: '' }]);
  });

  it('prints the version on stdout and exits 0 for --version, whatever command it follows', async () => {
    const { version } = JSON.parse(readFileSync(path.join(home.root, 'package.json'), 'utf8')) as { version: string };
    for (const argv of [['--version'], ['show', 'x', '--version']])
      expect(await diagc(argv)).toEqual({ code: 0, stdout: `${version}\n`, stderr: '' });
  });

  it("refuses a flag as argv reads, then one the command does not take in the flag table's order, then an argument too many", async () => {
    const out = 'compile, watch, publish, eject and diff do.';
    const locked = '(it always resolves includes locked); compile and publish do.';
    const refused: [string[], string][] = [
      [['compile', '--frobnicate'], "Unknown flag '--frobnicate'"],
      [['eject', '--update-includes', '--bogus'], "Unknown flag '--bogus'"],
      [['compile', '--out', '--json'], '--out: needs a directory, e.g. --out build/artifacts'],
      [['init', '--out', 'x', '--type'], "--type: needs a diagram type, e.g. --type c4 ('diagc guide' lists them)"],
      [['publish', '--link', 'ftp://example.com'], "--link: link must be an http(s) URL, got 'ftp://example.com'"],
      [['diff', '--labels', 'a', '--json'], '--labels: takes two names, before and after: --labels main,#12'],
      [
        ['diff', 'a', '--image-url', 'https://x/'],
        '--image-url: needs a {path} placeholder, e.g. https://host/pr-1/{path}',
      ],
      [['--json'], 'compile does not take --json; lint and diff do.'],
      [['init', 'shop', '--out', 'build'], `init does not take --out; ${out}`],
      [['lint', '--type', 'c4', '--out', 'x'], `lint does not take --out; ${out}`],
      [['lint', '--update-includes'], 'lint does not take --update-includes; compile and publish do.'],
      [['guide', 'a', 'b', '--agents', '--json'], 'guide does not take --json; lint and diff do.'],
      [['compile', '--link', 'https://x.test'], 'compile does not take --link; publish does.'],
      [['diff', 'v1', '--type', 'c4'], 'diff does not take --type; init does.'],
      [['watch', '--update-includes'], `watch does not take --update-includes ${locked}`],
      [['studio', '--update-includes'], `studio does not take --update-includes ${locked}`],
      [['eject', 'a', 'b', '--update-includes'], `eject does not take --update-includes ${locked}`],
      [['studio', 'x'], "studio takes no arguments; 'x' is one too many."],
      [['watch', 'a', 'b', '--out', 'o'], "watch takes one directory; 'b' is one too many."],
      [['eject', 'shop', 'extra'], "eject takes one diagram name; 'extra' is one too many."],
    ];
    for (const [argv, message] of refused) {
      expect([argv, await diagc(argv)]).toEqual([
        argv,
        { code: 1, stdout: '', stderr: `diagc: ${message}\n\n${USAGE}\n` },
      ]);
    }
  });

  it('says so, with the usage, for an unknown command, whatever flags it was given', async () => {
    for (const argv of [['frob'], ['frob', '--json', 'a', 'b'], ['-x'], ['--out', 'o', 'frob']]) {
      const name = argv.find((a) => a === 'frob' || a === '-x')!;
      expect([argv, await diagc(argv)]).toEqual([
        argv,
        { code: 1, stdout: '', stderr: `diagc: Unknown command '${name}'.\n${USAGE}\n` },
      ]);
    }
  });

  it('runs the command argv names with its arguments, the io, the usage and the run’s context, and exits with its code', async () => {
    for (const name of Object.keys(COMMANDS)) {
      const command = COMMANDS[name]!;
      const spy = vi.spyOn(command, 'run').mockResolvedValue(7);
      const flag = command.flags[0];
      const argv = flag === '--out' ? [name, '--out', 'o'] : [name];
      const io = captureIo();
      expect(await run(argv, io, USAGE)).toBe(7);
      expect(spy).toHaveBeenCalledWith(
        { command: name, positionals: [], flags: flag === '--out' ? { '--out': 'o' } : {} },
        { io, usage: USAGE, home, snapshots: { resolver: expect.any(Function), prune: expect.any(Function) } },
      );
    }
  });

  it('reads no command as compile', async () => {
    const spy = vi.spyOn(COMMANDS['compile']!, 'run').mockResolvedValue(0);
    expect((await diagc(['--out', 'build'])).code).toBe(0);
    expect(spy).toHaveBeenCalledWith(
      { command: 'compile', positionals: [], flags: { '--out': 'build' } },
      expect.anything(),
    );
  });

  it('says on stderr what no command answered itself, with exit 1', async () => {
    vi.spyOn(COMMANDS['lint']!, 'run').mockRejectedValue(new Error('the disk went away'));
    expect(await diagc(['lint'])).toEqual({ code: 1, stdout: '', stderr: 'the disk went away\n' });
  });

  it('shares one snapshot session, in update mode with --update-includes', async () => {
    const lock = `${JSON.stringify({ version: 1, includes: { 'https://example.com/x.diagram.json': { file: 'includes/x-0.diagram.json', sha256: '0' } } }, null, 2)}\n`;
    const after = async (argv: string[]) =>
      inTempDir(async (dir) => {
        writeSources(dir, { a: diagram('a') });
        mkdirSync(path.join(dir, '.diagrams', 'includes'));
        writeFileSync(path.join(dir, '.diagrams', 'includes', 'x-0.diagram.json'), '{}\n');
        writeFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), lock);
        expect((await diagc(argv)).code).toBe(0);
        return readFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), 'utf8');
      });
    expect(await after(['compile'])).toBe(lock);
    expect(await after(['compile', '--update-includes'])).toBe(
      `${JSON.stringify({ version: 1, includes: {} }, null, 2)}\n`,
    );
    expect(await after(['publish', '--no-images', '--update-includes'])).toBe(
      `${JSON.stringify({ version: 1, includes: {} }, null, 2)}\n`,
    );
  });
});

describe('each command, through run', () => {
  it('compile, lint and publish', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { a: diagram('a'), b: diagram('b', MISTYPED), c: diagram('c', DANGLING) });
      const compiled = await diagc(['compile', '.diagrams/src/a.diagram.json', '.diagrams/src/b.diagram.json']);
      expect(compiled).toEqual({
        code: 0,
        stdout:
          '✓ .diagrams/src/a.diagram.json -> .diagrams/.artifacts/a.diagram.json\n' +
          '✓ .diagrams/src/b.diagram.json -> .diagrams/.artifacts/b.diagram.json\n',
        stderr:
          ".diagrams/src/b.diagram.json: 'a' has type 'servise', which draws as a plain box (did you mean 'service'?)\n",
      });
      const linted = await diagc(['lint', '--json', '.diagrams/src/b.diagram.json']);
      expect([linted.code, JSON.parse(linted.stdout).length, linted.stderr]).toEqual([1, 1, '']);
      const published = await diagc(['publish', '--no-images', 'a']);
      expect([published.code, published.stdout]).toEqual([
        1,
        '✓ 1 page(s) -> .diagrams/html\n✓ gallery -> .diagrams/html/index.html\n',
      ]);
      expect(published.stderr).toMatch(/^✗ .*c\.diagram\.json\n/m);
    });
  });

  it('eject, diff, guide and init', async () => {
    await inTempDir(async (dir) => {
      expect((await diagc(['init', 'shop'])).code).toBe(0);
      writeSources(dir, { cart: diagram('cart') });
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync(
        'git',
        ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'v1'],
        { cwd: dir },
      );
      expect(await diagc(['eject', 'cart'])).toEqual({
        code: 0,
        stdout: '✓ .diagrams/src/cart.diagram.ts\n',
        stderr: '',
      });
      writeSources(dir, { fresh: diagram('fresh') });
      const changed = await diagc(['diff', 'HEAD', '--no-images', '--json']);
      expect(changed.code).toBe(0);
      expect(JSON.parse(changed.stdout).diagrams.map((d: { status: string }) => d.status)).toEqual([
        'unchanged',
        'added',
        'unchanged',
      ]);
      expect(changed.stderr).toMatch(/^✓ 1 page\(s\) -> \.diagrams\/diff\/HEAD\.\.working-tree\n/);
      expect(readdirSync(path.join(dir, '.diagrams'))).toContain('diff');
      const guide = await diagc(['guide']);
      expect([guide.code, guide.stdout.startsWith('# Writing diagc diagrams\n'), guide.stderr]).toEqual([0, true, '']);
      expect(await diagc(['eject'])).toEqual({
        code: 1,
        stdout: '',
        stderr: `diagc: eject needs a diagram name.\n${USAGE}\n`,
      });
      expect(await diagc(['diff'])).toEqual({
        code: 1,
        stdout: '',
        stderr: `diagc: diff needs a git ref (diff v1.0) or a range (diff v1.0..v2.0).\n${USAGE}\n`,
      });
    });
  });
});
