import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AUTH_TOKENS_ENV, parseAuthTokens, resolveInclude } from './includes';

const fixtures = path.resolve(import.meta.dirname, '../test-fixtures');

describe('resolveInclude', () => {
  it('resolves relative paths against the declaring file', async () => {
    const from = path.join(fixtures, 'umbrella.diagram.json');
    const src = await resolveInclude('./svc-permission.diagram.json', from);
    expect(src.ref).toBe(path.join(fixtures, 'svc-permission.diagram.json'));
    expect(src.model.id).toBe('permission');
  });

  it('rejects missing files with a readable error', async () => {
    await expect(resolveInclude('./nope.diagram.json', path.join(fixtures, 'umbrella.diagram.json'))).rejects.toThrow();
  });

  describe('over http', () => {
    let server: Server;
    let base = '';
    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === '/perm.diagram.json') {
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              version: 1,
              id: 'perm',
              name: 'perm',
              nodes: [],
              containment: [],
              relations: [],
              layers: [],
              planes: [],
            }),
          );
        } else {
          res.statusCode = 404;
          res.end('nope');
        }
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const addr = server.address();
      base = typeof addr === 'object' && addr !== null ? `http://127.0.0.1:${addr.port}` : '';
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('fetches absolute URLs and resolves URL-relative includes', async () => {
      const src = await resolveInclude(`${base}/perm.diagram.json`, '/anywhere/local.diagram.json');
      expect(src.model.id).toBe('perm');
      expect(src.ref).toBe(`${base}/perm.diagram.json`);
      // relative spec against an http fromRef resolves as a URL
      const rel = await resolveInclude('./perm.diagram.json', `${base}/umbrella.diagram.json`);
      expect(rel.ref).toBe(`${base}/perm.diagram.json`);
    });

    it('turns HTTP errors into thrown errors', async () => {
      await expect(resolveInclude(`${base}/missing.diagram.json`, '/x.diagram.json')).rejects.toThrow(/404/);
    });
  });
});

describe('parseAuthTokens', () => {
  it('reads bearer and basic entries keyed by host', () => {
    const tokens = parseAuthTokens(' ghp_abc@raw.githubusercontent.com ; alice:s3cret@git.example.com:8443 ');
    expect(tokens.get('raw.githubusercontent.com')).toBe('Bearer ghp_abc');
    expect(tokens.get('git.example.com:8443')).toBe(`Basic ${Buffer.from('alice:s3cret').toString('base64')}`);
  });

  it('skips empty and malformed entries', () => {
    expect([...parseAuthTokens(';no-host@;@nohost;plain;')]).toEqual([]);
    expect(parseAuthTokens(undefined).size).toBe(0);
  });

  it('lowercases the host so it matches URL.host', () => {
    expect(parseAuthTokens('t@Raw.GitHubUserContent.com').get('raw.githubusercontent.com')).toBe('Bearer t');
  });
});

describe('resolveInclude with credentials', () => {
  const model = {
    version: 1,
    id: 'priv',
    name: 'priv',
    nodes: [],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  const fetchSpy = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(model), { status: 200 }));
  const authOf = (spy: ReturnType<typeof fetchSpy>, call = 0): string | undefined =>
    (spy.mock.calls[call]?.[1]?.headers as Record<string, string> | undefined)?.authorization;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('sends the token to its host, including for URL-relative includes', async () => {
    vi.stubEnv(AUTH_TOKENS_ENV, 'ghp_abc@raw.githubusercontent.com');
    const spy = fetchSpy();
    await resolveInclude('https://raw.githubusercontent.com/o/r/main/a.diagram.json', '/x.diagram.json');
    await resolveInclude('./b.diagram.json', 'https://raw.githubusercontent.com/o/r/main/a.diagram.json');
    expect(authOf(spy, 0)).toBe('Bearer ghp_abc');
    expect(authOf(spy, 1)).toBe('Bearer ghp_abc');
  });

  it('sends nothing to another host', async () => {
    vi.stubEnv(AUTH_TOKENS_ENV, 'ghp_abc@raw.githubusercontent.com');
    const spy = fetchSpy();
    await resolveInclude('https://example.com/a.diagram.json', '/x.diagram.json');
    expect(authOf(spy)).toBeUndefined();
  });

  it('sends nothing over plain http', async () => {
    vi.stubEnv(AUTH_TOKENS_ENV, 'ghp_abc@example.com');
    const spy = fetchSpy();
    await resolveInclude('http://example.com/a.diagram.json', '/x.diagram.json');
    expect(authOf(spy)).toBeUndefined();
  });

  it('hints at the variable when an unauthenticated fetch is refused', async () => {
    vi.stubEnv(AUTH_TOKENS_ENV, '');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 404 }));
    await expect(
      resolveInclude('https://raw.githubusercontent.com/o/r/main/a.diagram.json', '/x.diagram.json'),
    ).rejects.toThrow(
      `HTTP 404 fetching https://raw.githubusercontent.com/o/r/main/a.diagram.json — if the host is private, set ${AUTH_TOKENS_ENV}=<token>@raw.githubusercontent.com`,
    );
  });

  it('never puts the token in an error', async () => {
    vi.stubEnv(AUTH_TOKENS_ENV, 'ghp_abc@raw.githubusercontent.com');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 401 }));
    const err = await resolveInclude(
      'https://raw.githubusercontent.com/o/r/main/a.diagram.json',
      '/x.diagram.json',
    ).catch((e: Error) => e);
    expect(String(err)).toMatch(/HTTP 401/);
    expect(String(err)).not.toMatch(/ghp_abc|DIAGC_AUTH_TOKENS/);
  });
});
