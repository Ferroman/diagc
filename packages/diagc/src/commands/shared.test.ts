import { describe, expect, it, vi } from 'vitest';
import { captureIo, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { writeFileSync } from 'node:fs';
import { diagramNames, pngRenderer, resolveSources, sourceOf, warnNoSources } from './shared';

const snapshot = vi.hoisted(() => ({
  findChrome: vi.fn((): string | undefined => undefined),
  renderPng: async () => {},
}));
vi.mock('../publish/snapshot', () => snapshot);

describe('warnNoSources', () => {
  it('says on stderr where it found no diagrams, .diagrams/src by default', () => {
    const io = captureIo();
    warnNoSources(io);
    warnNoSources(io, 'team');
    expect([io.stdout, io.stderr]).toEqual([
      '',
      "No diagrams under .diagrams/src — run 'diagc init' to create one.\n" +
        "No diagrams under team — run 'diagc init' to create one.\n",
    ]);
  });
});

describe('diagramNames', () => {
  it('reads each as eject does, and refuses every one that is no diagram, on stderr', () => {
    const io = captureIo();
    const known = new Set(['shop', 'team/app']);
    expect(diagramNames(io, ['.diagrams/src/shop.diagram.json', 'team/app.diagram.ts'], known)).toEqual([
      'shop',
      'team/app',
    ]);
    expect(diagramNames(io, [], known)).toEqual([]);
    expect(io.stderr).toBe('');
    expect(diagramNames(io, ['nope', 'shop', 'gone'], known)).toBeUndefined();
    expect([io.stdout, io.stderr]).toEqual(['', "diagc: no diagram 'nope'\ndiagc: no diagram 'gone'\n"]);
  });
});

describe('sourceOf', () => {
  it('finds a name’s source, the TypeScript one first', async () => {
    await inTempDir(async () => {
      writeSources('.', { shop: diagram('shop'), 'team/app': diagram('app') });
      expect(sourceOf('shop')).toBe('.diagrams/src/shop.diagram.json');
      expect(sourceOf('team/app')).toBe('.diagrams/src/team/app.diagram.json');
      writeFileSync('.diagrams/src/shop.diagram.ts', 'export default {};');
      expect(sourceOf('shop')).toBe('.diagrams/src/shop.diagram.ts');
      expect(sourceOf('nope')).toBeUndefined();
      expect(sourceOf('shop', 'elsewhere')).toBeUndefined();
    });
  });
});

describe('resolveSources', () => {
  it('keeps a path, reads a name as its source (TypeScript first), and lists every source for none', async () => {
    await inTempDir(async () => {
      writeSources('.', { shop: diagram('shop'), 'team/app': diagram('app') });
      writeFileSync('.diagrams/src/shop.diagram.ts', 'export default {};');
      const io = captureIo();
      expect(
        await resolveSources(io, ['.diagrams/src/team/app.diagram.json', 'shop', 'team/app.diagram.json']),
      ).toEqual([
        '.diagrams/src/team/app.diagram.json',
        '.diagrams/src/shop.diagram.ts',
        '.diagrams/src/team/app.diagram.json',
      ]);
      expect(await resolveSources(io, [])).toEqual([
        '.diagrams/src/shop.diagram.json',
        '.diagrams/src/shop.diagram.ts',
        '.diagrams/src/team/app.diagram.json',
      ]);
      expect([io.stdout, io.stderr]).toEqual(['', '']);
    });
  });

  it('refuses an argument that is neither a file nor a diagram, naming each, and runs nothing', async () => {
    await inTempDir(async () => {
      writeSources('.', { shop: diagram('shop') });
      const io = captureIo();
      expect(await resolveSources(io, ['big', 'shop', 'gone.diagram.ts'])).toBeUndefined();
      expect([io.stdout, io.stderr]).toEqual([
        '',
        "diagc: no diagram 'big' — not a file, and nothing under .diagrams/src is named that\n" +
          "diagc: no diagram 'gone.diagram.ts' — not a file, and nothing under .diagrams/src is named that\n",
      ]);
    });
  });

  it('says where it found no sources when given none and there are none', async () => {
    await inTempDir(async () => {
      const io = captureIo();
      expect(await resolveSources(io, [])).toEqual([]);
      expect(io.stderr).toBe("No diagrams under .diagrams/src — run 'diagc init' to create one.\n");
    });
  });
});

describe('pngRenderer', () => {
  it('renders with the Chrome it finds', async () => {
    snapshot.findChrome.mockReturnValueOnce('/usr/bin/chromium');
    const io = captureIo();
    expect(await pngRenderer(io, true)).toBe(snapshot.renderPng);
    expect([io.stdout, io.stderr]).toEqual(['', '']);
  });

  it('says on stderr that it found no Chrome, and renders nothing', async () => {
    const io = captureIo();
    expect(await pngRenderer(io, true)).toBeUndefined();
    expect([io.stdout, io.stderr]).toEqual([
      '',
      'No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.\n',
    ]);
  });

  it('looks for no Chrome when no images are wanted', async () => {
    snapshot.findChrome.mockClear();
    const io = captureIo();
    expect(await pngRenderer(io, false)).toBeUndefined();
    expect(snapshot.findChrome).not.toHaveBeenCalled();
    expect([io.stdout, io.stderr]).toEqual(['', '']);
  });
});
