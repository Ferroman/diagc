import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

// The routes and handlers live in `packages/diagc/src/api` so the packaged CLI's
// studio server and this dev middleware dispatch the same table (see that
// module's header). Both imports here are TYPE-only and the runtime load goes
// through `ssrLoadModule`: a value import would put `@diagramming/core` in
// Vite's config-load bundle, which Node cannot resolve (core's TS sources use
// extensionless imports). Same constraint as before the move — only the path
// changed.
type Api = typeof import('../../../packages/diagc/src/api');

/** Absolute path to the api entry. `__dirname` is what Vite's config bundle
 * gives us (vite.config.ts already relies on it), and the server's
 * `fs.allow` already covers the monorepo root. */
const API_ENTRY = path.resolve(__dirname, '../../../packages/diagc/src/api/index.ts');

export function designerApi(diagramsDir: string, artifactsDir: string): Plugin {
  return {
    name: 'designer-api',
    configureServer(server: ViteDevServer) {
      const loadApi = async (): Promise<Api> => (await server.ssrLoadModule(API_ENTRY)) as Api;
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        void (async () => {
          // Only /api/* can match a route; anything else skips the module load
          // entirely so ordinary asset requests never pay for it.
          if (!(req.url ?? '').startsWith('/api/')) {
            next();
            return;
          }
          const api = await loadApi();
          const handled = await api.handleApiRequest(req, res, { diagramsDir, artifactsDir }, api.handlers);
          if (!handled) next();
        })();
      });
    },
  };
}
