import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contentTypeFor, resolveStatic, startStudioServer, type StudioServer } from './serve';

let tmp: string;
let studioDir: string;
let diagramsDir: string;
let server: StudioServer | undefined;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'diagc-serve-'));
  studioDir = path.join(tmp, 'studio');
  diagramsDir = path.join(tmp, 'diagrams');
  await mkdir(path.join(studioDir, 'assets'), { recursive: true });
  await mkdir(path.join(studioDir, 'library', 'shapes'), { recursive: true });
  await mkdir(diagramsDir, { recursive: true });
  await writeFile(path.join(studioDir, 'index.html'), '<!doctype html><title>studio</title>');
  await writeFile(path.join(studioDir, 'assets', 'app.js'), 'export const x = 1;');
  await writeFile(path.join(studioDir, 'library', 'shapes', 'box.svg'), '<svg/>');
  await writeFile(path.join(tmp, 'secret.txt'), 'do not serve me');
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(tmp, { recursive: true, force: true });
});

const start = async (): Promise<StudioServer> => {
  server = await startStudioServer({
    studioDir,
    diagramsDir,
    artifactsDir: path.join(tmp, 'artifacts'),
    port: 0, // ephemeral: parallel test files must not fight over 5173
  });
  return server;
};

describe('resolveStatic', () => {
  it('resolves a normal path inside the root', () => {
    expect(resolveStatic('/root', '/assets/app.js')).toBe(path.resolve('/root/assets/app.js'));
  });

  it('clamps .. inside the root instead of climbing out', () => {
    expect(resolveStatic('/root', '/../secret.txt')).toBe(path.resolve('/root/secret.txt'));
    expect(resolveStatic('/root', '/assets/../../secret.txt')).toBe(path.resolve('/root/secret.txt'));
  });

  it('clamps percent-encoded traversal too (decoded before normalizing)', () => {
    expect(resolveStatic('/root', '/assets/%2e%2e/%2e%2e/secret.txt')).toBe(path.resolve('/root/secret.txt'));
  });

  it('never returns a path outside the root, whatever the input', () => {
    const rootResolved = path.resolve('/root');
    for (const url of ['/../../../../etc/passwd', '/%2e%2e%2f%2e%2e%2fetc/passwd', '/a/../../..', '//etc/passwd']) {
      const out = resolveStatic('/root', url);
      if (out === undefined) continue;
      expect(out === rootResolved || out.startsWith(rootResolved + path.sep)).toBe(true);
    }
  });

  it('returns undefined for malformed percent-encoding', () => {
    expect(resolveStatic('/root', '/%%')).toBeUndefined();
  });

  it('ignores the query string', () => {
    expect(resolveStatic('/root', '/assets/app.js?v=123')).toBe(path.resolve('/root/assets/app.js'));
  });

  it('maps the bare root to the root dir itself', () => {
    expect(resolveStatic('/root', '/')).toBe(path.resolve('/root'));
  });
});

describe('contentTypeFor', () => {
  it('types the formats a studio bundle emits', () => {
    expect(contentTypeFor('a/index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('a/app.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('a/box.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('a/font.woff2')).toBe('font/woff2');
  });

  it('falls back to octet-stream for anything unknown', () => {
    expect(contentTypeFor('a/thing.xyz')).toBe('application/octet-stream');
  });
});

describe('startStudioServer', () => {
  it('serves the studio shell at the root', async () => {
    const s = await start();
    const res = await fetch(`${s.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>studio</title>');
  });

  it('serves bundle assets with their content type', async () => {
    const s = await start();
    const res = await fetch(`${s.url}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(await res.text()).toBe('export const x = 1;');
  });

  it('serves the icon library the bundle carries', async () => {
    const s = await start();
    const res = await fetch(`${s.url}/library/shapes/box.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('falls back to the shell for a client-side route', async () => {
    const s = await start();
    const res = await fetch(`${s.url}/some/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>studio</title>');
  });

  it('round-trips a diagram through the write API', async () => {
    const s = await start();
    const model = {
      version: 1,
      id: 'sketch',
      name: 'sketch',
      nodes: [{ id: 'a', name: 'A' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const save = await fetch(`${s.url}/api/diagrams/sketch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(save.status).toBe(200);
    // The file the studio would later reopen — written where the CLI compiles from.
    const onDisk = JSON.parse(await readFile(path.join(diagramsDir, 'sketch.diagram.json'), 'utf8')) as { id: string };
    expect(onDisk.id).toBe('sketch');
    const read = await fetch(`${s.url}/api/diagrams/sketch`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ model: { id: 'sketch' } });
  });

  it('404s an unknown API route as JSON instead of serving the shell', async () => {
    const s = await start();
    const res = await fetch(`${s.url}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('issues');
  });

  it('does not serve files outside the studio bundle', async () => {
    const s = await start();
    // `secret.txt` sits one level above the bundle. Every spelling of the climb
    // lands inside the bundle instead (where no such file exists), so the SPA
    // shell comes back — never the file.
    for (const url of ['/assets/../../secret.txt', '/..%2f..%2fsecret.txt', '/%2e%2e/secret.txt']) {
      const res = await fetch(`${s.url}${url}`, { redirect: 'manual' });
      expect(await res.text()).not.toContain('do not serve me');
    }
  });

  it('reports the port it actually bound', async () => {
    const s = await start();
    expect(s.port).toBeGreaterThan(0);
    expect(s.url).toContain(String(s.port));
  });

  it('steps to the next port when the first is taken', async () => {
    const first = await startStudioServer({ studioDir, diagramsDir, artifactsDir: path.join(tmp, 'artifacts'), port: 0 });
    const second = await startStudioServer({
      studioDir,
      diagramsDir,
      artifactsDir: path.join(tmp, 'artifacts'),
      port: first.port,
    });
    expect(second.port).toBe(first.port + 1);
    await first.close();
    await second.close();
  });
});
