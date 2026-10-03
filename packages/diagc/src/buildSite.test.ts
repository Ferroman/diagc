import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

// scripts/build-site.mjs, run against a stand-in tree: the real one holds every
// published page.
const script = path.resolve(import.meta.dirname, '../../../scripts/build-site.mjs');

let root: string;
const put = (rel: string, text: string): void => {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const at = (rel: string): string => path.join(root, '_site', rel);
const build = (...args: string[]): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'diagc-site-'));
  put('site/index.html', 'landing');
  put('site/img/studio-view.png', 'picture');
  put('.diagrams/html/index.html', 'examples index');
  put('.diagrams/html/examples/acme.html', 'acme page');
  put('.diagrams/static/examples/acme.png', 'acme picture');
});

describe('build-site', () => {
  it('puts the landing page at the root, the pages under html/ and the pictures under static/', () => {
    const run = build('--root', root);
    expect(run.status).toBe(0);
    expect(readFileSync(at('index.html'), 'utf8')).toBe('landing');
    expect(readFileSync(at('img/studio-view.png'), 'utf8')).toBe('picture');
    expect(readFileSync(at('html/index.html'), 'utf8')).toBe('examples index');
    expect(readFileSync(at('html/examples/acme.html'), 'utf8')).toBe('acme page');
    expect(readFileSync(at('static/examples/acme.png'), 'utf8')).toBe('acme picture');
  });

  it('removes what an earlier build left behind', () => {
    put('_site/html/examples/removed.html', 'stale');
    expect(build('--root', root).status).toBe(0);
    expect(existsSync(at('html/examples/removed.html'))).toBe(false);
  });

  it('stops with the command to run when the pages were not published', () => {
    rmSync(path.join(root, '.diagrams', 'html'), { recursive: true });
    const run = build('--root', root);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('.diagrams/html');
    expect(run.stderr).toContain('pnpm publish-diagrams');
    expect(existsSync(path.join(root, '_site'))).toBe(false);
  });

  it('refuses --root with no directory after it', () => {
    const run = build('--root');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--root needs a directory');
  });
});
