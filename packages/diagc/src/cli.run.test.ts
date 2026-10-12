import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    child.kill();
    expect(stderr.trim()).toBe(NO_SOURCES);
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
