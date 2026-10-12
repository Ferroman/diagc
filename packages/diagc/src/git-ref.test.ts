import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkoutDiagrams } from './git-ref';
import { diffRepo, v1, type DiffRepo } from '../test-fixtures/diff';

let repo: DiffRepo;
beforeAll(() => {
  repo = diffRepo();
});
afterEach(() => repo.cleanup());

describe('checkoutDiagrams', () => {
  it("extracts the ref's .diagrams tree and removes it on cleanup", async () => {
    const c = await checkoutDiagrams('v1', repo.dir);
    expect(JSON.parse(readFileSync(path.join(c.diagramsDir, 'src/shop.diagram.json'), 'utf8'))).toEqual(v1);
    expect(existsSync(path.join(c.diagramsDir, 'src/new'))).toBe(false);
    await c.cleanup();
    expect(existsSync(c.diagramsDir)).toBe(false);
  });

  it('finds .diagrams relative to a subdirectory of the repository', async () => {
    const sub = path.join(repo.dir, 'pkg');
    mkdirSync(sub, { recursive: true });
    const c = await checkoutDiagrams('v1', sub, '../.diagrams');
    try {
      expect(existsSync(path.join(c.diagramsDir, 'src/shop.diagram.json'))).toBe(true);
    } finally {
      await c.cleanup();
    }
  });

  it('refuses a .diagrams above the repository, by the path it was given', async () => {
    await expect(checkoutDiagrams('v1', repo.dir, '../.diagrams')).rejects.toThrow(
      '../.diagrams is outside the repository',
    );
  });

  it('gives an empty set for a ref from before there were diagrams', async () => {
    const set = await repo.setAt('v0');
    expect(set.versions.size).toBe(0);
  });

  it('refuses a ref that does not exist', async () => {
    await expect(checkoutDiagrams('v9', repo.dir)).rejects.toThrow("'v9' is not a commit, tag or branch");
  });

  it('says so outside a git repository, rather than blaming the ref', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'diagc-no-git-'));
    await expect(checkoutDiagrams('HEAD', dir)).rejects.toThrow(`not a git repository (or any parent): ${dir}`);
  });

  it("passes on git's own reason when git cannot use the repository for another one", async () => {
    // A bare repository here; "detected dubious ownership" (a checkout mounted into a
    // container) fails the same call the same way.
    const dir = mkdtempSync(path.join(tmpdir(), 'diagc-bare-'));
    execFileSync('git', ['init', '--bare', '--quiet'], { cwd: dir });
    const failure = checkoutDiagrams('HEAD', dir);
    await expect(failure).rejects.toThrow(/must be run in a work tree/);
    await expect(failure).rejects.not.toThrow(/not a git repository/);
  });
});
