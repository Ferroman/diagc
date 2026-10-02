import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatLintReport, lintFile } from './lint';

const fixtures = path.resolve(import.meta.dirname, '../test-fixtures');

async function source(model: unknown): Promise<string> {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'diagc-lint-')), 'x.diagram.json');
  await writeFile(file, JSON.stringify(model));
  return file;
}

describe('lintFile', () => {
  it('has nothing to say about a clean diagram', async () => {
    expect(await lintFile(path.join(fixtures, 'sample.diagram.ts'))).toEqual([]);
  });

  it("reports a valid diagram's warnings", async () => {
    const file = await source({
      version: 1,
      id: 'x',
      name: 'X',
      nodes: [{ id: 'a', name: 'A', type: 'servise' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    });
    expect(await lintFile(file)).toEqual([
      {
        file,
        severity: 'warning',
        code: 'unknown-type',
        message: "'a' has type 'servise', which draws as a plain box (did you mean 'service'?)",
        ref: 'a',
      },
    ]);
  });

  it('reports the validation errors of a diagram that does not compile', async () => {
    const file = path.join(fixtures, 'broken.diagram.ts');
    const reports = await lintFile(file);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.severity === 'error' && r.file === file && r.code !== 'load')).toBe(true);
  });

  it('reports a source that is not a diagram at all', async () => {
    const [r] = await lintFile(path.join(fixtures, 'no-default.diagram.ts'));
    expect(r).toMatchObject({ severity: 'error', code: 'load' });
  });
});

describe('formatLintReport', () => {
  it('is one grep-able line', () => {
    expect(formatLintReport({ file: 'a.diagram.ts', severity: 'warning', code: 'unused-layer', message: "Layer 'x' has nothing on it" })).toBe(
      "a.diagram.ts: warning unused-layer: Layer 'x' has nothing on it",
    );
  });
});
