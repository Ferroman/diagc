import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ViteDevServer } from 'vite';
import { designerApi } from './designer-api';

// The route table and handlers themselves are tested in
// packages/diagc/src/api. What is left here is the adapter: does the plugin
// register a middleware, hand /api/* to the shared dispatcher with the right
// dirs, and get out of the way for everything else.

/** Minimal ViteDevServer stand-in. The plugin calls `ssrLoadModule` (to load the
 * api module) and `middlewares.use`; the test runtime can import the real api
 * directly, which is what Vite's SSR pipeline would end up giving it. */
function fakeServer(root: string): {
  middleware: (req: unknown, res: unknown, next: () => void) => void;
  loads: string[];
} {
  let middleware: (req: unknown, res: unknown, next: () => void) => void = () => {};
  const loads: string[] = [];
  const server = {
    config: { root },
    ssrLoadModule: async (id: string) => {
      loads.push(id);
      return await import('../../../packages/diagc/src/api/index');
    },
    middlewares: {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
        middleware = fn;
      },
    },
  };
  // Vite types the hook as ObjectHook; invoke its callable form directly.
  const configure = designerApi(path.join(root, 'diagrams'), path.join(root, 'artifacts'))
    .configureServer as unknown as (server: ViteDevServer) => void;
  configure(server as unknown as ViteDevServer);
  return { middleware, loads };
}

interface Result {
  status: number;
  body: unknown;
  next: boolean;
}

async function request(
  srv: { middleware: (req: unknown, res: unknown, next: () => void) => void },
  url: string,
): Promise<Result> {
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => (resolveDone = resolve));
  let status = 0;
  let calledNext = false;
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const req = Object.assign(Readable.from([]), { url, method: 'GET', headers: {} });
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
    body: headers['content-type'] === 'application/json' && raw.length > 0 ? JSON.parse(raw.toString('utf8')) : undefined,
    next: calledNext,
  };
}

describe('designerApi plugin', () => {
  it('serves an /api route through the shared dispatcher, with the configured dirs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-plugin-'));
    const src = path.join(root, 'diagrams');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'flows.layout.json'), JSON.stringify({ version: 1, planes: {} }));
    const r = await request(fakeServer(root), '/api/layouts');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ layouts: { flows: { version: 1, planes: {} } } });
    await rm(root, { recursive: true, force: true });
  });

  it('hands an unmatched /api path back to the connect chain', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-plugin-'));
    const r = await request(fakeServer(root), '/api/not-a-route');
    expect(r.next).toBe(true);
    expect(r.status).toBe(0); // middleware never wrote a response
    await rm(root, { recursive: true, force: true });
  });

  it('skips the api module load entirely for non-/api requests', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-plugin-'));
    const srv = fakeServer(root);
    const r = await request(srv, '/src/main.tsx');
    expect(r.next).toBe(true);
    expect(srv.loads).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('loads the api from the diagc package, not from the studio app', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ds-plugin-'));
    const srv = fakeServer(root);
    await request(srv, '/api/layouts');
    expect(srv.loads[0]).toMatch(/packages[/\\]diagc[/\\]src[/\\]api[/\\]index\.ts$/);
    await rm(root, { recursive: true, force: true });
  });
});
