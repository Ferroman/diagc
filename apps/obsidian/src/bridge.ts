// Relative import, not the bare `diagc` specifier: diagc's package.json
// exports only "." (-> src/compile.ts), so a subpath like `diagc/src/api`
// is blocked by node's export-map encapsulation — confirmed against the
// live package.json rather than assumed. apps/studio/vite-plugins/designer-
// api.ts reaches the same module the same way (a relative path into the
// package), it just also needs a type-only import + ssrLoadModule because
// that file loads inside Vite's *config* bundle; this file is ordinary
// application source built by esbuild (and by Vite under vitest), so a
// plain value import resolves without that extra indirection.
import { runRoute, type ApiContext, type Handlers, type RouteRequest, type RouteResponse } from '../../../packages/diagc/src/api/dispatch';

/** studio HostAdapter.apiFetch backed by the in-process route table: the same
 * routes and handlers both HTTP hosts run, minus the HTTP. */
export function makeApiFetch(
  ctx: ApiContext,
  handlers: Handlers,
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const method = init?.method ?? 'GET';
    // RequestInit bodies arrive as string (JSON saves) or Blob/File (asset
    // uploads); Response normalizes any of them to bytes.
    const bytes =
      init?.body === undefined
        ? undefined
        : typeof init.body === 'string'
          ? Buffer.from(init.body)
          : Buffer.from(await new Response(init.body).arrayBuffer());
    const contentType = new Headers(init?.headers).get('content-type');
    const request: RouteRequest = {
      method,
      url,
      ...(bytes !== undefined ? { body: bytes } : {}),
      ...(contentType !== null ? { contentType } : {}),
    };
    const r: RouteResponse | undefined = await runRoute(request, ctx, handlers);
    if (r === undefined) return new Response('Not found', { status: 404 });
    if (r.bytes !== undefined) {
      return new Response(new Uint8Array(r.bytes), {
        status: r.status,
        headers: { 'content-type': r.contentType ?? 'application/octet-stream' },
      });
    }
    return new Response(JSON.stringify(r.body ?? null), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}
