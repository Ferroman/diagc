import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import * as handlers from './handlers';
import { handleApiRequest, runRoute } from './dispatch';

interface Result {
  status: number;
  headers: Record<string, string>;
  raw: Buffer;
  body: unknown;
  handled: boolean;
}

/** Drive one request through the dispatcher against a temp diagrams dir. */
async function request(
  root: string,
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<Result> {
  let status = 0;
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const bodyBytes = typeof opts.body === 'string' ? Buffer.from(opts.body) : opts.body;
  const req = Object.assign(Readable.from(bodyBytes !== undefined ? [bodyBytes] : []), {
    url,
    method: opts.method ?? 'GET',
    headers: opts.headers ?? {},
  }) as unknown as IncomingMessage;
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
    },
  } as unknown as ServerResponse;
  const handled = await handleApiRequest(
    req,
    res,
    { diagramsDir: path.join(root, 'diagrams'), artifactsDir: path.join(root, 'artifacts') },
    handlers,
  );
  const raw = Buffer.concat(chunks);
  return {
    status,
    headers,
    raw,
    body: headers['content-type'] === 'application/json' && raw.length > 0 ? JSON.parse(raw.toString('utf8')) : undefined,
    handled,
  };
}

const tempRoot = () => mkdtemp(path.join(os.tmpdir(), 'ds-api-'));

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

describe('handleApiRequest', () => {
  it('delegates a GET to the matching handler and sends its JSON envelope', async () => {
    const root = await tempRoot();
    const src = path.join(root, 'diagrams');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'flows.layout.json'), JSON.stringify({ version: 1, planes: {} }));
    const r = await request(root, '/api/layouts');
    expect(r.handled).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ layouts: { flows: { version: 1, planes: {} } } });
    await rm(root, { recursive: true, force: true });
  });

  it('checks the rename route before the generic save route', async () => {
    const root = await tempRoot();
    // A valid diagram model would be saved (200) by the generic `(.+)` save
    // route with name "foo/rename"; the rename route must win and reject the
    // body for missing `to`.
    const r = await request(root, '/api/diagrams/foo/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(goodModel),
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("Missing 'to' name");
    await rm(root, { recursive: true, force: true });
  });

  it('checks the eject route before the generic save route', async () => {
    const root = await tempRoot();
    // A valid diagram model would be saved (200) by the generic `(.+)` save
    // route with name "foo/eject"; the eject route must win and report the
    // diagram as missing instead.
    const r = await request(root, '/api/diagrams/foo/eject', { method: 'POST' });
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).toContain("no diagram 'foo'");
    await rm(root, { recursive: true, force: true });
  });

  it('passes the raw body of the asset POST through to saveAsset', async () => {
    const root = await tempRoot();
    const bytes = Buffer.from('fake-png-bytes');
    const r = await request(root, '/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: bytes,
    });
    expect(r.status).toBe(200);
    const { name } = r.body as { name: string };
    expect(await readFile(path.join(root, 'diagrams', 'assets', name))).toEqual(bytes);
    await rm(root, { recursive: true, force: true });
  });

  it('reports an unmatched path as unhandled without writing a response', async () => {
    const root = await tempRoot();
    const r = await request(root, '/api/not-a-route');
    expect(r.handled).toBe(false);
    expect(r.status).toBe(0);
    expect(r.raw).toHaveLength(0);
    await rm(root, { recursive: true, force: true });
  });

  it('rejects a malformed JSON body with 400 rather than a 500', async () => {
    const root = await tempRoot();
    const r = await request(root, '/api/diagrams/foo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('Invalid JSON body');
    await rm(root, { recursive: true, force: true });
  });

  it('turns a thrown handler error into a 500 envelope instead of rejecting', async () => {
    const root = await tempRoot();
    // '%%' is malformed percent-encoding: decodeURIComponent throws inside the
    // route handler, which the boundary must convert rather than propagate.
    const r = await request(root, '/api/diagrams/%%');
    expect(r.status).toBe(500);
    expect(r.body).toHaveProperty('issues');
    await rm(root, { recursive: true, force: true });
  });

  it('streams raw bytes with the handler content-type for asset reads', async () => {
    const root = await tempRoot();
    const bytes = Buffer.from('fake-png-bytes');
    const saved = await request(root, '/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: bytes,
    });
    const { name } = saved.body as { name: string };
    const r = await request(root, `/api/assets/${name}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.raw).toEqual(bytes);
    await rm(root, { recursive: true, force: true });
  });

  it('routes GET /api/drawings and POST /api/drawings/<name>', async () => {
    const root = await tempRoot();
    const body = JSON.stringify({ version: 1, planes: { default: [{ id: 'k1', points: [1, 2, 3, 4] }] } });
    const saved = await request(root, '/api/drawings/sketch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(saved.status).toBe(200);
    expect(JSON.parse(await readFile(path.join(root, 'diagrams', 'sketch.drawings.json'), 'utf8')).planes.default).toHaveLength(1);
    const listed = await request(root, '/api/drawings');
    expect(listed.status).toBe(200);
    expect((listed.body as { drawings: Record<string, unknown> }).drawings['sketch']).toBeDefined();
    await rm(root, { recursive: true, force: true });
  });
});

describe('runRoute', () => {
  it('runRoute serves a matched route with no HTTP objects involved', async () => {
    const root = await tempRoot();
    const ctx = { diagramsDir: path.join(root, 'diagrams'), artifactsDir: path.join(root, 'artifacts') };
    const r = await runRoute({ method: 'GET', url: '/api/diagrams' }, ctx, handlers);
    expect(r?.status).toBe(200);
    await rm(root, { recursive: true, force: true });
  });

  it('runRoute returns undefined for an unmatched url', async () => {
    const root = await tempRoot();
    const ctx = { diagramsDir: path.join(root, 'diagrams'), artifactsDir: path.join(root, 'artifacts') };
    expect(await runRoute({ method: 'GET', url: '/nope' }, ctx, handlers)).toBeUndefined();
    await rm(root, { recursive: true, force: true });
  });

  it('runRoute maps a malformed JSON body to 400', async () => {
    const root = await tempRoot();
    const ctx = { diagramsDir: path.join(root, 'diagrams'), artifactsDir: path.join(root, 'artifacts') };
    const r = await runRoute(
      { method: 'POST', url: '/api/diagrams/x', body: Buffer.from('{oops') }, ctx, handlers);
    expect(r?.status).toBe(400);
    await rm(root, { recursive: true, force: true });
  });
});
