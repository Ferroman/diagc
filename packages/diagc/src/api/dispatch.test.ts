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

/** Drive one request through the dispatcher against a temp diagrams dir.
 * `bodyError` swaps the body stream for one that rejects mid-iteration
 * (simulating a client disconnect while uploading), instead of supplying
 * `body` bytes. */
async function request(
  root: string,
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | Buffer; bodyError?: string } = {},
): Promise<Result> {
  let status = 0;
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const bodyBytes = typeof opts.body === 'string' ? Buffer.from(opts.body) : opts.body;
  const bodyError = opts.bodyError;
  // Destroying the stream with an error (rather than a throwing generator)
  // mirrors how a real client disconnect surfaces on an IncomingMessage.
  const bodyStream =
    bodyError !== undefined
      ? new Readable({
          read() {
            this.destroy(new Error(bodyError));
          },
        })
      : Readable.from(bodyBytes !== undefined ? [bodyBytes] : []);
  const req = Object.assign(bodyStream, {
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

  it('turns a rejecting body stream into a 500 envelope instead of an unhandled rejection', async () => {
    const root = await tempRoot();
    // A client disconnecting mid-upload makes `for await` over the request
    // stream throw; that happens before runRoute's own try/catch even starts,
    // so handleApiRequest must guard it itself rather than let the promise
    // reject with nothing ever written to `res`.
    const r = await request(root, '/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      bodyError: 'stream boom',
    });
    expect(r.handled).toBe(true);
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

// The studio API is unauthenticated by design — a local, single-user tool. What
// stands between it and the rest of the web is therefore only what the browser
// tells the server about where a request came from.
describe('handleApiRequest — requests from other sites', () => {
  const HOST = '127.0.0.1:5173';
  const saved = async (root: string) =>
    readFile(path.join(root, 'diagrams', 'foo.diagram.json'), 'utf8').then(
      () => true,
      () => false,
    );

  it('refuses a save from another origin, and writes nothing', async () => {
    // The attack a page open in the same browser can mount with no preflight:
    // a "simple" POST (text/plain) whose body happens to be JSON.
    const root = await tempRoot();
    const r = await request(root, '/api/diagrams/foo', {
      method: 'POST',
      headers: { host: HOST, origin: 'https://evil.example', 'content-type': 'text/plain' },
      body: JSON.stringify(goodModel),
    });
    expect(r.handled).toBe(true);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('another origin');
    expect(await saved(root)).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it('refuses a bodyless cross-site POST — eject takes no body, so nothing about its content could give it away', async () => {
    const root = await tempRoot();
    const r = await request(root, '/api/diagrams/foo/eject', {
      method: 'POST',
      headers: { host: HOST, origin: 'http://localhost:3000' }, // another local dev server is another origin too
    });
    expect(r.status).toBe(403);
    await rm(root, { recursive: true, force: true });
  });

  it('refuses an opaque origin (a sandboxed frame, a file:// page)', async () => {
    const root = await tempRoot();
    const r = await request(root, '/api/diagrams', { headers: { host: HOST, origin: 'null' } });
    expect(r.status).toBe(403);
    await rm(root, { recursive: true, force: true });
  });

  it('lets the studio\'s own page through, on whatever address it was opened', async () => {
    const root = await tempRoot();
    // loopback by number and by name, IPv6, and a LAN address (the dev server
    // started with --host, opened from a tablet)
    for (const host of ['127.0.0.1:5173', 'localhost:5174', '[::1]:5173', '192.168.1.5:5173']) {
      const r = await request(root, '/api/diagrams/foo', {
        method: 'POST',
        headers: { host, origin: `http://${host}`, 'content-type': 'application/json' },
        body: JSON.stringify(goodModel),
      });
      expect(r.status, host).toBe(200);
    }
    expect(await saved(root)).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it('refuses a Host that is some other site\'s name, even when the Origin agrees with it', async () => {
    // DNS rebinding: the attacker's name is re-pointed at this machine, so the
    // browser sees the API as that site's OWN origin and the origin check alone
    // passes. A raw address cannot be re-pointed; only a name can.
    const root = await tempRoot();
    const r = await request(root, '/api/diagrams', {
      headers: { host: 'evil.example:5173', origin: 'http://evil.example:5173' },
    });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('evil.example');
    await rm(root, { recursive: true, force: true });
  });

  it('accepts loopback names and a request with no Host at all (no browser sends one)', async () => {
    const root = await tempRoot();
    const cases: Record<string, string>[] = [{ host: 'localhost:5173' }, { host: 'studio.localhost:5173' }, { host: 'LOCALHOST' }, {}];
    for (const headers of cases) {
      const r = await request(root, '/api/diagrams', { headers });
      expect(r.status, JSON.stringify(headers)).toBe(200);
    }
    await rm(root, { recursive: true, force: true });
  });

  it('takes JSON as application/json only, so a cross-site save cannot skip the preflight', async () => {
    // Belt and braces for a browser that sends no Origin: any content type a
    // page may use without asking first (text/plain, form encodings) is refused.
    const root = await tempRoot();
    const plain = await request(root, '/api/diagrams/foo', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'text/plain' },
      body: JSON.stringify(goodModel),
    });
    expect(plain.status).toBe(415);
    expect(await saved(root)).toBe(false);
    const json = await request(root, '/api/diagrams/foo', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(goodModel),
    });
    expect(json.status).toBe(200);
    await rm(root, { recursive: true, force: true });
  });

  it('still leaves an unmatched path to the host, whoever asked', async () => {
    const root = await tempRoot();
    const r = await request(root, '/index.html', { headers: { host: HOST, origin: 'https://evil.example' } });
    expect(r.handled).toBe(false);
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
