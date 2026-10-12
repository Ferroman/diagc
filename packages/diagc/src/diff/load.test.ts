import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDiagramSet } from './load';
import { put, v1 } from '../../test-fixtures/diff';

describe('loadDiagramSet', () => {
  it('compares a diagram whose sidecars cannot be read, without them, and names each', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'diagc-diff-set-'));
    put(dir, 'src/shop.diagram.json', v1);
    put(dir, 'src/shop.layout.json', '{');
    put(dir, 'src/shop.drawings.json', { version: 1 });
    const set = await loadDiagramSet('wip', dir);
    expect(set.errors.size).toBe(0);
    expect(set.versions.get('shop')).toEqual({ model: v1 });
    expect(set.warnings).toEqual([
      expect.stringMatching(/^shop\.layout\.json at wip: does not parse \(.+\) — compared and drawn without it$/),
      'shop.drawings.json at wip: not a drawings overlay — compared and drawn without it',
    ]);
  });
});
