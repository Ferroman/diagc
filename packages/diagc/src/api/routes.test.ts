import { describe, expect, it } from 'vitest';
import type { Handlers } from './dispatch';
import { matchRoute, ROUTES, type RouteResult } from './routes';

const PAGES = { shellPath: 'S', libraryDir: 'L' };

/** A handlers object that records each call as `[name, ...args]` and answers 200 with the name. */
function spyHandlers(): { handlers: Handlers; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const handlers = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]): Promise<RouteResult> => {
          calls.push([name, ...args]);
          return Promise.resolve({ status: 200, body: name });
        },
    },
  ) as unknown as Handlers;
  return { handlers, calls };
}

/** Run the route `method url` matches against the spy, as `runRoute` would with these dirs. */
async function dispatch(
  method: string,
  url: string,
  send: { body?: unknown; contentType?: string } = {},
): Promise<{ result: RouteResult; calls: unknown[][] }> {
  const route = matchRoute(method, url);
  if (route === undefined) throw new Error(`no route for ${method} ${url}`);
  const { handlers, calls } = spyHandlers();
  const match = url.match(route.pattern) as RegExpMatchArray;
  const ctx = {
    match,
    body: send.body,
    contentType: send.contentType,
    diagramsDir: 'D',
    artifactsDir: 'A',
    pages: PAGES,
  };
  const result = await route.handler(handlers, ctx);
  return { result, calls };
}

describe('the route table', () => {
  it('lists the routes in dispatch order, each with how it reads the body', () => {
    expect(ROUTES.map((r) => `${r.method} ${r.pattern.source} ${r.bodyMode ?? 'none'}`)).toEqual([
      'POST ^\\/api\\/assets$ raw',
      'GET ^\\/api\\/assets\\/([^/]+)$ none',
      'GET ^\\/api\\/library$ none',
      'PUT ^\\/api\\/library$ json',
      'GET ^\\/api\\/diagrams$ none',
      'GET ^\\/api\\/layouts$ none',
      'GET ^\\/api\\/drawings$ none',
      'GET ^\\/api\\/diagrams\\/(.+)\\/composed$ none',
      'GET ^\\/api\\/diagrams\\/(.+)$ none',
      'POST ^\\/api\\/diagrams\\/(.+)\\/rename$ json',
      'POST ^\\/api\\/diagrams\\/(.+)\\/eject$ none',
      'POST ^\\/api\\/(diagrams|layouts|drawings)\\/(.+)$ json',
      'GET ^\\/api\\/pages\\/(.+)$ none',
    ]);
  });

  it('puts composed, rename and eject ahead of the generic routes, whose (.+) would take the word as a name', () => {
    const at = (method: string, url: string) => ROUTES.indexOf(matchRoute(method, url)!);
    expect(at('GET', '/api/diagrams/team/shop/composed')).toBe(7);
    expect(at('GET', '/api/diagrams/team/shop')).toBe(8);
    expect(at('POST', '/api/diagrams/team/shop/rename')).toBe(9);
    expect(at('POST', '/api/diagrams/team/shop/eject')).toBe(10);
    expect(at('POST', '/api/diagrams/team/shop')).toBe(11);
    // Alone, the word is a name like any other.
    expect(at('GET', '/api/diagrams/composed')).toBe(8);
    expect(at('POST', '/api/diagrams/rename')).toBe(11);
    expect(at('POST', '/api/diagrams/eject')).toBe(11);
  });

  it.each([
    ['GET', '/api/assets/abc.png', ['abc.png']],
    ['GET', '/api/assets/a%2Fb.png', ['a%2Fb.png']],
    ['GET', '/api/diagrams/team/shop/composed', ['team/shop']],
    ['GET', '/api/diagrams/a/composed/composed', ['a/composed']],
    ['GET', '/api/diagrams/team/shop', ['team/shop']],
    ['GET', '/api/diagrams/team%2Fshop', ['team%2Fshop']],
    ['POST', '/api/diagrams/team/shop/rename', ['team/shop']],
    ['POST', '/api/diagrams/a/rename/rename', ['a/rename']],
    ['POST', '/api/diagrams/team/shop/eject', ['team/shop']],
    ['POST', '/api/diagrams/team/shop', ['diagrams', 'team/shop']],
    ['POST', '/api/layouts/team/shop', ['layouts', 'team/shop']],
    ['POST', '/api/drawings/team/shop', ['drawings', 'team/shop']],
    ['POST', '/api/layouts/a/rename', ['layouts', 'a/rename']],
    ['POST', '/api/assets', []],
    ['GET', '/api/library', []],
    ['PUT', '/api/library', []],
    ['GET', '/api/diagrams', []],
    ['GET', '/api/layouts', []],
    ['GET', '/api/drawings', []],
    ['GET', '/api/pages/team/shop', ['team/shop']],
  ])('%s %s captures %j', (method, url, captures) => {
    const route = matchRoute(method, url)!;
    expect(url.match(route.pattern)!.slice(1)).toEqual(captures);
  });

  it('matches the method and the whole url, and nothing else', () => {
    expect(matchRoute(undefined, '/api/diagrams')).toBeUndefined();
    expect(matchRoute('DELETE', '/api/diagrams/shop')).toBeUndefined();
    expect(matchRoute('PUT', '/api/diagrams/shop')).toBeUndefined();
    expect(matchRoute('POST', '/api/library')).toBeUndefined();
    expect(matchRoute('GET', '/api/assets')).toBeUndefined();
    expect(matchRoute('GET', '/api/assets/a/b.png')).toBeUndefined();
    expect(matchRoute('GET', '/api/diagrams/')).toBeUndefined();
    expect(matchRoute('GET', '/api/diagrams?x=1')).toBeUndefined();
    expect(matchRoute('GET', '/api/nope')).toBeUndefined();
    expect(matchRoute('GET', '/index.html')).toBeUndefined();
    expect(matchRoute('POST', '/api/diagrams')).toBeUndefined();
    expect(matchRoute('GET', '/api/pages')).toBeUndefined();
    expect(matchRoute('POST', '/api/pages/shop')).toBeUndefined();
  });

  it('hands each route its handler, the decoded name and the directories', async () => {
    const bytes = Buffer.from('png');
    const cases: [string, string, { body?: unknown; contentType?: string }, unknown[]][] = [
      ['POST', '/api/assets', { body: bytes, contentType: 'image/png' }, ['saveAsset', 'D', 'image/png', bytes]],
      ['POST', '/api/assets', { body: bytes }, ['saveAsset', 'D', '', bytes]],
      ['GET', '/api/assets/a%62c.png', {}, ['readAsset', 'D', 'abc.png']],
      ['GET', '/api/library', {}, ['readLibrary', 'D']],
      ['PUT', '/api/library', { body: { x: 1 } }, ['saveLibrary', 'D', { x: 1 }]],
      ['GET', '/api/diagrams', {}, ['listDiagramModels', 'D', 'A']],
      ['GET', '/api/layouts', {}, ['listLayouts', 'D']],
      ['GET', '/api/drawings', {}, ['listDrawings', 'D']],
      ['GET', '/api/diagrams/team%2Fshop/composed', {}, ['readComposedDiagram', 'D', 'team/shop']],
      ['GET', '/api/diagrams/team/a%20b', {}, ['readDiagram', 'D', 'team/a b']],
      ['POST', '/api/diagrams/a%20b/rename', { body: { to: 'c%20d' } }, ['renameDiagram', 'D', 'a b', 'c%20d']],
      ['POST', '/api/diagrams/a%20b/eject', {}, ['ejectDiagramSource', 'D', 'A', 'a b']],
      ['POST', '/api/diagrams/a%20b', { body: { m: 1 } }, ['saveDiagram', 'D', 'a b', { m: 1 }]],
      ['POST', '/api/layouts/a%20b', { body: { l: 1 } }, ['saveLayout', 'D', 'a b', { l: 1 }]],
      ['POST', '/api/drawings/a%20b', { body: { d: 1 } }, ['saveDrawings', 'D', 'a b', { d: 1 }]],
      ['GET', '/api/pages/team/a%20b', {}, ['exportPage', 'D', 'A', PAGES, 'team/a b']],
    ];
    for (const [method, url, send, call] of cases) {
      const { result, calls } = await dispatch(method, url, send);
      expect(calls, `${method} ${url}`).toEqual([call]);
      expect(result).toEqual({ status: 200, body: call[0] });
    }
  });

  it('answers a rename with no string `to` itself, without calling the handler', async () => {
    for (const body of [{}, { to: 5 }, null, []]) {
      const { result, calls } = await dispatch('POST', '/api/diagrams/shop/rename', { body });
      expect(calls).toEqual([]);
      expect(result).toEqual({ status: 400, body: { issues: [{ message: "Missing 'to' name" }] } });
    }
  });
});
