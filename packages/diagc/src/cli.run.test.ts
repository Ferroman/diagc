import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  it('does not say so when there is a source', () => {
    const dir = fresh(true);
    const model = { version: 1, id: 'x', name: 'X', nodes: [{ id: 'a', name: 'A', type: 'service' }], containment: [], relations: [], layers: [], planes: [] };
    writeFileSync(path.join(dir, '.diagrams', 'src', 'x.diagram.json'), JSON.stringify(model));
    const r = run(['lint', '--json'], dir);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('[]\n');
  }, 30_000);
});
