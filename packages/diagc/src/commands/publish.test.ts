import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, DANGLING, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { publish, publishDirs } from './publish';

describe('publish directories', () => {
  it('compiles into the default artifacts directory without --out', () => {
    expect(publishDirs('.diagrams/.artifacts')).toEqual({
      srcDir: '.diagrams/src',
      artifactsDir: '.diagrams/.artifacts',
      htmlDir: '.diagrams/html',
      staticDir: '.diagrams/static',
      assetsDir: path.join('.diagrams/src', 'assets'),
    });
  });

  it('compiles into --out and reads the pages from there, leaving the pages and images where they were', () => {
    expect(publishDirs('build/artifacts')).toMatchObject({
      artifactsDir: 'build/artifacts',
      htmlDir: '.diagrams/html',
      staticDir: '.diagrams/static',
    });
  });
});

describe('publish', () => {
  it('prints the pages and the gallery on stdout, and exits 0 when every diagram is published', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { a: diagram('a'), 'team/b': diagram('b') });
      const io = captureIo();
      expect(await publish.run(argsOf([], { '--no-images': true, '--out': 'build' }), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual([
        '✓ 2 page(s) -> .diagrams/html\n✓ gallery -> .diagrams/html/index.html\n',
        '',
      ]);
      expect(existsSync(path.join(dir, 'build', 'team', 'b.diagram.json'))).toBe(true);
      expect(existsSync(path.join(dir, '.diagrams', 'html', 'team', 'b.html'))).toBe(true);
    });
  });

  it('says on stderr that .diagrams/src holds no diagrams, and writes the empty gallery into .diagrams/html', async () => {
    await inTempDir(async (dir) => {
      const io = captureIo();
      expect(await publish.run(argsOf([], { '--no-images': true }), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual([
        '✓ 0 page(s) -> .diagrams/html\n✓ gallery -> .diagrams/html/index.html\n',
        "No diagrams under .diagrams/src — run 'diagc init' to create one.\n",
      ]);
      expect(readdirSync(dir, { recursive: true }).sort()).toEqual([
        '.diagrams',
        '.diagrams/html',
        '.diagrams/html/index.html',
      ]);
    });
  });

  it("puts compile's failures and each of publish's warnings on stderr, and exits 1", async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, {
        a: diagram('a', { nodes: [{ id: 'a', name: 'A', type: 'service', image: 'deadbeef.png' }] }),
        c: diagram('c'),
        d: diagram('d'),
        e: diagram('e', DANGLING),
      });
      writeFileSync(path.join(dir, '.diagrams', 'src', 'c.drawings.json'), '{"strokes":"none"}');
      writeFileSync(path.join(dir, '.diagrams', 'src', 'd.layout.json'), '{');
      mkdirSync(path.join(dir, '.diagrams', '.artifacts'), { recursive: true });
      const stale = diagram('b', { nodes: [{ id: 'a', name: 'A', type: 'service', image: '/library/../../x.svg' }] });
      writeFileSync(path.join(dir, '.diagrams', '.artifacts', 'b.diagram.json'), JSON.stringify(stale));
      const io = captureIo();
      expect(await publish.run(argsOf([], { '--no-images': true }), contextFor(io))).toBe(1);
      const assets = path.join(realpathSync(dir), '.diagrams', 'src', 'assets');
      expect(io.stdout).toBe('✓ 3 page(s) -> .diagrams/html\n✓ gallery -> .diagrams/html/index.html\n');
      expect(io.stderr).toBe(
        `✗ ${path.join(dir, '.diagrams', 'src', 'e.diagram.json')}\n` +
          "Invalid diagram model:\n  - Relation 'r' references unknown node 'ghost'\n(keeping last good artifact)\n" +
          `publish: could not read asset "deadbeef.png" for diagram "a" (looked in ${assets}/deadbeef.png); leaving ref as-is.\n` +
          'publish: refusing out-of-root asset "/library/../../x.svg" for diagram "b"; leaving ref as-is.\n' +
          'publish: ignoring malformed drawings sidecar for diagram "c" (.diagrams/src/c.drawings.json); the page ships without ink.\n' +
          `publish: skipping diagram "d": Expected property name or '}' in JSON at position 1 (line 1 column 2)\n`,
      );
    });
  });

  it('takes a diagram by name or path, and refuses a name that is no diagram before writing a page', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop'), cart: diagram('cart') });
      const io = captureIo();
      const args = argsOf(['.diagrams/src/shop.diagram.json'], { '--no-images': true });
      expect(await publish.run(args, contextFor(io))).toBe(0);
      expect(io.stdout).toContain('✓ 1 page(s)');
      const nope = captureIo();
      expect(await publish.run(argsOf(['nope', 'shop', 'gone'], { '--no-images': true }), contextFor(nope))).toBe(1);
      expect([nope.stdout, nope.stderr]).toEqual(['', "diagc: no diagram 'nope'\ndiagc: no diagram 'gone'\n"]);
      expect(existsSync(path.join(dir, '.diagrams', 'html', 'cart.html'))).toBe(false);
    });
  });
});
