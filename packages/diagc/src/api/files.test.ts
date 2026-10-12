import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkDiagramJson, walkFiles } from './files';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'designer-pins-'));

describe('walkFiles', () => {
  it('collects files by suffix, posix-joined with the suffix stripped', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'walk-'));
    await mkdir(path.join(root, 'sub', 'deep'), { recursive: true });
    await writeFile(path.join(root, 'a.diagram.json'), '{}');
    await writeFile(path.join(root, 'sub', 'b.diagram.json'), '{}');
    await writeFile(path.join(root, 'sub', 'c.layout.json'), '{}');
    await writeFile(path.join(root, 'sub', 'deep', 'd.layout.json'), '{}');
    await writeFile(path.join(root, 'sub', 'b.layout.json'), '{}');
    await writeFile(path.join(root, 'sub', 'b.diagram.json.bak'), '{}'); // suffix mismatch
    expect((await walkFiles(root, '.diagram.json')).sort()).toEqual(['a', 'sub/b']);
    expect((await walkFiles(root, '.layout.json')).sort()).toEqual(['sub/b', 'sub/c', 'sub/deep/d']);
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] for a missing directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'walk-missing-'));
    expect(await walkFiles(path.join(root, 'nope'), '.json')).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('walkDiagramJson lists the JSON sources by name, folders included', async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, 'team'), { recursive: true });
    await writeFile(path.join(dir, 'a.diagram.json'), '{}');
    await writeFile(path.join(dir, 'b.diagram.ts'), '');
    await writeFile(path.join(dir, 'team', 'c.diagram.json'), '{}');
    expect((await walkDiagramJson(dir)).sort()).toEqual(['a', 'team/c']);
    expect(await walkDiagramJson(path.join(dir, 'nope'))).toEqual([]);
  });
});
