// Type-only: the route table names handlers but never imports their module, so
// a host that loads this table (Vite's config bundle) does not drag
// `@diagramming/core` in with it. `dispatch` takes the handlers as an argument.
type Handlers = typeof import('./handlers');

/** One route handler's result: handlers' JSON envelope plus readAsset's
 * optional `bytes`/`contentType`, which the wrapper streams raw. */
export type RouteResult = Awaited<ReturnType<Handlers['readAsset']>>;

/** Capture groups, already-read body, content-type, and dirs for a request. */
export interface RouteCtx {
  match: RegExpMatchArray;
  body: unknown;
  /** content-type of the raw body (only the asset-upload route reads it) */
  contentType?: string;
  diagramsDir: string;
  artifactsDir: string;
}

export type BodyMode = 'none' | 'json' | 'raw';

export interface Route {
  method: string;
  /** non-global regex against `req.url`; captures are passed to the handler */
  pattern: RegExp;
  /** 'json' parses the body (malformed JSON → 400), 'raw' passes bytes
   * through, 'none' (default) leaves the body unread. */
  bodyMode?: BodyMode;
  handler: (h: Handlers, ctx: RouteCtx) => Promise<RouteResult>;
}

// Route table: the first pattern a request matches wins, so entry order here
// IS the dispatch order (the rename entry must precede the generic save entry).
export const ROUTES: Route[] = [
  // --- assets: raw body in, raw bytes out ---
  { method: 'POST', pattern: /^\/api\/assets$/, bodyMode: 'raw', handler: (h, c) => h.saveAsset(c.diagramsDir, c.contentType ?? '', c.body as Buffer) },
  { method: 'GET', pattern: /^\/api\/assets\/([^/]+)$/, handler: (h, c) => h.readAsset(c.diagramsDir, decodeURIComponent(c.match[1] ?? '')) },
  // --- library ---
  { method: 'GET', pattern: /^\/api\/library$/, handler: (h, c) => h.readLibrary(c.diagramsDir) },
  { method: 'PUT', pattern: /^\/api\/library$/, bodyMode: 'json', handler: (h, c) => h.saveLibrary(c.diagramsDir, c.body) },
  // --- diagrams & layouts ---
  { method: 'GET', pattern: /^\/api\/diagrams$/, handler: (h, c) => h.listDiagramModels(c.diagramsDir, c.artifactsDir) },
  { method: 'GET', pattern: /^\/api\/layouts$/, handler: (h, c) => h.listLayouts(c.diagramsDir) },
  { method: 'GET', pattern: /^\/api\/drawings$/, handler: (h, c) => h.listDrawings(c.diagramsDir) },
  // Composed read must precede the generic read, whose `(.+)` would swallow
  // `<name>/composed` as a filename.
  { method: 'GET', pattern: /^\/api\/diagrams\/(.+)\/composed$/, handler: (h, c) => h.readComposedDiagram(c.diagramsDir, decodeURIComponent(c.match[1] ?? '')) },
  { method: 'GET', pattern: /^\/api\/diagrams\/(.+)$/, handler: (h, c) => h.readDiagram(c.diagramsDir, decodeURIComponent(c.match[1] ?? '')) },
  // Rename must be checked before the generic save route, whose `(.+)`
  // would otherwise swallow `<from>/rename` as a filename.
  { method: 'POST', pattern: /^\/api\/diagrams\/(.+)\/rename$/, bodyMode: 'json', handler: async (h, c) => {
      const to = (c.body as { to?: unknown } | null)?.to;
      if (typeof to !== 'string') return { status: 400, body: { issues: [{ message: "Missing 'to' name" }] } };
      return h.renameDiagram(c.diagramsDir, decodeURIComponent(c.match[1] ?? ''), to);
    } },
  // Eject must also precede the generic save route, whose `(.+)` would
  // swallow `<name>/eject` as a filename.
  { method: 'POST', pattern: /^\/api\/diagrams\/(.+)\/eject$/, handler: (h, c) => h.ejectDiagramSource(c.diagramsDir, c.artifactsDir, decodeURIComponent(c.match[1] ?? '')) },
  { method: 'POST', pattern: /^\/api\/(diagrams|layouts|drawings)\/(.+)$/, bodyMode: 'json', handler: (h, c) => {
      // decodeURIComponent throws on malformed percent-encoding — kept
      // inside the boundary so a bad name yields 500, never a crash.
      const name = decodeURIComponent(c.match[2] ?? '');
      return c.match[1] === 'diagrams'
        ? h.saveDiagram(c.diagramsDir, name, c.body)
        : c.match[1] === 'layouts'
          ? h.saveLayout(c.diagramsDir, name, c.body)
          : h.saveDrawings(c.diagramsDir, name, c.body);
    } },
];

/** The route matching `method` + `url`, or undefined. First match wins. */
export function matchRoute(method: string | undefined, url: string): Route | undefined {
  return ROUTES.find((r) => r.method === method && r.pattern.test(url));
}
