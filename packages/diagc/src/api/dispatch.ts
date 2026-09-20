import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { errMessage } from '@diagramming/core';
import { matchRoute, type Route } from './routes';

/** The handler module, passed in rather than imported: the Vite adapter loads it
 * through the dev pipeline, the packaged server imports it directly. */
export type Handlers = typeof import('./handlers');

/** Where a studio session reads and writes. */
export interface ApiContext {
  diagramsDir: string;
  artifactsDir: string;
}

/** A request in transport-neutral terms: no `IncomingMessage`, so a host with
 * no HTTP objects at all (the Obsidian in-process bridge) can still drive a
 * route. */
export interface RouteRequest {
  method: string;
  url: string;
  body?: Buffer;
  /** only the asset-upload route reads this */
  contentType?: string;
}

/** A route's outcome in transport-neutral terms: either a JSON-able `body`
 * (the common case) or raw `bytes` plus `contentType` (asset reads), mirroring
 * the two branches `handleApiRequest` writes to the wire today. */
export interface RouteResponse {
  status: number;
  body?: unknown;
  bytes?: Buffer;
  contentType?: string;
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

/** Run the matching route with plain values — no HTTP anywhere. undefined means
 * no route matched (the HTTP wrapper falls through to static serving; the
 * Obsidian host answers 404). Errors become envelopes; this boundary never
 * rejects, same contract as before the extraction. */
export async function runRoute(
  request: RouteRequest,
  ctx: ApiContext,
  handlers: Handlers,
): Promise<RouteResponse | undefined> {
  const route = matchRoute(request.method, request.url);
  if (route === undefined) return undefined;
  try {
    // matchRoute already proved the match; re-running exposes the captures.
    const match = request.url.match(route.pattern) as RegExpMatchArray;
    let body: unknown = undefined;
    if (route.bodyMode === 'json') {
      try {
        body = JSON.parse((request.body ?? Buffer.alloc(0)).toString('utf8'));
      } catch {
        return { status: 400, body: { issues: [{ message: 'Invalid JSON body' }] } };
      }
    } else if (route.bodyMode === 'raw') {
      body = request.body ?? Buffer.alloc(0);
    }
    const r = await route.handler(handlers, { match, body, contentType: request.contentType, ...ctx });
    return r.bytes !== undefined
      ? { status: 200, bytes: r.bytes, contentType: r.contentType ?? 'application/octet-stream' }
      : { status: r.status, body: r.body };
  } catch (e) {
    return { status: 500, body: { issues: [{ message: errMessage(e) }] } };
  }
}

/** The hostname of a `Host` header value, port and IPv6 brackets stripped. */
function hostnameOf(host: string): string {
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']'));
  const colon = host.lastIndexOf(':');
  return (colon < 0 ? host : host.slice(0, colon)).toLowerCase();
}

/**
 * Why `req` must not reach `route`, or null when it may.
 *
 * The API carries no authentication — it is a local, single-user tool — so any
 * page open in the same browser can ADDRESS it. What keeps such a page from
 * using it is the browser's own account of where a request comes from:
 *
 * - `Origin`, sent on every cross-origin request that can change anything, must
 *   be the origin the API itself was reached on. Without this a "simple" POST
 *   (text/plain body, or none — eject) from any site saves, renames and ejects
 *   diagrams with no preflight to stop it.
 * - `Host` must not be some other site's name. DNS rebinding re-points an
 *   attacker's name at this machine, after which the browser treats the API as
 *   that site's OWN origin and the check above passes. Only a name can be
 *   re-pointed, so a raw address is fine — which is what keeps the dev server
 *   usable from another device (`--host`, opened by LAN address). Same rule as
 *   Vite's `allowedHosts` default. No `Host` at all is not a browser.
 * - A JSON route takes `application/json` only: every content type a page may
 *   send WITHOUT a preflight is refused, for the browser that sends no `Origin`.
 *
 * HTTP only, by design: `runRoute` stays free of it for the in-process Obsidian
 * host, which has no browser on the other side.
 */
function refusal(req: IncomingMessage, route: Route): { status: number; message: string } | null {
  const host = req.headers.host;
  if (host !== undefined) {
    const name = hostnameOf(host);
    if (name !== 'localhost' && !name.endsWith('.localhost') && isIP(name) === 0) {
      return { status: 403, message: `Refused: '${name}' is not a local address. Open the studio by localhost or by IP address.` };
    }
  }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let originHost: string | undefined;
    try {
      originHost = new URL(origin).host;
    } catch {
      // `null` (a sandboxed frame, a file:// page) or junk: not this studio's page
    }
    if (originHost === undefined || host === undefined || originHost.toLowerCase() !== host.toLowerCase()) {
      return { status: 403, message: 'Refused: the request comes from another origin.' };
    }
  }
  if (route.bodyMode === 'json' && !String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return { status: 415, message: 'This route takes application/json.' };
  }
  return null;
}

/** Run the matching API route for `req`, writing the response.
 *
 * Returns false — having written nothing — when no route matches, so a host can
 * fall through to its own static-file serving (packaged server) or to the rest
 * of the connect chain (Vite). Every thrown error becomes a 500 envelope; the
 * boundary never rejects.
 *
 * Thin wrapper over `runRoute`: match first so an unmatched url returns false
 * having read nothing (preserving the fall-through contract), then drain the
 * body and hand plain values to `runRoute`. The wrapper always drains the
 * request body once matched — routes with `bodyMode: 'none'` are GETs or
 * bodyless POSTs, so draining is a no-op semantically, just an unread stream
 * getting consumed.
 *
 * `readBody` is awaited outside `runRoute`'s own try/catch (it has to be — the
 * bytes are part of the request `runRoute` takes), so it needs its own guard
 * here: a body-stream failure (a client disconnecting mid-upload, realistic
 * for the raw-body assets route) must still land as the same 500 envelope,
 * never an unhandled rejection with no response written.
 *
 * A request from another site is refused before its body is read — see
 * `refusal`. Only MATCHED routes are guarded: an unmatched path still returns
 * false untouched, and what the host serves there (the studio bundle) is public. */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  handlers: Handlers,
): Promise<boolean> {
  const url = req.url ?? '';
  const route = matchRoute(req.method, url);
  if (route === undefined) return false;
  const refused = refusal(req, route);
  if (refused !== null) {
    send(res, refused.status, { issues: [{ message: refused.message }] });
    return true;
  }
  let body: Buffer;
  try {
    body = await readBody(req);
  } catch (e) {
    send(res, 500, { issues: [{ message: errMessage(e) }] });
    return true;
  }
  const r = (await runRoute(
    { method: req.method ?? '', url, body, contentType: String(req.headers['content-type'] ?? '') },
    ctx,
    handlers,
  ))!; // matched above, so runRoute cannot return undefined here
  if (r.bytes !== undefined) {
    res.statusCode = 200;
    res.setHeader('content-type', r.contentType ?? 'application/octet-stream');
    res.end(r.bytes);
  } else {
    send(res, r.status, r.body);
  }
  return true;
}
