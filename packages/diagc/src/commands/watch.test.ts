import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, diagram, DANGLING, inTempDir, writeSources } from '../../test-fixtures/cli';
import { startWatching, watch } from './watch';

/** Wait until `done` holds, or give up after a while. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 25));
}

describe('watch', () => {
  it('takes one directory, and refuses --update-includes as it always resolves locked', () => {
    expect(watch.flags).toEqual(['--out']);
    expect(watch.positionals).toEqual({ max: 1, what: 'one directory' });
    expect(watch.whyNot).toEqual({ '--update-includes': 'it always resolves includes locked' });
  });

  it('says it is watching on stdout, then each success on stdout and each failure on stderr', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { a: diagram('a'), c: diagram('c', DANGLING) });
      const io = captureIo();
      const watcher = await startWatching(argsOf([], { '--out': 'build' }), contextFor(io));
      try {
        await until(() => io.stdout.includes('✓') && io.stderr.includes('✗'));
      } finally {
        await watcher.close();
      }
      expect(io.stdout.split('\n')[0]).toBe('Watching .diagrams/src for *.diagram.{ts,json} changes...');
      expect(io.stdout).toContain('✓ .diagrams/src/a.diagram.json -> build/a.diagram.json\n');
      expect(io.stderr).toMatch(/^✗ \.diagrams\/src\/c\.diagram\.json\n[^]*\n\(keeping last good artifact\)\n$/);
    });
  });

  it('watches .diagrams/src into .diagrams/.artifacts by default, its remote includes from the lock in .diagrams', async () => {
    await inTempDir(async (dir) => {
      const url = 'https://example.invalid/svc.diagram.json';
      const text = `${JSON.stringify(diagram('svc'), null, 2)}\n`;
      const sha256 = createHash('sha256').update(text).digest('hex');
      mkdirSync(path.join(dir, '.diagrams', 'includes'), { recursive: true });
      writeFileSync(path.join(dir, '.diagrams', 'includes', 'svc.diagram.json'), text);
      writeFileSync(
        path.join(dir, '.diagrams', 'includes.lock.json'),
        JSON.stringify({ version: 1, includes: { [url]: { file: 'includes/svc.diagram.json', sha256 } } }),
      );
      writeSources(dir, { u: diagram('u', { nodes: [{ id: 'svc', name: 'Svc', include: url }] }) });
      const io = captureIo();
      const watcher = await startWatching(argsOf(), contextFor(io));
      try {
        await until(() => io.stdout.includes('✓') || io.stderr !== '');
      } finally {
        await watcher.close();
      }
      expect([io.stdout, io.stderr]).toEqual([
        'Watching .diagrams/src for *.diagram.{ts,json} changes...\n' +
          '✓ .diagrams/src/u.diagram.json -> .diagrams/.artifacts/u.diagram.json\n',
        '',
      ]);
    });
  });

  it('says on stderr when .diagrams/src, watched by default, holds no diagrams', async () => {
    await inTempDir(async () => {
      const io = captureIo();
      const watcher = await startWatching(argsOf(), contextFor(io));
      await watcher.close();
      expect([io.stdout, io.stderr]).toEqual([
        'Watching .diagrams/src for *.diagram.{ts,json} changes...\n',
        "No diagrams under .diagrams/src — run 'diagc init' to create one.\n",
      ]);
    });
  });

  it('says on stderr when its directory holds no diagrams or does not exist', async () => {
    await inTempDir(async () => {
      const io = captureIo();
      const watcher = await startWatching(argsOf(['nowhere']), contextFor(io));
      await watcher.close();
      expect([io.stdout, io.stderr]).toEqual([
        'Watching nowhere for *.diagram.{ts,json} changes...\n',
        "No diagrams under nowhere — run 'diagc init' to create one.\n",
      ]);
    });
  });
});
