import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findHome, homePaths, resolveCoreEntry } from './home';

let tmp: string;
beforeEach(async () => { tmp = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'diagc-home-'))); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

/** Lay down the packaged marker (staged viewer shell + a package.json). */
async function packageAt(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'assets', 'viewer'), { recursive: true });
  await writeFile(path.join(dir, 'assets', 'viewer', 'index.html'), '<!doctype html>');
  await writeFile(path.join(dir, 'package.json'), '{"name":"diagc"}');
}

describe('findHome', () => {
  it('walks up to the dir holding pnpm-workspace.yaml', async () => {
    await writeFile(path.join(tmp, 'pnpm-workspace.yaml'), 'packages:\n');
    const deep = path.join(tmp, 'packages', 'diagc', 'src');
    await mkdir(deep, { recursive: true });
    const bin = path.join(deep, 'cli.ts');
    await writeFile(bin, '// entry');
    expect(findHome(bin)).toEqual({ root: tmp, layout: 'monorepo' });
  });

  it('finds a packaged install from its staged assets', async () => {
    const pkg = path.join(tmp, 'node_modules', 'diagc');
    await mkdir(path.join(pkg, 'dist'), { recursive: true });
    await packageAt(pkg);
    const bin = path.join(pkg, 'dist', 'cli.js');
    await writeFile(bin, '// entry');
    expect(findHome(bin)).toEqual({ root: pkg, layout: 'packaged' });
  });

  it('prefers a workspace above over staged assets below it', async () => {
    // A release build stages assets into packages/diagc/assets. Depth-first
    // that marker is closer than the workspace file, and picking it would put a
    // development checkout into packaged mode.
    await writeFile(path.join(tmp, 'pnpm-workspace.yaml'), 'packages:\n');
    const pkg = path.join(tmp, 'packages', 'diagc');
    await mkdir(path.join(pkg, 'src'), { recursive: true });
    await packageAt(pkg);
    const bin = path.join(pkg, 'src', 'cli.ts');
    await writeFile(bin, '// entry');
    expect(findHome(bin)).toEqual({ root: tmp, layout: 'monorepo' });
  });

  it('throws a reinstall/re-link message when no marker is found', async () => {
    const bin = path.join(tmp, 'orphan.ts');
    await writeFile(bin, '// entry');
    expect(() => findHome(bin)).toThrow(/pnpm link --global/);
  });
});

describe('homePaths', () => {
  it('derives monorepo asset paths from the root', () => {
    const p = homePaths({ root: '/repo', layout: 'monorepo' });
    expect(p.viewerShell).toBe(path.join('/repo', 'apps', 'viewer', 'dist', 'index.html'));
    expect(p.libraryDir).toBe(path.join('/repo', 'apps', 'studio', 'public', 'library'));
    expect(p.coreEntry).toBe(path.join('/repo', 'packages', 'core', 'src', 'index.ts'));
    expect(p.studioDir).toBe(path.join('/repo', 'apps', 'studio'));
  });

  it('derives packaged asset paths from the package root', () => {
    const p = homePaths({ root: '/pkg', layout: 'packaged' }, () => '/pkg/node_modules/@diagramming/core/dist/index.js');
    expect(p.viewerShell).toBe(path.join('/pkg', 'assets', 'viewer', 'index.html'));
    expect(p.studioDir).toBe(path.join('/pkg', 'assets', 'studio'));
    // publish and the studio server read the one library copy the studio
    // bundle already carries.
    expect(p.libraryDir).toBe(path.join('/pkg', 'assets', 'studio', 'library'));
    expect(p.coreEntry).toBe('/pkg/node_modules/@diagramming/core/dist/index.js');
  });

  it('does not resolve core when running from a monorepo', () => {
    // The checkout's own source is the alias target there; calling the resolver
    // would make a dev run depend on core being installed as a package.
    const p = homePaths({ root: '/repo', layout: 'monorepo' }, () => {
      throw new Error('should not be called');
    });
    expect(p.coreEntry).toBe(path.join('/repo', 'packages', 'core', 'src', 'index.ts'));
  });
});

describe('resolveCoreEntry', () => {
  it('returns the resolved module path', () => {
    expect(resolveCoreEntry(() => '/somewhere/core/dist/index.js')).toBe('/somewhere/core/dist/index.js');
  });

  it('explains a broken install rather than surfacing MODULE_NOT_FOUND', () => {
    expect(() =>
      resolveCoreEntry(() => {
        throw new Error("Cannot find module '@diagramming/core'");
      }),
    ).toThrow(/reinstall it/);
  });
});
