import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, diagram, inTempDir, MISTYPED, writeSources } from '../../test-fixtures/cli';
import { lint } from './lint';

describe('lint', () => {
  it('prints one line per finding on stdout, and exits 1 on any', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { a: diagram('a'), b: diagram('b', MISTYPED) });
      const io = captureIo();
      expect(await lint.run(argsOf(), contextFor(io))).toBe(1);
      expect([io.stdout, io.stderr]).toEqual([
        ".diagrams/src/b.diagram.json: warning unknown-type: 'a' has type 'servise', which draws as a plain box (did you mean 'service'?)\n",
        '',
      ]);
      const clean = captureIo();
      expect(await lint.run(argsOf(['.diagrams/src/a.diagram.json']), contextFor(clean))).toBe(0);
      expect([clean.stdout, clean.stderr]).toEqual(['', '']);
    });
  });

  it('prints the findings as one JSON array with --json, and nothing else on stdout', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { b: diagram('b', MISTYPED) });
      const io = captureIo();
      expect(await lint.run(argsOf([], { '--json': true }), contextFor(io))).toBe(1);
      expect(JSON.parse(io.stdout)).toEqual([expect.objectContaining({ file: '.diagrams/src/b.diagram.json' })]);
      expect(io.stdout).toBe(`${JSON.stringify(JSON.parse(io.stdout), null, 2)}\n`);
    });
  });

  it('keeps its empty array on stdout with no sources, the message on stderr', async () => {
    await inTempDir(async () => {
      const io = captureIo();
      expect(await lint.run(argsOf([], { '--json': true }), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual([
        '[]\n',
        "No diagrams under .diagrams/src — run 'diagc init' to create one.\n",
      ]);
    });
  });
});
