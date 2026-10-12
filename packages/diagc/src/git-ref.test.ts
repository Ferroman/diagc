import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutDiagrams } from './git-ref';

describe('checkoutDiagrams', () => {
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
