import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncludeResolver } from '@diagc/core/internal';
import { diagram, home, inTempDir } from '../test-fixtures/cli';
import { openCommand, runStudio, studioEnv } from './studio';

// The editor server and the watch loop stand in: what is pinned is where runStudio
// points them, and what it says.
const spawned = vi.hoisted(() => [] as unknown[][]);
vi.mock('node:child_process', async (importOriginal) => {
  const { EventEmitter } = await import('node:events');
  return {
    ...(await importOriginal<typeof import('node:child_process')>()),
    spawn: (...args: unknown[]) => {
      spawned.push(args);
      // A Vite that exits at once, so runStudio settles.
      const child = Object.assign(new EventEmitter(), { killed: false, kill: () => true });
      setImmediate(() => child.emit('exit', 0));
      return child;
    },
  };
});
const watched = vi.hoisted(() => [] as unknown[][]);
vi.mock('./watch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./watch')>()),
  startWatch: (...args: unknown[]) => {
    watched.push(args);
    return { close: async () => {} };
  },
}));

afterEach(() => {
  spawned.length = 0;
  watched.length = 0;
});

describe('studioEnv', () => {
  it('points DIAGRAMS_DIR/ARTIFACTS_DIR at the target repo and enables open', () => {
    const env = studioEnv('/work/some-repo');
    expect(env.DIAGRAMS_DIR).toBe(path.join('/work/some-repo', '.diagrams', 'src'));
    expect(env.ARTIFACTS_DIR).toBe(path.join('/work/some-repo', '.diagrams', '.artifacts'));
    expect(env.DIAGRAMS_CWD).toBe('/work/some-repo');
    expect(env.DIAGRAMS_OPEN).toBe('1');
  });

  it('joins a relative root as a path: `.` and the empty string are the current directory, `..` its parent', () => {
    expect([studioEnv('.'), studioEnv(''), studioEnv('..'), studioEnv('repo/')]).toEqual([
      { DIAGRAMS_DIR: '.diagrams/src', ARTIFACTS_DIR: '.diagrams/.artifacts', DIAGRAMS_CWD: '.', DIAGRAMS_OPEN: '1' },
      { DIAGRAMS_DIR: '.diagrams/src', ARTIFACTS_DIR: '.diagrams/.artifacts', DIAGRAMS_CWD: '', DIAGRAMS_OPEN: '1' },
      {
        DIAGRAMS_DIR: '../.diagrams/src',
        ARTIFACTS_DIR: '../.diagrams/.artifacts',
        DIAGRAMS_CWD: '..',
        DIAGRAMS_OPEN: '1',
      },
      {
        DIAGRAMS_DIR: 'repo/.diagrams/src',
        ARTIFACTS_DIR: 'repo/.diagrams/.artifacts',
        DIAGRAMS_CWD: 'repo/',
        DIAGRAMS_OPEN: '1',
      },
    ]);
  });
});

describe('runStudio', () => {
  /** runStudio's stdout lines; the signal handlers it adds are taken off again. */
  async function studioLines(root: string): Promise<string[]> {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line));
    const signals = ['SIGINT', 'SIGTERM'] as const;
    const before = signals.map((s) => process.listeners(s));
    try {
      await runStudio(home, root);
    } finally {
      log.mockRestore();
      signals.forEach((s, i) => {
        for (const l of process.listeners(s)) if (!before[i]!.includes(l)) process.off(s, l);
      });
    }
    return lines;
  }

  it('makes the sources folder, watches it into the artifacts folder, and runs the editor on both', async () => {
    await inTempDir(async (dir) => {
      const src = path.join(dir, '.diagrams', 'src');
      const artifacts = path.join(dir, '.diagrams', '.artifacts');
      expect(await studioLines(dir)).toEqual([`Studio for ${dir} — sources in ${src}`]);
      expect(existsSync(src)).toBe(true);
      expect(watched.map((args) => args.slice(0, 2))).toEqual([[src, artifacts]]);
      expect(spawned).toEqual([
        [
          'pnpm',
          ['--filter', '@diagc/studio', 'dev'],
          expect.objectContaining({
            cwd: home.root,
            env: expect.objectContaining({
              DIAGRAMS_DIR: src,
              ARTIFACTS_DIR: artifacts,
              DIAGRAMS_CWD: dir,
              DIAGRAMS_OPEN: '1',
            }),
          }),
        ],
      ]);
    });
  });

  it('names the folders as it was given the root: `.` is the current directory', async () => {
    await inTempDir(async (dir) => {
      expect(await studioLines('.')).toEqual(['Studio for . — sources in .diagrams/src']);
      expect(existsSync(path.join(dir, '.diagrams', 'src'))).toBe(true);
      expect(watched.map((args) => args.slice(0, 2))).toEqual([['.diagrams/src', '.diagrams/.artifacts']]);
    });
  });

  it("resolves the watch loop's remote includes from the lock in the root's .diagrams", async () => {
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
      await studioLines(dir);
      const { resolver } = watched[0]![2] as { resolver: IncludeResolver };
      await expect(resolver(url, path.join(dir, '.diagrams', 'src', 'a.diagram.json'))).resolves.toEqual({
        model: diagram('svc'),
        ref: url,
      });
    });
  });
});

describe('openCommand', () => {
  it('uses the platform opener', () => {
    expect(openCommand('darwin')).toEqual({ cmd: 'open', args: [] });
    expect(openCommand('linux')).toEqual({ cmd: 'xdg-open', args: [] });
    // `start` treats a bare first argument as the window title, so it needs an
    // empty one before the URL.
    expect(openCommand('win32')).toEqual({ cmd: 'cmd', args: ['/c', 'start', ''] });
  });
});
