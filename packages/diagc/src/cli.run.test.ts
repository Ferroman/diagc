import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { findHome } from './home';

// The real CLI through its development entry (tsx-registered, no build step),
// run from directories of its own: these tests are about what a user sees in a
// repository that is not this one.
const bin = path.join(findHome(fileURLToPath(import.meta.url)).root, 'bin', 'diagc.mjs');
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

export function run(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd });
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

  it('watch still accepts a single file instead of crashing on the source check', async () => {
    const dir = fresh(true);
    const model = { version: 1, id: 'x', name: 'X', nodes: [{ id: 'a', name: 'A', type: 'service' }], containment: [], relations: [], layers: [], planes: [] };
    writeFileSync(path.join(dir, '.diagrams', 'src', 'x.diagram.json'), JSON.stringify(model));
    const child = spawn(process.execPath, [bin, 'watch', '.diagrams/src/x.diagram.json'], { cwd: dir });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const stdout = await new Promise<string>((resolve) => {
      let buf = '';
      const timer = setTimeout(() => resolve(buf), 20_000);
      child.on('exit', () => { clearTimeout(timer); resolve(buf); });
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

  it('does not say so when there is a source', () => {
    const dir = fresh(true);
    const model = { version: 1, id: 'x', name: 'X', nodes: [{ id: 'a', name: 'A', type: 'service' }], containment: [], relations: [], layers: [], planes: [] };
    writeFileSync(path.join(dir, '.diagrams', 'src', 'x.diagram.json'), JSON.stringify(model));
    const r = run(['lint', '--json'], dir);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('[]\n');
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

  it('takes one name at most', () => {
    const r = run(['init', 'a', 'b'], fresh());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^diagc: init takes one name, got 2/);
  }, 30_000);

  it('lists init in --help', () => {
    const r = run(['--help'], fresh());
    expect(r.stdout).toMatch(/^ {2}init /m);
    expect(r.stdout).toMatch(/^ {2}--type <type>/m);
    expect(r.stdout).toMatch(/^ {2}--agents/m);
  }, 30_000);
});
