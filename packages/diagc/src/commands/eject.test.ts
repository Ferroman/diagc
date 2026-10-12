import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { eject } from './eject';

describe('eject', () => {
  it('prints the TypeScript source it wrote, and compiles it into --out', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      const io = captureIo();
      expect(await eject.run(argsOf(['.diagrams/src/shop.diagram.json'], { '--out': 'build' }), contextFor(io))).toBe(
        0,
      );
      expect([io.stdout, io.stderr]).toEqual(['✓ .diagrams/src/shop.diagram.ts\n', '']);
      expect(existsSync(path.join(dir, 'build', 'shop.diagram.json'))).toBe(true);
    });
  });

  it('writes the source beside the JSON in .diagrams/src, and compiles it into .diagrams/.artifacts without --out', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { 'team/shop': diagram('shop') });
      const io = captureIo();
      expect(await eject.run(argsOf(['team/shop']), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual(['✓ .diagrams/src/team/shop.diagram.ts\n', '']);
      expect(readdirSync(path.join(dir, '.diagrams', 'src', 'team'))).toEqual(['shop.diagram.ts']);
      expect(existsSync(path.join(dir, '.diagrams', '.artifacts', 'team', 'shop.diagram.json'))).toBe(true);
    });
  });

  it('says on stderr why not, with exit 1', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      const missing = captureIo();
      expect(await eject.run(argsOf(['nope']), contextFor(missing))).toBe(1);
      expect([missing.stdout, missing.stderr]).toEqual(['', "no diagram 'nope' (.diagrams/src/nope.diagram.json)\n"]);
      expect(await eject.run(argsOf(['shop']), contextFor(captureIo()))).toBe(0);
      const owned = captureIo();
      expect(await eject.run(argsOf(['shop']), contextFor(owned))).toBe(1);
      expect(owned.stderr).toBe("'shop' is already TypeScript-owned (.diagrams/src/shop.diagram.ts)\n");
    });
  });

  it('needs a diagram name, and says so with the usage', async () => {
    for (const positionals of [[], ['.diagrams/src/']]) {
      const io = captureIo();
      expect(await eject.run(argsOf(positionals), contextFor(io))).toBe(1);
      expect([io.stdout, io.stderr]).toEqual(['', 'diagc: eject needs a diagram name.\nUSAGE\n']);
    }
  });
});
