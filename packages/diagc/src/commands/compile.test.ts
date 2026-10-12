import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  argsOf,
  captureIo,
  contextFor,
  DANGLING,
  diagram,
  inTempDir,
  MISTYPED,
  writeSources,
} from '../../test-fixtures/cli';
import { compile } from './compile';

describe('compile', () => {
  it('prints each artifact on stdout, each warning and failure on stderr, in path order; exit 1 on a failure', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { a: diagram('a'), b: diagram('b', MISTYPED), c: diagram('c', DANGLING) });
      const io = captureIo();
      expect(await compile.run(argsOf(), contextFor(io))).toBe(1);
      expect(io.stdout).toBe(
        '✓ .diagrams/src/a.diagram.json -> .diagrams/.artifacts/a.diagram.json\n' +
          '✓ .diagrams/src/b.diagram.json -> .diagrams/.artifacts/b.diagram.json\n',
      );
      expect(io.stderr).toBe(
        ".diagrams/src/b.diagram.json: 'a' has type 'servise', which draws as a plain box (did you mean 'service'?)\n" +
          '✗ .diagrams/src/c.diagram.json\n' +
          "Invalid diagram model:\n  - Relation 'r' references unknown node 'ghost'\n(keeping last good artifact)\n",
      );
    });
  });

  it('compiles the files named, into --out', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { a: diagram('a'), c: diagram('c', DANGLING) });
      const io = captureIo();
      expect(await compile.run(argsOf(['.diagrams/src/a.diagram.json'], { '--out': 'build' }), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual(['✓ .diagrams/src/a.diagram.json -> build/a.diagram.json\n', '']);
      expect(existsSync(path.join(dir, '.diagrams', '.artifacts'))).toBe(false);
    });
  });

  it('says on stderr that there are no sources, and exits 0', async () => {
    await inTempDir(async () => {
      const io = captureIo();
      expect(await compile.run(argsOf(), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual([
        '',
        "No diagrams under .diagrams/src — run 'diagc init' to create one.\n",
      ]);
    });
  });

  it('with --update-includes, prunes the lock only after the whole tree compiled', async () => {
    const lock = `${JSON.stringify({ version: 1, includes: { 'https://example.com/x.diagram.json': { file: 'includes/x-0.diagram.json', sha256: '0' } } }, null, 2)}\n`;
    const run = async (models: Record<string, Record<string, unknown>>, files: string[]) =>
      inTempDir(async (dir) => {
        writeSources(dir, models);
        mkdirSync(path.join(dir, '.diagrams', 'includes'));
        writeFileSync(path.join(dir, '.diagrams', 'includes', 'x-0.diagram.json'), '{}\n');
        writeFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), lock);
        const ctx = contextFor(captureIo(), 'update');
        await compile.run(argsOf(files, { '--update-includes': true }), ctx);
        return [
          readFileSync(path.join(dir, '.diagrams', 'includes.lock.json'), 'utf8'),
          readdirSync(path.join(dir, '.diagrams', 'includes')),
        ];
      });
    expect(await run({ a: diagram('a') }, [])).toEqual([
      `${JSON.stringify({ version: 1, includes: {} }, null, 2)}\n`,
      [],
    ]);
    expect(await run({ a: diagram('a') }, ['.diagrams/src/a.diagram.json'])).toEqual([lock, ['x-0.diagram.json']]);
    expect(await run({ a: diagram('a'), c: diagram('c', DANGLING) }, [])).toEqual([lock, ['x-0.diagram.json']]);
  });
});
