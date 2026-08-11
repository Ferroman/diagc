import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ViteDevServer } from 'vite';
import { designerApi } from './designer-api';

/** Minimal ViteDevServer stand-in: the plugin only reads `config.root` (to
 * build the handlers path) and calls `ssrLoadModule` (to load handlers) and
 * `middlewares.use` (to register its request middleware). */
function fakeServer(root: string): { middleware: (req: unknown, res: unknown, next: () => void) => void } {
  let middleware: (req: unknown, res: unknown, next: () => void) => void = () => {};
  const server = {
    config: { root },
    // Load the real handlers through the test runtime instead of Vite's SSR.
    ssrLoadModule: async () => await import('./handlers'),
    middlewares: {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
        middleware = fn;
      },
    },
  };
  // Vite types the hook as ObjectHook; invoke its callable form directly.
  const configure = designerApi(path.join(root, 'diagrams'), path.join(root, 'artifacts')).configureServer as unknown as (
    server: ViteDevServer,
  ) => void;
  configure(server as unknown as ViteDevServer);
  return { middleware };
}

interface Response {
  status: number;
  headers: Record<string, string>;
  raw: Buffer;
  body: unknown;
  next: boolean;
}

async function request(
  srv: { middleware: (req: unknown, res: unknown, next: () => void) => void },
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<Response> {
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => (resolveDone = resolve));
  let status = 0;
  let calledNext = false;
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const bodyBytes = typeof opts.body === 'string' ? Buffer.from(opts.body) : opts.body;
  const req = Object.assign(Readable.from(bodyBytes !== undefined ? [bodyBytes] : []), {
    url,
    method: opts.method ?? 'GET',
    headers: opts.headers ?? {},
  });
  const res = {
    set statusCode(v: number) {
      status = v;
    },
    get statusCode() {
      return status;
    },
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      resolveDone();
    },
  };
  srv.middleware(req, res, () => {
    calledNext = true;
    resolveDone();
  });
  await done;
  const raw = Buffer.concat(chunks);
  return {
    status,
    headers,
    raw,
    body: headers['content-type'] === 'application/json' && raw.length > 0 ? JSON.parse(raw.toString('utf8')) : undefined,
    next: calledNext,
  };
}

const goodModel = {
  version: 1,
  id: 'foo',
  name: 'foo',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

describe('designer-api routing', () => {
  it('delegates a GET to the matching handler and sends its JSON envelope', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-api-'));
    const src = path.join(root, 'diagrams');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'flows.layout.json'), JSON.stringify({ version: 1, planes: {} }));
    const r = await request(fakeServer(root), '/api/layouts');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ layouts: { flows: { version: 1, planes: {} } } });
    await rm(root, { recursive: true, force: true });
  });

  it('checks the rename route before the generic save route', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-api-'));
    // A valid diagram model would be saved (200) by the generic `(.+)` save
    // route with name "foo/rename"; the rename route must win and reject the
    // body for missing `to`.
    const r = await request(fakeServer(root), '/api/diagrams/foo/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(goodModel),
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("Missing 'to' name");
  });

  it('passes the raw body of the asset POST through to saveAsset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-api-'));
    const bytes = Buffer.from('fake-png-bytes');
    const r = await request(fakeServer(root), '/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: bytes,
    });
    expect(r.status).toBe(200);
    const { name } = r.body as { name: string };
    expect(await readFile(path.join(root, 'diagrams', 'assets', name))).toEqual(bytes);
    await rm(root, { recursive: true, force: true });
  });

  it('hands unmatched paths to the connect chain via next()', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-api-'));
    const r = await request(fakeServer(root), '/api/not-a-route');
    expect(r.next).toBe(true);
    expect(r.status).toBe(0); // middleware never wrote a response
    await rm(root, { recursive: true, force: true });
  });
});