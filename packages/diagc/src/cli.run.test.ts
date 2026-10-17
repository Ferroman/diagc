import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { findHome, homePaths } from './home';
import { findChrome } from './publish/snapshot';

// The real CLI through its development entry (tsx-registered, no build step),
// run from directories of its own: these tests are about what a user sees in a
// repository that is not this one.
const home = findHome(fileURLToPath(import.meta.url));
const bin = path.join(home.root, 'bin', 'diagc.mjs');
const NO_SOURCES = "No diagrams under .diagrams/src — run 'diagc init' to create one.";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An empty repository: a temp dir, optionally with an empty `.diagrams/src`. */
export function fresh(withSrc = false): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'diagc-run-'));
  if (withSrc) mkdirSync(path.join(dir, '.diagrams', 'src'), { recursive: true });
  dirs.push(dir);
  return dir;
}

export function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd, env });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('with no sources', () => {
  it('compile says so on stderr and still exits 0', () => {
    const r = run(['compile'], fresh());
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr.trim()).toBe(NO_SOURCES);
  }, 30_000);

  it('lint --json keeps its empty array on stdout, with the message on stderr', () => {
    const r = run(['lint', '--json'], fresh(true));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('[]\n');
    expect(r.stderr.trim()).toBe(NO_SOURCES);
  }, 30_000);

  it('lint without --json prints nothing on stdout', () => {
    const r = run(['lint'], fresh());
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr.trim()).toBe(NO_SOURCES);
  }, 30_000);

  it('says nothing when a file is named, even one that does not exist', () => {
    const r = run(['lint', '--json', 'nope.diagram.ts'], fresh());
    expect(r.stderr).not.toContain('No diagrams under');
  }, 30_000);

  it('watch says so at start, then keeps watching', async () => {
    const child = spawn(process.execPath, [bin, 'watch'], { cwd: fresh(true) });
    const stderr = await new Promise<string>((resolve) => {
      let buf = '';
      const timer = setTimeout(() => resolve(buf), 20_000);
      child.stderr.on('data', (d: Buffer) => {
        buf += d.toString();
        if (buf.includes('No diagrams under')) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
    });
    // Still running a second later: the command never hands main an exit code.
    await new Promise((r) => setTimeout(r, 1000));
    const ended = [child.exitCode, child.signalCode];
    child.kill();
    expect(stderr.trim()).toBe(NO_SOURCES);
    expect(ended).toEqual([null, null]);
  }, 30_000);

  it('watch says so when its directory does not exist', async () => {
    const dir = fresh();
    const child = spawn(process.execPath, [bin, 'watch', 'nowhere'], { cwd: dir });
    const stderr = await new Promise<string>((resolve) => {
      let buf = '';
      const timer = setTimeout(() => resolve(buf), 20_000);
      child.stderr.on('data', (d: Buffer) => {
        buf += d.toString();
        if (buf.includes('No diagrams under')) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
      // The check runs before the watcher starts: once it is watching, the line is due or never comes.
      child.stdout.on('data', (d: Buffer) => {
        if (d.toString().includes('Watching')) setTimeout(() => resolve(buf), 1_000);
      });
    });
    child.kill();
    expect(stderr.trim()).toBe("No diagrams under nowhere — run 'diagc init' to create one.");
  }, 30_000);

  it('watch still accepts a single file instead of crashing on the source check', async () => {
    const dir = fresh(true);
    const model = {
      version: 1,
      id: 'x',
      name: 'X',
      nodes: [{ id: 'a', name: 'A', type: 'service' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    writeFileSync(path.join(dir, '.diagrams', 'src', 'x.diagram.json'), JSON.stringify(model));
    const child = spawn(process.execPath, [bin, 'watch', '.diagrams/src/x.diagram.json'], { cwd: dir });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    const stdout = await new Promise<string>((resolve) => {
      let buf = '';
      const timer = setTimeout(() => resolve(buf), 20_000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve(buf);
      });
      child.stdout.on('data', (d: Buffer) => {
        buf += d.toString();
        if (buf.includes('Watching')) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
    });
    child.kill();
    expect(stderr).not.toContain('ENOTDIR');
    expect(stdout).toContain('Watching .diagrams/src/x.diagram.json');
  }, 30_000);

  it('does not say so when there is a source, and reports the sources in path order', () => {
    const dir = fresh(true);
    const model = {
      version: 1,
      id: 'x',
      name: 'X',
      nodes: [{ id: 'a', name: 'A', type: 'servise' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    mkdirSync(path.join(dir, '.diagrams', 'src', 'a'));
    for (const rel of ['b', 'a/z', 'c'])
      writeFileSync(path.join(dir, '.diagrams', 'src', `${rel}.diagram.json`), JSON.stringify(model));
    const r = run(['lint', '--json'], dir);
    expect(r.stderr).toBe('');
    expect((JSON.parse(r.stdout) as { file: string }[]).map((f) => f.file)).toEqual([
      '.diagrams/src/a/z.diagram.json',
      '.diagrams/src/b.diagram.json',
      '.diagrams/src/c.diagram.json',
    ]);
  }, 30_000);
});

describe('diagc init, through the real CLI', () => {
  it('sets up an empty directory and exits 0', () => {
    const dir = fresh();
    const r = run(['init', 'shop', '--type', 'c4'], dir);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(existsSync(path.join(dir, '.diagrams', 'src', 'shop.diagram.ts'))).toBe(true);
    expect(existsSync(path.join(dir, '.diagrams', '.artifacts', 'shop.diagram.json'))).toBe(true);
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('.diagrams/html/');
    expect(r.stdout).toMatch(/^✓ \.diagrams\/src\/shop\.diagram\.ts\s+\(c4 starter\)$/m);
    expect(r.stdout).toContain('Next:');
    // the directory is then a repository with a diagram: no more no-sources message
    expect(run(['lint', '--json'], dir).stderr).toBe('');
  }, 60_000);

  it('refuses an unknown type on stderr with exit 1 and writes nothing', () => {
    const dir = fresh();
    const r = run(['init', '--type', 'c5'], dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^diagc: No starter 'c5'\. Types: activity, basic, c4/);
    expect(readdirSync(dir)).toEqual([]);
  }, 30_000);

  it('--agents writes the skill the checkout ships into a repository with a .claude folder', () => {
    const dir = fresh();
    mkdirSync(path.join(dir, '.claude'));
    const r = run(['init', '--agents'], dir);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const shipped = readFileSync(
      path.join(path.dirname(path.dirname(bin)), 'packages', 'diagc', 'skill', 'SKILL.md'),
      'utf8',
    );
    expect(readFileSync(path.join(dir, '.claude', 'skills', 'diagc', 'SKILL.md'), 'utf8')).toBe(shipped);
    expect(r.stdout).toMatch(/^✓ \.claude\/skills\/diagc\/SKILL\.md\s+\(diagc skill added\)$/m);
  }, 60_000);

  it('takes one name at most', () => {
    const r = run(['init', 'a', 'b'], fresh());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^diagc: init takes one name, got 2/);
  }, 30_000);

  it('refuses a flag or an argument its command does not take, with the usage, writing nothing', () => {
    const dir = fresh();
    const refused: [string[], RegExp][] = [
      [
        ['init', 'shop', '--out', 'build'],
        /^diagc: init does not take --out; compile, watch, publish, eject and diff do\.$/m,
      ],
      [['guide', '--json'], /^diagc: guide does not take --json; lint and diff do\.$/m],
      [['lint', '--update-includes'], /^diagc: lint does not take --update-includes; compile and publish do\.$/m],
      [['eject', 'shop', 'extra'], /^diagc: eject takes one diagram name; 'extra' is one too many\.$/m],
    ];
    for (const [argv, message] of refused) {
      const r = run(argv, dir);
      expect(r.status).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(message);
      expect(r.stderr).toContain('Usage: diagc');
    }
    expect(readdirSync(dir)).toEqual([]);
  }, 60_000);

  it('lists init in --help', () => {
    const r = run(['--help'], fresh());
    expect(r.stdout).toMatch(/^ {2}init /m);
    expect(r.stdout).toMatch(/^ {2}--type <type>/m);
    expect(r.stdout).toMatch(/^ {2}--agents/m);
  }, 30_000);
});

/** A diagram source: one service node, with the given extra fields. */
function diagram(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    id,
    name: id,
    nodes: [{ id: 'a', name: 'A', type: 'service' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
    ...extra,
  };
}

describe('diagc publish, through the real CLI', () => {
  // publish stops at once without the viewer shell, and CI runs the tests before
  // `pnpm build:dist` builds it, so a checkout that lacks it builds it here (about a second).
  beforeAll(() => {
    if (existsSync(homePaths(home).viewerShell)) return;
    const r = spawnSync('pnpm', ['build:cli'], { cwd: home.root, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`pnpm build:cli failed:\n${r.stderr}`);
  }, 120_000);

  it('keeps the include lock when a source fails before its includes resolve', () => {
    const dir = fresh(true);
    const url = 'https://example.com/svc.diagram.json';
    const text = `${JSON.stringify(diagram('svc'), null, 2)}\n`;
    const vendored = 'includes/svc-00000000.diagram.json';
    const lock = `${JSON.stringify(
      { version: 1, includes: { [url]: { file: vendored, sha256: createHash('sha256').update(text).digest('hex') } } },
      null,
      2,
    )}\n`;
    mkdirSync(path.join(dir, '.diagrams', 'includes'));
    writeFileSync(path.join(dir, '.diagrams', vendored), text);
    writeFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), lock);
    // The dangling relation fails validation before the include is resolved.
    const umbrella = diagram('umbrella', {
      nodes: [{ id: 'svc', name: 'Svc', include: url }],
      relations: [{ id: 'r', from: 'svc', to: 'ghost', kind: 'uses' }],
    });
    writeFileSync(path.join(dir, '.diagrams', 'src', 'umbrella.diagram.json'), JSON.stringify(umbrella));
    const r = run(['publish', '--update-includes', '--no-images'], dir);
    expect(r.stdout).toContain('✓ gallery'); // past the viewer shell check
    expect(r.stderr).toContain('umbrella.diagram.json');
    expect(readFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), 'utf8')).toBe(lock);
    expect(existsSync(path.join(dir, '.diagrams', vendored))).toBe(true);
  }, 60_000);

  it("exits 1 when a source does not compile, after publishing the rest, with compile's failure line", () => {
    const dir = fresh(true);
    const src = path.join(dir, '.diagrams', 'src');
    writeFileSync(path.join(src, 'good.diagram.json'), JSON.stringify(diagram('good')));
    const broken = diagram('broken', { relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'uses' }] });
    writeFileSync(path.join(src, 'broken.diagram.json'), JSON.stringify(broken));
    const r = run(['publish', '--no-images'], dir);
    expect(r.status).toBe(1);
    expect(existsSync(path.join(dir, '.diagrams', 'html', 'good.html'))).toBe(true);
    expect(r.stderr).toMatch(/^✗ .*broken\.diagram\.json\n[^]*\n\(keeping last good artifact\)$/m);
  }, 60_000);

  it('exits 1 when it skips a diagram', () => {
    const dir = fresh(true);
    const src = path.join(dir, '.diagrams', 'src');
    writeFileSync(path.join(src, 'good.diagram.json'), JSON.stringify(diagram('good')));
    writeFileSync(path.join(src, 'good.layout.json'), '{');
    const r = run(['publish', '--no-images'], dir);
    expect(r.stderr).toContain('skipping diagram "good"');
    expect(r.status).toBe(1);
  }, 60_000);

  it('takes a diagram as a path, as eject does, and refuses a name that is no diagram', () => {
    const dir = fresh(true);
    writeFileSync(path.join(dir, '.diagrams', 'src', 'shop.diagram.json'), JSON.stringify(diagram('shop')));
    const r = run(['publish', '.diagrams/src/shop.diagram.json', '--no-images'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✓ 1 page(s)');
    expect(existsSync(path.join(dir, '.diagrams', 'html', 'shop.html'))).toBe(true);

    const nope = run(['publish', 'nope', '--no-images'], dir);
    expect(nope.status).toBe(1);
    expect(nope.stderr).toContain("diagc: no diagram 'nope'");
  }, 60_000);

  // Chrome at a default location is found whatever CHROME_PATH says.
  it.skipIf(findChrome() !== undefined)(
    'says on stderr that it found no Chrome',
    () => {
      const dir = fresh(true);
      writeFileSync(path.join(dir, '.diagrams', 'src', 'good.diagram.json'), JSON.stringify(diagram('good')));
      const r = run(['publish'], dir, { ...process.env, CHROME_PATH: path.join(dir, 'no-chrome') });
      expect(r.stderr).toContain('No Chrome found');
      expect(r.stdout).not.toContain('No Chrome found');
    },
    60_000,
  );
});

describe('output through a pipe', () => {
  it('reaches a reader that starts late, whole', async () => {
    const dir = fresh();
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
        {
          cwd: dir,
          stdio: 'pipe',
        },
      );
    git('init', '-q');
    writeFileSync(path.join(dir, 'README.md'), 'no diagrams yet\n');
    git('add', '-A');
    git('commit', '-qm', 'empty');
    // About a megabyte of --json: far more than the pipe holds while nobody reads it.
    const nodes = Array.from({ length: 3000 }, (_, i) => ({
      id: `n${i}`,
      name: `Node ${i}`,
      type: 'service',
      description: 'x'.repeat(300),
    }));
    mkdirSync(path.join(dir, '.diagrams', 'src'), { recursive: true });
    writeFileSync(path.join(dir, '.diagrams', 'src', 'big.diagram.json'), JSON.stringify(diagram('big', { nodes })));

    const child = spawn(process.execPath, [bin, 'diff', 'HEAD', '--json', '--no-images'], { cwd: dir });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    // Nothing is read until the CLI has printed its last line on stderr, or exited.
    child.stdout.pause();
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (/✓ for an ADR|viewer shell not available/.test(stderr)) child.stdout.resume();
    });
    child.on('exit', () => child.stdout.resume());
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));

    const out = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      diagrams: { name: string; diff: { nodes: { added: unknown[] } } }[];
    };
    expect(out.diagrams.map((d) => d.name)).toEqual(['big']);
    expect(out.diagrams[0]!.diff.nodes.added).toHaveLength(3000);
    expect(code).toBe(0);
  }, 60_000);

  it('stops quietly when the reader closes the pipe early, as head does', async () => {
    const dir = fresh(true);
    // a picture far bigger than the 64 kB a pipe holds: a long chain of wide boxes
    const nodes = Array.from({ length: 600 }, (_, i) => ({ id: `n${i}`, name: `Node number ${i} `.repeat(4) }));
    const relations = nodes.slice(1).map((n, i) => ({ id: `r${i}`, from: `n${i}`, to: n.id, kind: 'sync' }));
    writeFileSync(
      path.join(dir, '.diagrams', 'src', 'big.diagram.json'),
      JSON.stringify(diagram('big', { nodes, relations })),
    );
    const child = spawn(process.execPath, [bin, 'show', 'big'], { cwd: dir });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => void (stderr += d.toString()));
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect(stderr).toBe('');
    expect(code).toBe(0);
  }, 60_000);

  it('does not wait for an open handle to close before exiting', () => {
    const dir = fresh(true);
    // A source that leaves a timer running in the CLI's own process.
    writeFileSync(
      path.join(dir, '.diagrams', 'src', 'x.diagram.ts'),
      `setInterval(() => {}, 1000);\nexport default ${JSON.stringify(diagram('x'))};\n`,
    );
    const r = spawnSync(process.execPath, [bin, 'compile'], { encoding: 'utf8', cwd: dir, timeout: 20_000 });
    expect(r.signal).toBeNull();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✓');
  }, 30_000);
});

describe('diagc diff, through the real CLI', () => {
  it('takes a diagram as a file name, and refuses a name that is no diagram', () => {
    const dir = fresh(true);
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
        {
          cwd: dir,
          stdio: 'pipe',
        },
      );
    const shop = path.join(dir, '.diagrams', 'src', 'shop.diagram.json');
    writeFileSync(shop, JSON.stringify(diagram('shop')));
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'shop');
    writeFileSync(shop, JSON.stringify(diagram('shop', { nodes: [{ id: 'a', name: 'Renamed', type: 'service' }] })));

    const r = run(['diff', 'HEAD', 'shop.diagram.json', '--json', '--no-images'], dir);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { diagrams: { name: string; status: string }[] };
    expect(out.diagrams).toEqual([expect.objectContaining({ name: 'shop', status: 'changed' })]);

    const nope = run(['diff', 'HEAD', 'nope', '--json', '--no-images'], dir);
    expect(nope.status).toBe(1);
    expect(nope.stderr).toContain("diagc: no diagram 'nope'");
    expect(nope.stdout).toBe('');
  }, 60_000);

  it('prints each status in --json with its own keys, in order', () => {
    const dir = fresh(true);
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
        {
          cwd: dir,
          stdio: 'pipe',
        },
      );
    const source = (name: string) => path.join(dir, '.diagrams', 'src', `${name}.diagram.json`);
    for (const name of ['broken', 'gone', 'same', 'shop']) writeFileSync(source(name), JSON.stringify(diagram(name)));
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'v1');
    writeFileSync(source('broken'), '{');
    rmSync(source('gone'));
    writeFileSync(source('fresh'), JSON.stringify(diagram('fresh')));
    writeFileSync(
      source('shop'),
      JSON.stringify(diagram('shop', { nodes: [{ id: 'a', name: 'B', type: 'service' }] })),
    );

    const r = run(['diff', 'HEAD', '--json', '--no-images'], dir);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { diagrams: { name: string; status: string }[] };
    expect(r.stdout).toBe(`${JSON.stringify(out, null, 2)}\n`);
    expect(Object.keys(out)).toEqual(['from', 'to', 'diagrams']);
    expect(out.diagrams.map((d) => [d.name, d.status, Object.keys(d)])).toEqual([
      ['broken', 'error', ['name', 'status', 'error']],
      ['fresh', 'added', ['name', 'status', 'diff']],
      ['gone', 'removed', ['name', 'status', 'diff']],
      ['same', 'unchanged', ['name', 'status', 'diff']],
      ['shop', 'changed', ['name', 'status', 'diff']],
    ]);
  }, 60_000);

  it('compares a diagram whose layout does not parse, and says so on stderr', () => {
    const dir = fresh(true);
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
        {
          cwd: dir,
          stdio: 'pipe',
        },
      );
    const shop = path.join(dir, '.diagrams', 'src', 'shop.diagram.json');
    writeFileSync(shop, JSON.stringify(diagram('shop')));
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'shop');
    writeFileSync(shop, JSON.stringify(diagram('shop', { nodes: [{ id: 'a', name: 'Renamed', type: 'service' }] })));
    writeFileSync(path.join(dir, '.diagrams', 'src', 'shop.layout.json'), '{');

    const r = run(['diff', 'HEAD', '--json', '--no-images'], dir);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { diagrams: { name: string; status: string }[] };
    expect(out.diagrams).toEqual([expect.objectContaining({ name: 'shop', status: 'changed' })]);
    expect(r.stderr).toMatch(
      /^shop\.layout\.json at working tree: does not parse \(.+\) — compared and drawn without it$/m,
    );
  }, 60_000);
});

/** `git` in `dir`, with an identity and no signing, so a commit works anywhere. */
function gitIn(dir: string): (...args: string[]) => void {
  return (...args) => {
    execFileSync(
      'git',
      ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: dir,
        stdio: 'pipe',
      },
    );
  };
}

/** Each source under `dir/.diagrams/src`, by name. */
function sources(dir: string, models: Record<string, Record<string, unknown>>): void {
  for (const [name, model] of Object.entries(models)) {
    const file = path.join(dir, '.diagrams', 'src', `${name}.diagram.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(model));
  }
}

const DANGLING = { relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'uses' }] };
const MISTYPED = { nodes: [{ id: 'a', name: 'A', type: 'servise' }] };

describe('the usage, and which mistake is reported first', () => {
  /** The usage text, as `--help` prints it: console.log adds the newline after it. */
  let usage = '';
  beforeAll(() => {
    const r = run(['--help'], fresh());
    expect([r.status, r.stderr]).toEqual([0, '']);
    usage = r.stdout.slice(0, -1);
  }, 30_000);

  it('prints the usage on stdout and exits 0 for --help or -h anywhere before a mistake', () => {
    expect(usage).toMatch(
      /^Usage: diagc <init\|compile\|lint\|watch\|publish\|show\|studio\|tui\|eject\|diff\|guide> /,
    );
    expect(usage.endsWith('\n  --help, -h      Show this help and exit\n')).toBe(true);
    const dir = fresh();
    const helps = [
      ['-h'],
      ['compile', '--help'],
      ['lint', 'a.diagram.ts', '--json', '-h'],
      ['frob', '--help'],
      ['--help', '--bogus'],
      ['--json', '--help'],
      ['studio', 'x', 'y', '-h'],
      ['init', '--agents', '--help'],
    ];
    for (const argv of helps) {
      const r = run(argv, dir);
      expect([argv, r.status, r.stdout, r.stderr]).toEqual([argv, 0, `${usage}\n`, '']);
    }
    expect(readdirSync(dir)).toEqual([]);
  }, 60_000);

  it("refuses a flag as argv reads, then one the command does not take in the flag table's order, then an argument too many", () => {
    const out = '--out: needs a directory, e.g. --out build/artifacts';
    const type = "--type: needs a diagram type, e.g. --type c4 ('diagc guide' lists them)";
    const labels = '--labels: takes two names, before and after: --labels main,#12';
    const imageUrl = '--image-url: needs a {path} placeholder, e.g. https://host/pr-1/{path}';
    const locked = '(it always resolves includes locked); compile and publish do.';
    const outTakers = 'compile, watch, publish, eject and diff do.';
    const refused: [string[], string][] = [
      [['compile', '--frobnicate'], "Unknown flag '--frobnicate'"],
      [['--bogus', '--help'], "Unknown flag '--bogus'"],
      [['eject', '--bogus', '--update-includes'], "Unknown flag '--bogus'"],
      [['eject', '--update-includes', '--bogus'], "Unknown flag '--bogus'"],
      [['frob', '--bogus'], "Unknown flag '--bogus'"],
      [['compile', '--out'], out],
      [['compile', '--out', '--json'], out],
      [['--out', '--help'], out],
      [['init', '--type'], type],
      [['init', '--type', '--agents'], type],
      [['init', '--out', 'x', '--type'], type],
      [['publish', '--link', 'ftp://example.com'], "--link: link must be an http(s) URL, got 'ftp://example.com'"],
      [['publish', '--link'], "--link: link must be an http(s) URL, got ''"],
      [['publish', '--link', '--no-images'], "--link: link must be an http(s) URL, got '--no-images'"],
      [['init', '--link', 'nope'], "--link: link must be an http(s) URL, got 'nope'"],
      [['diff', 'a', '--labels', 'a'], labels],
      [['diff', 'a', '--labels', 'a,'], labels],
      [['diff', '--labels', 'a', '--json'], labels],
      [['diff', 'a', '--labels', '--help'], labels],
      [['diff', 'a', '--image-url', 'https://x/'], imageUrl],
      [['diff', 'a', '--image-url'], imageUrl],
      [['--json'], 'compile does not take --json; lint and diff do.'],
      [['compile', '--no-images'], 'compile does not take --no-images; publish and diff do.'],
      [['compile', '--link', 'https://x.test'], 'compile does not take --link; publish does.'],
      [['compile', '--agents'], 'compile does not take --agents; init does.'],
      [['lint', '--type', 'c4', '--out', 'x'], `lint does not take --out; ${outTakers}`],
      [['lint', '--image-url', 'https://x/{path}'], 'lint does not take --image-url; diff does.'],
      [['publish', '--labels', 'a,b'], 'publish does not take --labels; diff does.'],
      [['diff', 'v1', '--type', 'c4'], 'diff does not take --type; init does.'],
      [['guide', '--agents', '--json'], 'guide does not take --json; lint and diff do.'],
      [['guide', 'a', 'b', '--json'], 'guide does not take --json; lint and diff do.'],
      [['init', 'a', 'b', '--out', 'x'], `init does not take --out; ${outTakers}`],
      [['watch', '--update-includes'], `watch does not take --update-includes ${locked}`],
      [['studio', '--update-includes'], `studio does not take --update-includes ${locked}`],
      [['eject', 'a', 'b', '--update-includes'], `eject does not take --update-includes ${locked}`],
      [['studio', 'x', '--out', 'o'], `studio does not take --out; ${outTakers}`],
      [['studio', 'x'], "studio takes no arguments; 'x' is one too many."],
      [['watch', 'a', 'b', '--out', 'o'], "watch takes one directory; 'b' is one too many."],
      [['eject', 'a', 'b'], "eject takes one diagram name; 'b' is one too many."],
    ];
    const dir = fresh();
    for (const [argv, message] of refused) {
      const r = run(argv, dir);
      expect([argv, r.status, r.stdout, r.stderr]).toEqual([argv, 1, '', `diagc: ${message}\n\n${usage}\n`]);
    }
    expect(readdirSync(dir)).toEqual([]);
  }, 120_000);

  it('leaves an unknown command to the dispatch, and a missing or extra argument to the command', () => {
    const withUsage = (line: string) => `${line}\n${usage}\n`;
    const answers: [string[], string][] = [
      [['frob'], withUsage("diagc: Unknown command 'frob'.")],
      [['frob', '--json', 'a', 'b'], withUsage("diagc: Unknown command 'frob'.")],
      [['-x'], withUsage("diagc: Unknown command '-x'.")],
      [['--out', 'o', 'frob'], withUsage("diagc: Unknown command 'frob'.")],
      [['eject'], withUsage('diagc: eject needs a diagram name.')],
      [['eject', '--out', 'o'], withUsage('diagc: eject needs a diagram name.')],
      [['eject', '.diagrams/src/'], withUsage('diagc: eject needs a diagram name.')],
      [['diff'], withUsage('diagc: diff needs a git ref (diff v1.0) or a range (diff v1.0..v2.0).')],
      [
        ['diff', '--json', '--no-images'],
        withUsage('diagc: diff needs a git ref (diff v1.0) or a range (diff v1.0..v2.0).'),
      ],
      [['init', 'a', 'b'], 'diagc: init takes one name, got 2 — e.g. diagc init shop --type c4\n'],
      [['guide', 'a', 'b'], "diagc: guide takes one topic, got 2 — run it once per topic, or 'diagc guide all'.\n"],
    ];
    const dir = fresh();
    for (const [argv, stderr] of answers) {
      const r = run(argv, dir);
      expect([argv, r.status, r.stdout, r.stderr]).toEqual([argv, 1, '', stderr]);
    }
    expect(readdirSync(dir)).toEqual([]);
  }, 60_000);
});

describe('what each command prints where, through the real CLI', () => {
  it('compile: each artifact on stdout; each warning and failure on stderr, in path order; exit 1 on a failure', () => {
    const dir = fresh();
    sources(dir, { a: diagram('a'), b: diagram('b', MISTYPED), c: diagram('c', DANGLING) });
    const r = run(['compile'], dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe(
      '✓ .diagrams/src/a.diagram.json -> .diagrams/.artifacts/a.diagram.json\n' +
        '✓ .diagrams/src/b.diagram.json -> .diagrams/.artifacts/b.diagram.json\n',
    );
    expect(r.stderr).toBe(
      ".diagrams/src/b.diagram.json: 'a' has type 'servise', which draws as a plain box (did you mean 'service'?)\n" +
        '✗ .diagrams/src/c.diagram.json\n' +
        "Invalid diagram model:\n  - Relation 'r' references unknown node 'ghost'\n(keeping last good artifact)\n",
    );
  }, 30_000);

  it('compile: the named files only, into --out', () => {
    const dir = fresh();
    sources(dir, { a: diagram('a'), c: diagram('c', DANGLING) });
    const r = run(['compile', '.diagrams/src/a.diagram.json', '--out', 'build'], dir);
    expect([r.status, r.stdout, r.stderr]).toEqual([0, '✓ .diagrams/src/a.diagram.json -> build/a.diagram.json\n', '']);
    expect(readdirSync(dir).sort()).toEqual(['.diagrams', 'build']);
  }, 30_000);

  it('compile: what composing includes warns about, on stderr after the file', () => {
    const dir = fresh();
    const part = (id: string, type: string) =>
      diagram(id, { nodes: [{ id: 'db', name: 'DB', type, key: 'shared-db' }] });
    sources(dir, {
      'parts/a': part('a', 'database'),
      'parts/b': part('b', 'queue'),
      u: diagram('u', {
        nodes: [
          { id: 'a', name: 'A', type: 'system', include: './parts/a.diagram.json' },
          { id: 'b', name: 'B', type: 'system', include: './parts/b.diagram.json' },
        ],
      }),
    });
    const r = run(['compile', '.diagrams/src/u.diagram.json'], dir);
    expect([r.status, r.stdout, r.stderr]).toEqual([
      0,
      '✓ .diagrams/src/u.diagram.json -> .diagrams/.artifacts/u.diagram.json\n',
      ".diagrams/src/u.diagram.json: Key 'shared-db': type 'queue' (node 'b/db') differs from type 'database' (node 'a/db') — using type 'database'\n",
    ]);
  }, 30_000);

  it('--update-includes prunes the lock only after every source of the whole tree compiled', () => {
    const lock = `${JSON.stringify(
      {
        version: 1,
        includes: {
          'https://example.com/old.diagram.json': { file: 'includes/old-00000000.diagram.json', sha256: '0' },
        },
      },
      null,
      2,
    )}\n`;
    const setUp = (models: Record<string, Record<string, unknown>>): string => {
      const dir = fresh();
      sources(dir, models);
      mkdirSync(path.join(dir, '.diagrams', 'includes'));
      writeFileSync(path.join(dir, '.diagrams', 'includes', 'old-00000000.diagram.json'), '{}\n');
      writeFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), lock);
      return dir;
    };
    const kept = (dir: string) => [
      readFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), 'utf8'),
      readdirSync(path.join(dir, '.diagrams', 'includes')),
    ];

    const named = setUp({ a: diagram('a') });
    expect(run(['compile', '--update-includes', '.diagrams/src/a.diagram.json'], named).status).toBe(0);
    expect(kept(named)).toEqual([lock, ['old-00000000.diagram.json']]);

    const failing = setUp({ a: diagram('a'), c: diagram('c', DANGLING) });
    expect(run(['compile', '--update-includes'], failing).status).toBe(1);
    expect(kept(failing)).toEqual([lock, ['old-00000000.diagram.json']]);

    const whole = setUp({ a: diagram('a') });
    expect(run(['compile', '--update-includes'], whole).status).toBe(0);
    const pruned = [`${JSON.stringify({ version: 1, includes: {} }, null, 2)}\n`, []];
    expect(kept(whole)).toEqual(pruned);

    // publish compiles the whole tree whatever names it is given, so a scoped run prunes too
    const scoped = setUp({ a: diagram('a'), b: diagram('b') });
    expect(run(['publish', '--update-includes', '--no-images', 'a'], scoped).status).toBe(0);
    expect(kept(scoped)).toEqual(pruned);
  }, 60_000);

  it('lint: one line per finding on stdout, exit 1', () => {
    const dir = fresh();
    sources(dir, { a: diagram('a'), b: diagram('b', MISTYPED) });
    const r = run(['lint'], dir);
    expect([r.status, r.stdout, r.stderr]).toEqual([
      1,
      ".diagrams/src/b.diagram.json: warning unknown-type: 'a' has type 'servise', which draws as a plain box (did you mean 'service'?)\n",
      '',
    ]);
    expect(run(['lint', '.diagrams/src/a.diagram.json'], dir)).toEqual({ status: 0, stdout: '', stderr: '' });
  }, 30_000);

  it("publish --no-images: the pages on stdout, each of publish's warnings on stderr", () => {
    const dir = fresh();
    sources(dir, {
      a: diagram('a', { nodes: [{ id: 'a', name: 'A', type: 'service', image: 'deadbeef.png' }] }),
      c: diagram('c'),
      d: diagram('d'),
    });
    writeFileSync(path.join(dir, '.diagrams', 'src', 'c.drawings.json'), '{"strokes":"none"}');
    writeFileSync(path.join(dir, '.diagrams', 'src', 'd.layout.json'), '{');
    // An artifact with no source is published as it is: compile never sees its ref.
    mkdirSync(path.join(dir, '.diagrams', '.artifacts'), { recursive: true });
    const stale = diagram('b', { nodes: [{ id: 'a', name: 'A', type: 'service', image: '/library/../../x.svg' }] });
    writeFileSync(path.join(dir, '.diagrams', '.artifacts', 'b.diagram.json'), JSON.stringify(stale));
    const r = run(['publish', '--no-images'], dir);
    const assets = path.join(realpathSync(dir), '.diagrams', 'src', 'assets');
    expect([r.status, r.stdout, r.stderr]).toEqual([
      1,
      '✓ 3 page(s) -> .diagrams/html\n✓ gallery -> .diagrams/html/index.html\n',
      `publish: could not read asset "deadbeef.png" for diagram "a" (looked in ${assets}/deadbeef.png); leaving ref as-is.\n` +
        'publish: refusing out-of-root asset "/library/../../x.svg" for diagram "b"; leaving ref as-is.\n' +
        'publish: ignoring malformed drawings sidecar for diagram "c" (.diagrams/src/c.drawings.json); the page ships without ink.\n' +
        `publish: skipping diagram "d": Expected property name or '}' in JSON at position 1 (line 1 column 2)\n`,
    ]);
  }, 60_000);

  it('publish --no-images: exit 0, and nothing on stderr, when every diagram is published', () => {
    const dir = fresh();
    sources(dir, { a: diagram('a'), 'team/b': diagram('b') });
    const r = run(['publish', '--no-images', '--out', 'build'], dir);
    expect([r.status, r.stdout, r.stderr]).toEqual([
      0,
      '✓ 2 page(s) -> .diagrams/html\n✓ gallery -> .diagrams/html/index.html\n',
      '',
    ]);
    expect(existsSync(path.join(dir, 'build', 'team', 'b.diagram.json'))).toBe(true);
    expect(existsSync(path.join(dir, '.diagrams', 'html', 'team', 'b.html'))).toBe(true);
  }, 60_000);

  it('eject: the TypeScript source on stdout, or why not on stderr', () => {
    const dir = fresh();
    sources(dir, { shop: diagram('shop') });
    expect(run(['eject', 'shop', '--out', 'build'], dir)).toEqual({
      status: 0,
      stdout: '✓ .diagrams/src/shop.diagram.ts\n',
      stderr: '',
    });
    expect(existsSync(path.join(dir, 'build', 'shop.diagram.json'))).toBe(true);
    expect(run(['eject', 'nope'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr: "no diagram 'nope' (.diagrams/src/nope.diagram.json)\n",
    });
    expect(run(['eject', '.diagrams/src/shop.diagram.ts'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr: "'shop' is already TypeScript-owned (.diagrams/src/shop.diagram.ts)\n",
    });
  }, 60_000);

  it("diff: the change list on stdout, the pages it wrote on stderr; git's and the range's errors on stderr", () => {
    const dir = fresh();
    sources(dir, { gone: diagram('gone'), shop: diagram('shop'), same: diagram('same') });
    const git = gitIn(dir);
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'v1');
    rmSync(path.join(dir, '.diagrams', 'src', 'gone.diagram.json'));
    sources(dir, { shop: diagram('shop', { nodes: [{ id: 'a', name: 'B', type: 'service' }] }) });

    const r = run(['diff', 'HEAD', '--no-images', '--labels', 'before,after'], dir);
    expect([r.status, r.stdout, r.stderr]).toEqual([
      0,
      'diagc diff before -> after\ngone:\n  - diagram removed: gone\nshop:\n  ~ A -> B (renamed)\n2 diagram(s) changed, 1 unchanged\n',
      '✓ 3 page(s) -> .diagrams/diff/HEAD..working-tree\n' +
        '✓ side by side -> .diagrams/diff/HEAD..working-tree/index.html\n' +
        '✓ for an ADR -> .diagrams/diff/HEAD..working-tree/summary.md\n',
    ]);
    expect(readdirSync(path.join(dir, '.diagrams', 'diff', 'HEAD..working-tree')).sort()).toEqual([
      'gone.before.html',
      'index.html',
      'shop.after.html',
      'shop.before.html',
      'summary.md',
    ]);

    const errors: [string[], string][] = [
      [
        ['diff', 'HEAD..'],
        "diagc: 'HEAD..' is not a range: write <from>..<to>, or one ref to compare with the working tree\n",
      ],
      [['diff', 'nope'], "diagc: 'nope' is not a commit, tag or branch in this repository\n"],
      [['diff', 'HEAD', 'nope', 'shop'], "diagc: no diagram 'nope'\n"],
    ];
    for (const [argv, stderr] of errors)
      expect([argv, run(argv, dir)]).toEqual([argv, { status: 1, stdout: '', stderr }]);
    const nowhere = fresh();
    expect(run(['diff', 'HEAD'], nowhere)).toEqual({
      status: 1,
      stdout: '',
      stderr: `diagc: not a git repository (or any parent): ${realpathSync(nowhere)}\n`,
    });
  }, 60_000);

  it('diff: nothing changed is a line on stdout, exit 0, and no pages', () => {
    const dir = fresh();
    sources(dir, { shop: diagram('shop') });
    const git = gitIn(dir);
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'v1');
    expect(run(['diff', 'HEAD'], dir)).toEqual({
      status: 0,
      stdout: 'diagc diff HEAD -> working tree\nno diagram changed (1 compared)\n',
      stderr: '',
    });
    expect(existsSync(path.join(dir, '.diagrams', 'diff'))).toBe(false);
  }, 60_000);

  // Chrome at a default location is found whatever CHROME_PATH says.
  it.skipIf(findChrome() !== undefined)(
    'diff: says on stderr, before the pages, that it found no Chrome',
    () => {
      const dir = fresh();
      sources(dir, { shop: diagram('shop') });
      const git = gitIn(dir);
      git('init', '-q');
      git('add', '-A');
      git('commit', '-qm', 'v1');
      sources(dir, { shop: diagram('shop', { nodes: [{ id: 'a', name: 'B', type: 'service' }] }) });
      const r = run(['diff', 'HEAD', '--out', 'review'], dir, {
        ...process.env,
        CHROME_PATH: path.join(dir, 'no-chrome'),
      });
      expect([r.status, r.stderr]).toEqual([
        0,
        'No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.\n' +
          '✓ 2 page(s) -> review\n✓ side by side -> review/index.html\n✓ for an ADR -> review/summary.md\n',
      ]);
    },
    60_000,
  );

  it('guide: the page on stdout; an unknown topic on stderr', () => {
    const dir = fresh();
    const r = run(['guide'], dir);
    expect([r.status, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toMatch(/^# Writing diagc diagrams\n[^]*[^\n]\n$/);
    const c4 = run(['guide', 'c4'], dir);
    expect([c4.status, c4.stderr]).toEqual([0, '']);
    expect(c4.stdout).not.toBe(r.stdout);
    expect(run(['guide', 'nope'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr:
        "diagc: No guide topic 'nope'. Topics: all, activity, c4, causal-loop, deployment, er, fishbone, git-graph, plan, second-order, threat-model\n",
    });
    expect(readdirSync(dir)).toEqual([]);
  }, 30_000);
});
