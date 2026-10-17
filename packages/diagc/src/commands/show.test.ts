import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { argsOf, captureIo, contextFor, DANGLING, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { show } from './show';

// Colour follows the environment as well as the terminal; pin it, so a CI that sets
// FORCE_COLOR or NO_COLOR runs these as a plain pipe would.
beforeEach(() => {
  vi.stubEnv('FORCE_COLOR', undefined);
  vi.stubEnv('NO_COLOR', undefined);
  vi.stubEnv('TERM', 'xterm-256color');
});
afterEach(() => vi.unstubAllEnvs());

/** Two boxes in a container, an arrow to a third on the base sheet and one on layer l1. */
const shop = diagram('shop', {
  nodes: [
    { id: 'p', name: 'Platform' },
    { id: 'a', name: 'Api' },
    { id: 'b', name: 'Worker' },
    { id: 'c', name: 'Database' },
  ],
  containment: [
    { parent: 'p', child: 'a' },
    { parent: 'p', child: 'b' },
  ],
  relations: [
    { id: 'r1', from: 'a', to: 'c', kind: 'sync', label: 'reads' },
    { id: 'r2', from: 'b', to: 'c', kind: 'sync', label: 'writes', layer: 'l1' },
  ],
  layers: [{ id: 'l1', name: 'Writes' }],
  planes: [
    { id: 'logical', name: 'Logical' },
    { id: 'flat', name: 'Flat', hides: ['p'] },
  ],
});

type Flags = Parameters<typeof show.run>[0]['flags'];

async function run(positionals: string[], flags: Flags = {}, tty?: { columns: number }) {
  const io = captureIo(tty);
  const code = await show.run(argsOf(positionals, flags), contextFor(io));
  return { code, stdout: io.stdout, stderr: io.stderr };
}

describe('show', () => {
  it('prints the picture, every container open, with no colour on a pipe', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      const { code, stdout, stderr } = await run(['shop']);
      expect([code, stderr]).toEqual([0, '']);
      for (const name of ['Platform', 'Api', 'Worker', 'Database', 'reads']) expect(stdout).toContain(name);
      expect(stdout).not.toContain('writes');
      expect(stdout).not.toContain('\x1b');
      expect(stdout).toContain('┌');
      expect(stdout.endsWith('\n')).toBe(true);
    });
  });

  it('takes a source path for the name', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      expect((await run(['.diagrams/src/shop.diagram.json'])).code).toBe(0);
    });
  });

  it('draws in plain ASCII with --ascii', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      const { stdout } = await run(['shop'], { '--ascii': true });
      expect(stdout).toMatch(/^[\x20-\x7e\n]+$/);
    });
  });

  it('draws the layers it is given, and none for an empty list', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      expect((await run(['shop'], { '--layers': ['l1'] })).stdout).toContain('writes');
      expect((await run(['shop'], { '--layers': [] })).stdout).not.toContain('writes');
    });
  });

  it('draws the plane it is given', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      expect((await run(['shop'], { '--plane': 'flat' })).stdout).not.toContain('Platform');
    });
  });

  it('opens only the levels --depth says', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      const { stdout } = await run(['shop'], { '--depth': 0 });
      expect(stdout).toContain('+ 2 inside');
      expect(stdout).not.toContain('Api');
    });
  });

  it('draws a container’s interior with --root', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      const { code, stdout } = await run(['shop'], { '--root': 'p' });
      expect(code).toBe(0);
      expect(stdout).toContain('Api');
      expect(stdout).not.toContain('Platform');
    });
  });

  it('lays out the way the layout beside the source says', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, {
        pair: diagram('pair', {
          nodes: [
            { id: 'a', name: 'Left' },
            { id: 'b', name: 'Right' },
          ],
          relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
        }),
      });
      writeFileSync(
        '.diagrams/src/pair.layout.json',
        JSON.stringify({ version: 1, planes: {}, settings: { default: { direction: 'RIGHT' } } }),
      );
      const { stdout } = await run(['pair']);
      expect(stdout.split('\n').some((line) => line.includes('Left') && line.includes('Right'))).toBe(true);
    });
  });

  it('colours a terminal, and says when the picture is wider than it', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop });
      const { code, stdout, stderr } = await run(['shop'], {}, { columns: 10 });
      expect(code).toBe(0);
      expect(stdout).toContain('\x1b[');
      expect(stderr).toMatch(
        /^diagc: the picture is \d+ columns wide and the terminal 10; pipe it through 'less -S' or use 'diagc tui shop'\.\n$/,
      );
      expect((await run(['shop'], { '--no-color': true }, { columns: 500 })).stderr).toBe('');
      expect((await run(['shop'], { '--no-color': true }, { columns: 500 })).stdout).not.toContain('\x1b');
      expect((await run(['shop'], { '--color': true })).stdout).toContain('\x1b[');
    });
  });

  it('says so, and exits 0, when there is nothing to draw', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { e: diagram('e', { nodes: [] }) });
      expect(await run(['e'])).toEqual({ code: 0, stdout: '', stderr: 'diagc: nothing to draw in e\n' });
    });
  });

  it('refuses what names nothing to draw, saying what there is', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop, bad: diagram('bad', DANGLING), one: diagram('one') });
      const refusals: [string[], Flags, string][] = [
        [[], {}, 'diagc: show needs a diagram name.\nUSAGE\n'],
        [['nope'], {}, "diagc: no diagram 'nope'\n"],
        [['shop'], { '--plane': 'nope' }, "diagc: no plane 'nope' in shop; its planes: logical, flat\n"],
        [['one'], { '--plane': 'x' }, "diagc: no plane 'x' in one; it has no planes\n"],
        [['shop'], { '--layers': ['l1', 'l9'] }, "diagc: no layer 'l9' in shop; its layers: l1\n"],
        [['shop'], { '--root': 'x' }, "diagc: no node 'x' in shop; --root takes a container: p\n"],
        [['shop'], { '--root': 'a' }, "diagc: 'a' holds nothing to draw; --root takes a container: p\n"],
        [
          ['shop'],
          { '--color': true, '--no-color': true },
          'diagc: --color and --no-color contradict each other.\nUSAGE\n',
        ],
      ];
      for (const [positionals, flags, stderr] of refusals) {
        expect([positionals, flags, await run(positionals, flags)]).toEqual([
          positionals,
          flags,
          { code: 1, stdout: '', stderr },
        ]);
      }
      const bad = await run(['bad']);
      expect([bad.code, bad.stdout]).toEqual([1, '']);
      expect(bad.stderr).toContain('ghost');
    });
  });
});
