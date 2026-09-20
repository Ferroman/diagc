import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { errMessage } from '@diagc/core';
import { handleApiRequest } from './api/dispatch';
import * as handlers from './api/handlers';

/** Content types for what a Vite build actually emits, plus the image formats a
 * diagram can reference. Anything else is streamed as octet-stream. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

export const contentTypeFor = (file: string): string =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

export interface ServeOptions {
  /** prebuilt studio bundle (index.html + assets + library) */
  studioDir: string;
  diagramsDir: string;
  artifactsDir: string;
  /** first port to try; the server walks upward when one is taken */
  port?: number;
  host?: string;
}

export interface StudioServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Resolve a request path to a file inside `root`, or undefined if it escapes.
 *
 * Traversal is *clamped*, not rejected: `posix.normalize` collapses `..` against
 * the leading `/`, so `/a/../../etc/passwd` becomes `/etc/passwd` and then
 * resolves under `root`. A request can therefore only ever name something inside
 * the bundle. The explicit boundary check below is not redundant — on Windows a
 * backslash segment survives posix normalization and would escape at
 * `path.resolve` — and it is the assertion that keeps this function honest if
 * the normalization above is ever changed. */
export function resolveStatic(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '');
  } catch {
    return undefined; // malformed percent-encoding
  }
  // Normalizing against '/' first collapses '..' segments before they are ever
  // joined to a real directory, so the resolve below cannot climb out.
  const rel = path.posix.normalize(decoded).replace(/^(\.\.(\/|$))+/, '').replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return undefined;
  return full;
}

async function sendFile(res: ServerResponse, file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    res.statusCode = 200;
    res.setHeader('content-type', contentTypeFor(file));
    res.setHeader('content-length', String(info.size));
    // The studio is a localhost tool reading files the user is actively
    // editing; caching a bundle across a reinstall would serve a stale studio.
    res.setHeader('cache-control', 'no-store');
    await new Promise<void>((resolve, reject) => {
      createReadStream(file).on('error', reject).on('end', resolve).pipe(res);
    });
    return true;
  } catch {
    return false;
  }
}

/** Listen on the first free port at or above `port`. */
function listen(server: Server, port: number, host: string, attempts = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number, left: number): void => {
      const onError = (e: NodeJS.ErrnoException): void => {
        server.removeListener('listening', onListening);
        if (e.code === 'EADDRINUSE' && left > 0) {
          tryPort(p + 1, left - 1);
          return;
        }
        reject(e);
      };
      const onListening = (): void => {
        server.removeListener('error', onError);
        // Read the bound port back rather than echoing the requested one: port
        // 0 means "any free port", and the caller needs the real one to print.
        const addr = server.address();
        resolve(typeof addr === 'object' && addr !== null ? addr.port : p);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(p, host);
    };
    tryPort(port, attempts);
  });
}

/** Serve the prebuilt studio and its read/write API over plain http.
 *
 * This is the installed-from-npm counterpart to the Vite dev server: same API
 * routes (they come from the same table), no bundler, no workspace. The studio
 * itself is an ordinary SPA that only ever talks to `/api/*`, which is what
 * makes a static bundle behave identically here. */
export async function startStudioServer(opts: ServeOptions): Promise<StudioServer> {
  const { studioDir, diagramsDir, artifactsDir } = opts;
  const host = opts.host ?? '127.0.0.1';
  const index = path.join(studioDir, 'index.html');

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        if (await handleApiRequest(req, res, { diagramsDir, artifactsDir }, handlers)) return;
        const file = resolveStatic(studioDir, req.url ?? '/');
        if (file === undefined) {
          res.statusCode = 400;
          res.end('Bad request');
          return;
        }
        if (await sendFile(res, file)) return;
        // Unmatched API paths must 404 as API, not fall back to the SPA shell —
        // a JSON caller should never have to parse HTML to learn it missed.
        if ((req.url ?? '').startsWith('/api/')) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ issues: [{ message: `No such API route: ${req.url ?? ''}` }] }));
          return;
        }
        if (await sendFile(res, index)) return;
        res.statusCode = 404;
        res.end('Not found');
      } catch (e) {
        res.statusCode = 500;
        res.end(errMessage(e));
      }
    })();
  });

  const port = await listen(server, opts.port ?? 5173, host);
  return {
    url: `http://${host}:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
