import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { tui } from './tui';

describe('tui', () => {
  it('refuses a name with no source, before it looks for a terminal', async () => {
    await inTempDir(async () => {
      const io = captureIo();
      expect(await tui.run(argsOf(['nope']), contextFor(io))).toBe(1);
      expect([io.stdout, io.stderr]).toEqual(['', "diagc: no diagram 'nope'\n"]);
    });
  });

  it('refuses a style the terminal does not draw, naming the two it does', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      const io = captureIo();
      expect(await tui.run(argsOf(['shop'], { '--style': 'sketch' }), contextFor(io))).toBe(1);
      expect(io.stderr).toBe("diagc: the terminal draws the clean and dos styles, not 'sketch'\n");
    });
  });

  it('refuses to run without a terminal, pointing at show', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      // the test runner's stdin and stdout are pipes
      const io = captureIo();
      expect(await tui.run(argsOf(['shop']), contextFor(io))).toBe(1);
      expect(io.stderr).toBe("diagc: tui needs a terminal; use 'diagc show <name>' to print a diagram.\n");
    });
  });
});
