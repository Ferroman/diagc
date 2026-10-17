import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
import { DG_DATA_SENTINEL } from '../publish/html';
import { exportPage, type PageSources } from './pages';

const SHELL = `<!doctype html><script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'page-'));
  const diagramsDir = path.join(root, 'src');
  const artifactsDir = path.join(root, 'artifacts');
  const libraryDir = path.join(root, 'library');
  await mkdir(path.join(diagramsDir, 'assets'), { recursive: true });
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(path.join(libraryDir, 'shapes'), { recursive: true });
  await writeFile(path.join(libraryDir, 'shapes', 'person.svg'), '<svg/>');
  const shellPath = path.join(root, 'viewer.html');
  await writeFile(shellPath, SHELL);
  const sources: PageSources = { shellPath, libraryDir };
  return { root, diagramsDir, artifactsDir, sources };
}

const write = (dir: string, file: string, data: unknown) =>
  mkdir(path.dirname(path.join(dir, file)), { recursive: true }).then(() =>
    writeFile(path.join(dir, file), JSON.stringify(data)),
  );

/** The data a page was stamped with. */
function stamped(html: string): { model: DiagramModel; layout?: unknown; drawings?: unknown } {
  const json = /<script id="dg-data" type="application\/json">(.*)<\/script>/s.exec(html)?.[1] ?? 'null';
  return JSON.parse(json) as { model: DiagramModel; layout?: unknown; drawings?: unknown };
}

const body = (r: { body: unknown }) => r.body as { html: string; warnings: string[] };

describe('exportPage', () => {
  it('stamps the source as the studio shows it, with its layout, drawings and pictures inlined', async () => {
    const f = await fixture();
    const b = model('Shop');
    b.node('a', { name: 'Alpha', shape: '/library/shapes/person.svg' });
    await write(f.diagramsDir, 'team/shop.diagram.json', b.toJSON());
    const layout = { version: 1, planes: { default: { a: { x: 1, y: 2 } } } };
    await write(f.diagramsDir, 'team/shop.layout.json', layout);
    const drawings = { version: 1, planes: { default: [{ id: 's1', points: [0, 0, 5, 5] }] } };
    await write(f.diagramsDir, 'team/shop.drawings.json', drawings);

    const res = await exportPage(f.diagramsDir, f.artifactsDir, f.sources, 'team/shop');
    expect(res.status).toBe(200);
    const { html, warnings } = body(res);
    expect(warnings).toEqual([]);
    expect(html).toMatch(/^<!doctype html>\n<!--\n {2}Rendered by diagc/);
    const data = stamped(html);
    expect(data.model.name).toBe('Shop');
    expect(data.model.nodes[0]?.shape).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(data.layout).toEqual(layout);
    expect(data.drawings).toEqual(drawings);
  });

  it('prefers the source to a stale artifact, and stamps a compiled diagram from its artifact', async () => {
    const f = await fixture();
    await write(f.diagramsDir, 'shop.diagram.json', model('Fresh').toJSON());
    await write(f.artifactsDir, 'shop.diagram.json', model('Stale').toJSON());
    await write(f.artifactsDir, 'Generated.diagram.json', model('From TS').toJSON());

    expect(stamped(body(await exportPage(f.diagramsDir, f.artifactsDir, f.sources, 'shop')).html).model.name).toBe(
      'Fresh',
    );
    // a compiled diagram's name comes from its .ts file and need not be one the studio saves
    const generated = await exportPage(f.diagramsDir, f.artifactsDir, f.sources, 'Generated');
    expect(stamped(body(generated).html).model.name).toBe('From TS');
  });

  it('says what it could not pack in, and still builds the page', async () => {
    const f = await fixture();
    const b = model('Shop');
    b.node('a', { name: 'Alpha', type: 'image', image: 'deadbeef0000.png' });
    await write(f.diagramsDir, 'shop.diagram.json', b.toJSON());
    await write(f.diagramsDir, 'shop.drawings.json', { not: 'drawings' });

    const res = await exportPage(f.diagramsDir, f.artifactsDir, f.sources, 'shop');
    expect(res.status).toBe(200);
    expect(body(res).warnings).toEqual([
      expect.stringMatching(/^publish: ignoring malformed drawings sidecar for diagram "shop" /),
      expect.stringMatching(/^publish: could not read asset "deadbeef0000.png" for diagram "shop" /),
    ]);
    expect(stamped(body(res).html).drawings).toBeUndefined();
  });

  it('refuses a name the studio does not list, however it is spelled', async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, 'outside.diagram.json'), JSON.stringify(model('Outside').toJSON()));
    for (const name of ['missing', '../outside', '/etc/passwd']) {
      expect((await exportPage(f.diagramsDir, f.artifactsDir, f.sources, name)).status, name).toBe(404);
    }
  });

  it('refuses a diagram whose model cannot be read', async () => {
    const f = await fixture();
    await writeFile(path.join(f.diagramsDir, 'broken.diagram.json'), '{ not json');
    const res = await exportPage(f.diagramsDir, f.artifactsDir, f.sources, 'broken');
    expect(res).toEqual({ status: 500, body: { issues: [{ message: "Could not read model for 'broken'" }] } });
  });

  it('says where the viewer page should be when it is not there, and when the host has none', async () => {
    const f = await fixture();
    await write(f.diagramsDir, 'shop.diagram.json', model('Shop').toJSON());
    const missing = { ...f.sources, shellPath: path.join(f.root, 'nope.html') };
    const res = await exportPage(f.diagramsDir, f.artifactsDir, missing, 'shop');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).toContain(missing.shellPath);
    expect(await exportPage(f.diagramsDir, f.artifactsDir, undefined, 'shop')).toEqual({
      status: 501,
      body: {
        issues: [{ message: 'This studio cannot build web pages: its host has no viewer page to build them from.' }],
      },
    });
  });
});
