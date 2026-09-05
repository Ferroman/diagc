// @vitest-environment node
//
// The bridge has no browser surface (no window, no DOM) — it is plain node
// code driving diagc's route table in-process. Forcing the node environment
// here (rather than the repo-wide jsdom default) sidesteps jsdom's stricter
// Buffer/Response handling and matches what the Obsidian host actually runs
// under (Electron's Node context, not a browser).
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
// Real handlers, real filesystem, no mocks — the point of this test is that
// makeApiFetch reproduces fetch semantics over diagc's actual route table
// (the same table both HTTP hosts run), not a stand-in for it. Relative path
// because `diagc`'s package.json only exports ".": a subpath import of
// `diagc/src/api` is blocked by node's export-map encapsulation (verified
// against the live package.json, not assumed) — mirrors how
// apps/studio/vite-plugins/designer-api.ts reaches the same module, just
// without that file's Vite-config-bundle constraint (this isn't a Vite
// config file, so a plain value import is fine here).
import * as handlers from '../../../packages/diagc/src/api/handlers';
import { makeApiFetch } from './bridge';

let ctx: { diagramsDir: string; artifactsDir: string };

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-bridge-'));
  ctx = { diagramsDir: path.join(dir, 'src'), artifactsDir: path.join(dir, '.artifacts') };
  await fs.mkdir(ctx.diagramsDir, { recursive: true });
});

describe('makeApiFetch', () => {
  it('round-trips a diagram save and read through fetch semantics', async () => {
    const apiFetch = makeApiFetch(ctx, handlers);
    // version: 1 is a required discriminant on DiagramModel (core/src/types.ts)
    // — saveDiagram's own arraysOk check 400s without it.
    const model = { version: 1, nodes: [{ id: 'a', name: 'A' }], containment: [], relations: [], layers: [], planes: [] };
    const save = await apiFetch('/api/diagrams/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(save.ok).toBe(true);
    const read = await apiFetch('/api/diagrams/test');
    const body = (await read.json()) as { model: { nodes: unknown[] } };
    expect(body.model.nodes).toHaveLength(1);
  });

  it('answers 404 for an unrouted url', async () => {
    expect((await makeApiFetch(ctx, handlers)('/nope')).status).toBe(404);
  });
});
