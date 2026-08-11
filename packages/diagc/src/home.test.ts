import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findHome, homePaths } from './home';

let tmp: string;
beforeEach(async () => { tmp = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'diagc-home-'))); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe('findHome', () => {
  it('walks up to the dir holding pnpm-workspace.yaml', async () => {
    await writeFile(path.join(tmp, 'pnpm-workspace.yaml'), 'packages:\n');
    const deep = path.join(tmp, 'packages', 'diagc', 'src');
    await mkdir(deep, { recursive: true });
    const bin = path.join(deep, 'cli.ts');
    await writeFile(bin, '// entry');
    expect(findHome(bin)).toBe(tmp);
  });
  it('throws a re-link message when no marker is found', async () => {
    const bin = path.join(tmp, 'orphan.ts');
    await writeFile(bin, '// entry');
    expect(() => findHome(bin)).toThrow(/pnpm link --global/);
  });
});

describe('homePaths', () => {
  it('derives asset paths from the root', () => {
    const p = homePaths('/repo');
    expect(p.viewerShell).toBe(path.join('/repo', 'apps', 'viewer', 'dist', 'index.html'));
    expect(p.libraryDir).toBe(path.join('/repo', 'apps', 'studio', 'public', 'library'));
    expect(p.coreEntry).toBe(path.join('/repo', 'packages', 'core', 'src', 'index.ts'));
    expect(p.studioDir).toBe(path.join('/repo', 'apps', 'studio'));
  });
});
