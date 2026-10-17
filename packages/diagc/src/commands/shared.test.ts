import { describe, expect, it, vi } from 'vitest';
import { captureIo, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { writeFileSync } from 'node:fs';
import { diagramNames, pngRenderer, sourceOf, warnNoSources } from './shared';

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
