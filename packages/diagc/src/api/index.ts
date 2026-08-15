// The studio's read/write API, shared by two hosts: the Vite dev middleware in
// `apps/studio` (which loads this module lazily, through Vite's own pipeline)
// and the packaged `diagc studio` server, which has no Vite at all. One route
// table, so an added route cannot exist in only one of them.
export * as handlers from './handlers';
export { handleApiRequest, type ApiContext, type Handlers } from './dispatch';
export { matchRoute, ROUTES, type Route, type RouteCtx } from './routes';
