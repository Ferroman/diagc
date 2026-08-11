import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

// Type-only import: erased at build time so `@diagramming/core` never enters
// the config-load bundle (Node cannot resolve core's extensionless TS imports).
// Handlers are loaded through Vite's dev pipeline at request time instead.
type Handlers = typeof import('./handlers');

/** One route handler's result: handlers' JSON envelope plus readAsset's
 * optional `bytes`/`contentType`, which the wrapper streams raw. */
type RouteResult = Awaited<ReturnType<Handlers['readAsset']>>;

/** Capture groups, already-read body, raw request, and dirs for a request. */
interface RouteCtx {
  match: RegExpMatchArray;
  body: unknown;
  req: IncomingMessage;
  diagramsDir: string;
  artifactsDir: string;
}

type BodyMode = 'none' | 'json' | 'raw';

interface Route {
  method: string;
  /** non-global regex against `req.url`; captures are passed to the handler */
  pattern: RegExp;
  /** 'json' parses the body (malformed JSON → 400), 'raw' passes bytes
   * through, 'none' (default) leaves the body unread. */
  bodyMode?: BodyMode;
  handler: (h: Handlers, ctx: RouteCtx) => Promise<RouteResult>;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const readJson = async (req: IncomingMessage): Promise<unknown> => JSON.parse((await readBody(req)).toString('utf8'));

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Core exports an identical helper, but any core *value* import would drag it
 * into the config-load bundle, which Node cannot resolve — local copy. */
function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Route table: the first pattern a request matches wins, so entry order here
// IS the dispatch order (the rename entry must precede the generic save entry).
const ROUTES: Route[] = [
  // --- assets: raw body in, raw bytes out ---
  { method: 'POST', pattern: /^\/api\/assets$/, bodyMode: 'raw', handler: (h, c) => h.saveAsset(c.diagramsDir, String(c.req.headers['content-type'] ?? ''), c.body as Buffer) },
  { method: 'GET', pattern: /^\/api\/assets\/([^/]+)$/, handler: (h, c) => h.readAsset(c.diagramsDir, decodeURIComponent(c.match[1] ?? '')) },
  // --- library ---
  { method: 'GET', pattern: /^\/api\/library$/, handler: (h, c) => h.readLibrary(c.diagramsDir) },
  { method: 'PUT', pattern: /^\/api\/library$/, bodyMode: 'json', handler: (h, c) => h.saveLibrary(c.diagramsDir, c.body) },
  // --- diagrams & layouts ---
  { method: 'GET', pattern: /^\/api\/diagrams$/, handler: (h, c) => h.listDiagramModels(c.diagramsDir, c.artifactsDir) },
  { method: 'GET', pattern: /^\/api\/layouts$/, handler: (h, c) => h.listLayouts(c.diagramsDir) },
  { method: 'GET', pattern: /^\/api\/diagrams\/(.+)$/, handler: (h, c) => h.readDiagram(c.diagramsDir, decodeURIComponent(c.match[1] ?? '')) },
  // Rename must be checked before the generic save route, whose `(.+)`
  // would otherwise swallow `<from>/rename` as a filename.
  { method: 'POST', pattern: /^\/api\/diagrams\/(.+)\/rename$/, bodyMode: 'json', handler: async (h, c) => {
      const to = (c.body as { to?: unknown } | null)?.to;
      if (typeof to !== 'string') return { status: 400, body: { issues: [{ message: "Missing 'to' name" }] } };
      return h.renameDiagram(c.diagramsDir, decodeURIComponent(c.match[1] ?? ''), to);
    } },
  { method: 'POST', pattern: /^\/api\/(diagrams|layouts)\/(.+)$/, bodyMode: 'json', handler: (h, c) =>
      // decodeURIComponent throws on malformed percent-encoding — kept
      // inside the boundary so a bad name yields 500, never a crash.
      c.match[1] === 'diagrams'
        ? h.saveDiagram(c.diagramsDir, decodeURIComponent(c.match[2] ?? ''), c.body)
        : h.saveLayout(c.diagramsDir, decodeURIComponent(c.match[2] ?? ''), c.body) },
];

export function designerApi(diagramsDir: string, artifactsDir: string): Plugin {
  return {
    name: 'designer-api',
    configureServer(server: ViteDevServer) {
      const handlersPath = path.join(server.config.root, 'vite-plugins', 'handlers.ts');
      const loadHandlers = async (): Promise<Handlers> => (await server.ssrLoadModule(handlersPath)) as Handlers;
      server.middlewares.use((req, res, next) => {
        void (async () => {
          try {
            const url = req.url ?? '';
            const route = ROUTES.find((r) => r.method === req.method && r.pattern.test(url));
            if (route === undefined) {
              next();
              return;
            }
            // test() above already proved the match; re-running exposes the captures.
            const match = url.match(route.pattern) as RegExpMatchArray;
            let body: unknown = undefined;
            if (route.bodyMode === 'json') {
              try {
                body = await readJson(req);
              } catch {
                send(res, 400, { issues: [{ message: 'Invalid JSON body' }] });
                return;
              }
            } else if (route.bodyMode === 'raw') {
              body = await readBody(req);
            }
            const h = await loadHandlers();
            const r = await route.handler(h, { match, body, req, diagramsDir, artifactsDir });
            if (r.bytes !== undefined) {
              res.statusCode = 200;
              res.setHeader('content-type', r.contentType ?? 'application/octet-stream');
              res.end(r.bytes);
            } else {
              send(res, r.status, r.body);
            }
          } catch (e) {
            send(res, 500, { issues: [{ message: errMessage(e) }] });
          }
        })();
      });
    },
  };
}