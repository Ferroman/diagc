import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverDiagrams } from './discover';

describe('discoverDiagrams', () => {
  it('pairs each compiled artifact with its .layout.json from the src tree, keyed by relative name', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dg-'));
    const artifactsDir = path.join(root, 'artifacts');
    const srcDir = path.join(root, 'src');
    await mkdir(artifactsDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(artifactsDir, 'foo.diagram.json'), '{}');
    await writeFile(path.join(srcDir, 'foo.layout.json'), '{}');
    await writeFile(path.join(artifactsDir, 'bar.diagram.json'), '{}'); // no layout
    await mkdir(path.join(artifactsDir, 'team'), { recursive: true });
    await writeFile(path.join(artifactsDir, 'team', 'app.diagram.json'), '{}');
    await writeFile(path.join(srcDir, 'foo.drawings.json'), '{}');

    const found = (await discoverDiagrams(artifactsDir, srcDir)).sort((a, b) => a.name.localeCompare(b.name));

    expect(found.map((f) => f.name)).toEqual(['bar', 'foo', 'team/app']);
    expect(found.find((f) => f.name === 'foo')?.modelPath).toBe(path.join(artifactsDir, 'foo.diagram.json'));
    expect(found.find((f) => f.name === 'foo')?.layoutPath).toBe(path.join(srcDir, 'foo.layout.json'));
    expect(found.find((f) => f.name === 'bar')?.layoutPath).toBeUndefined();
    expect(found.find((f) => f.name === 'foo')?.drawingsPath).toBe(path.join(srcDir, 'foo.drawings.json'));
    expect(found.find((f) => f.name === 'bar')?.drawingsPath).toBeUndefined();
  });
});
