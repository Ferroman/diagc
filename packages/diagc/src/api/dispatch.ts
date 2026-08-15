import type { IncomingMessage, ServerResponse } from 'node:http';
import { errMessage } from '@diagramming/core';
import { matchRoute } from './routes';

/** The handler module, passed in rather than imported: the Vite adapter loads it
 * through the dev pipeline, the packaged server imports it directly. */
export type Handlers = typeof import('./handlers');

/** Where a studio session reads and writes. */
export interface ApiContext {
  diagramsDir: string;
  artifactsDir: string;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Run the matching API route for `req`, writing the response.
 *
 * Returns false — having written nothing — when no route matches, so a host can
 * fall through to its own static-file serving (packaged server) or to the rest
 * of the connect chain (Vite). Every thrown error becomes a 500 envelope; the
 * boundary never rejects. */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  handlers: Handlers,
): Promise<boolean> {
  const url = req.url ?? '';
  const route = matchRoute(req.method, url);
  if (route === undefined) return false;
  try {
    // matchRoute already proved the match; re-running exposes the captures.
    const match = url.match(route.pattern) as RegExpMatchArray;
    let body: unknown = undefined;
    if (route.bodyMode === 'json') {
      try {
        body = JSON.parse((await readBody(req)).toString('utf8'));
      } catch {
        send(res, 400, { issues: [{ message: 'Invalid JSON body' }] });
        return true;
      }
    } else if (route.bodyMode === 'raw') {
      body = await readBody(req);
    }
    const r = await route.handler(handlers, { match, body, req, ...ctx });
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
  return true;
}
