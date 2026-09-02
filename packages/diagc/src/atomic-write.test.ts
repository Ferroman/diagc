import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic } from './atomic-write';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'diagc-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('creates a new file with the exact content', async () => {
    const target = path.join(dir, 'a.diagram.json');
    await writeFileAtomic(target, '{"version":1}\n');
    expect(await readFile(target, 'utf8')).toBe('{"version":1}\n');
  });

  it('replaces existing content in place', async () => {
    const target = path.join(dir, 'a.diagram.json');
    await writeFile(target, 'old');
    await writeFileAtomic(target, 'new');
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('writes Buffer data byte-for-byte', async () => {
    const target = path.join(dir, 'img.png');
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
    await writeFileAtomic(target, bytes);
    expect(await readFile(target)).toEqual(bytes);
  });

  it('leaves no temp files behind after a successful write', async () => {
    await writeFileAtomic(path.join(dir, 'a.json'), 'x');
    await writeFileAtomic(path.join(dir, 'a.json'), 'y');
    expect(await readdir(dir)).toEqual(['a.json']);
  });

  it('propagates the error and creates nothing when the directory is missing', async () => {
    const target = path.join(dir, 'nope', 'a.json');
    await expect(writeFileAtomic(target, 'x')).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});
