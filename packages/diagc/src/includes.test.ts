import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveInclude } from './includes';

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
          res.end(JSON.stringify({ version: 1, id: 'perm', name: 'perm', nodes: [], containment: [], relations: [], layers: [], planes: [] }));
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
