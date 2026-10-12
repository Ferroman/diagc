import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSorted } from './glob';

describe('globSorted', () => {
  it('gives the sources in path order, a folder among the files', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'diagc-glob-'));
    mkdirSync(path.join(dir, 'a'));
    for (const rel of ['b.diagram.json', 'a/z.diagram.ts', 'c.diagram.json']) writeFileSync(path.join(dir, rel), '');
    expect(await globSorted('**/*.diagram.{ts,json}', { cwd: dir })).toEqual([
      'a/z.diagram.ts',
      'b.diagram.json',
      'c.diagram.json',
    ]);
  });
});
