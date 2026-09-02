import { chmod, mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ejectDiagramSource,
  isSafeName,
  listDiagramModels,
  listDrawings,
  listLayouts,
  readAsset,
  readComposedDiagram,
  readDiagram,
  readLibrary,
  renameDiagram,
  saveAsset,
  saveDiagram,
  saveDrawings,
  saveLayout,
  saveLibrary,
  walkFiles,
} from './handlers';

const goodModel = {
  version: 1,
  id: 'sketch',
  name: 'sketch',
  nodes: [{ id: 'a', name: 'a', type: 'service' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

describe('designer api handlers', () => {
  it('rejects unsafe names', () => {
    expect(isSafeName('my-diagram')).toBe(true);
    expect(isSafeName('team-a/app')).toBe(true);
    expect(isSafeName('../escape')).toBe(false);
    expect(isSafeName('UPPER')).toBe(false);
    expect(isSafeName('a..b')).toBe(false);
    expect(isSafeName('/abs')).toBe(false);
  });

  it('reads a saved diagram source back, with its layout when present', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'sketch', goodModel);
    const noLayout = await readDiagram(dir, 'sketch');
    expect(noLayout.status).toBe(200);
    expect(noLayout.body).toEqual({ model: goodModel });
    const layout = { version: 1, planes: { default: { a: { x: 1, y: 2 } } } };
    await saveLayout(dir, 'sketch', layout);
    const withLayout = await readDiagram(dir, 'sketch');
    expect(withLayout.body).toEqual({ model: goodModel, layout });
    expect((await readDiagram(dir, 'missing')).status).toBe(404);
    expect((await readDiagram(dir, '../escape')).status).toBe(400);
  });

  it('rejects invalid models with issues', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const res = await saveDiagram(dir, 'bad', {
      ...goodModel,
      relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('ghost');
  });

  it('rejects wrong shapes and bad names', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    expect((await saveDiagram(dir, 'x', { version: 2 })).status).toBe(400);
    expect((await saveDiagram(dir, '../x', goodModel)).status).toBe(400);
    expect((await saveLayout(dir, 'x', { version: 1, planes: { p: { n: { x: 'no', y: 0 } } } })).status).toBe(400);
  });

  it('rejects a version-1 payload missing model arrays without throwing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const res = await saveDiagram(dir, 'partial', { version: 1, nodes: [] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('version-1 diagram model');
  });

  it('saves layouts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const res = await saveLayout(dir, 'sketch', { version: 1, planes: { default: { a: { x: 1, y: 2 } } } });
    expect(res.status).toBe(200);
    expect(JSON.parse(await readFile(path.join(dir, 'sketch.layout.json'), 'utf8')).planes.default.a).toEqual({ x: 1, y: 2 });
  });

  it('renames a diagram: moves both files, rewrites id/name, frees the old name', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'old', goodModel);
    await saveLayout(dir, 'old', { version: 1, planes: { default: { a: { x: 1, y: 2 } } } });

    const res = await renameDiagram(dir, 'old', 'new');
    expect(res.status).toBe(200);

    const moved = await readDiagram(dir, 'new');
    expect(moved.status).toBe(200);
    const body = moved.body as { model: { id: string; name: string; nodes: unknown[] }; layout?: unknown };
    expect(body.model.id).toBe('new'); // internal id/name follow the rename
    expect(body.model.name).toBe('new');
    expect(body.model.nodes).toHaveLength(1); // content otherwise preserved
    expect(body.layout).toBeDefined(); // layout carried over
    expect((await readDiagram(dir, 'old')).status).toBe(404); // old name freed
  });

  it('renames a diagram with no layout file (layout absence is not an error)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'solo', goodModel);
    expect((await renameDiagram(dir, 'solo', 'solo-2')).status).toBe(200);
    expect((await readDiagram(dir, 'solo-2')).status).toBe(200);
  });

  it('rejects rename to an existing name (409), missing source (404), unsafe/same names (400)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'a', goodModel);
    await saveDiagram(dir, 'b', goodModel);
    expect((await renameDiagram(dir, 'a', 'b')).status).toBe(409); // b already exists
    expect((await readDiagram(dir, 'a')).status).toBe(200); // source untouched on conflict
    expect((await renameDiagram(dir, 'ghost', 'c')).status).toBe(404);
    expect((await renameDiagram(dir, 'a', '../escape')).status).toBe(400);
    expect((await renameDiagram(dir, 'a', 'a')).status).toBe(400); // same name
  });

  it('saves an asset under its content hash, dedupes, and reads it back', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const bytes = Buffer.from('fake-png-bytes');
    const res = await saveAsset(dir, 'image/png', bytes);
    expect(res.status).toBe(200);
    const { name } = res.body as { name: string };
    expect(name).toMatch(/^[a-f0-9]{12}\.png$/);
    // same bytes -> same name (dedupe), different type -> different ext
    expect(((await saveAsset(dir, 'image/png', bytes)).body as { name: string }).name).toBe(name);
    const read = await readAsset(dir, name);
    expect(read.status).toBe(200);
    expect(read.contentType).toBe('image/png');
    expect(read.bytes?.equals(bytes)).toBe(true);
  });

  it('rejects unknown asset types, oversize bodies, and unsafe reads', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    expect((await saveAsset(dir, 'application/pdf', Buffer.from('x'))).status).toBe(400);
    expect((await saveAsset(dir, 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(400);
    expect((await readAsset(dir, '../../etc/passwd')).status).toBe(400);
    expect((await readAsset(dir, 'aaaaaaaaaaaa.png')).status).toBe(404);
  });

  it('accepts a layout overlay carrying sizes and rejects malformed sizes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const good = { version: 1, planes: {}, sizes: { pic: { w: 200, h: 150 } } };
    expect((await saveLayout(dir, 'sketch', good)).status).toBe(200);
    const bad = { version: 1, planes: {}, sizes: { pic: { w: -1, h: 150 } } };
    expect((await saveLayout(dir, 'sketch', bad)).status).toBe(400);
  });

  it('saves drawings, lists them, and reads them back beside the model', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'sketch', goodModel);
    const drawings = { version: 1, planes: { default: [{ id: 'k1', points: [1, 2, 3, 4], width: 4 }] } };
    expect((await saveDrawings(dir, 'sketch', drawings)).status).toBe(200);
    expect(JSON.parse(await readFile(path.join(dir, 'sketch.drawings.json'), 'utf8'))).toEqual(drawings);
    expect((await listDrawings(dir)).body).toEqual({ drawings: { sketch: drawings } });
    expect((await readDiagram(dir, 'sketch')).body).toEqual({ model: goodModel, drawings });
  });

  it('rejects a malformed drawings payload and an unsafe name', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    expect((await saveDrawings(dir, 'x', { version: 1, planes: { default: [{ id: 'k1', points: [1] }] } })).status).toBe(400);
    expect((await saveDrawings(dir, '../x', { version: 1, planes: {} })).status).toBe(400);
  });

  it('deletes the sidecar when the overlay holds no strokes, and tolerates there being none', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const file = path.join(dir, 'sketch.drawings.json');
    await saveDrawings(dir, 'sketch', { version: 1, planes: { default: [{ id: 'k1', points: [1, 2] }] } });
    expect((await saveDrawings(dir, 'sketch', { version: 1, planes: { default: [] } })).status).toBe(200);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
    // a second empty save must not fail on the missing file
    expect((await saveDrawings(dir, 'sketch', { version: 1, planes: {} })).status).toBe(200);
  });

  it('rethrows a non-ENOENT unlink failure instead of reporting a successful erase', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDrawings(dir, 'sketch', { version: 1, planes: { default: [{ id: 'k1', points: [1, 2] }] } });
    // root ignores the write bit, so the chmod would not block the unlink and
    // the call would (correctly) succeed — there is nothing to assert there.
    if (process.getuid?.() === 0) return;
    await chmod(dir, 0o555);
    try {
      // The strokes are still on disk: answering `{ ok: true }` here would let
      // them resurrect on the next boot, so the failure must reach the caller.
      await expect(saveDrawings(dir, 'sketch', { version: 1, planes: {} })).rejects.toThrow();
    } finally {
      await chmod(dir, 0o755);
    }
  });

  it('skips a corrupt drawings file when listing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await writeFile(path.join(dir, 'bad.drawings.json'), '{not json');
    expect((await listDrawings(dir)).body).toEqual({ drawings: {} });
  });

  it('rename moves the drawings sidecar too', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'old', goodModel);
    const drawings = { version: 1, planes: { default: [{ id: 'k1', points: [1, 2] }] } };
    await saveDrawings(dir, 'old', drawings);
    expect((await renameDiagram(dir, 'old', 'new')).status).toBe(200);
    expect((await readDiagram(dir, 'new')).body).toEqual({ model: { ...goodModel, id: 'new', name: 'new' }, drawings });
    await expect(readFile(path.join(dir, 'old.drawings.json'), 'utf8')).rejects.toThrow();
  });
});

describe('ejectDiagramSource', () => {
  it('promotes a JSON diagram and reports ok', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'designer-eject-'));
    const diagramsDir = path.join(root, 'diagrams');
    const artifactsDir = path.join(root, 'artifacts');
    await mkdir(diagramsDir, { recursive: true });
    await saveDiagram(diagramsDir, 'shop', { ...goodModel, id: 'shop', name: 'shop' });

    const res = await ejectDiagramSource(diagramsDir, artifactsDir, 'shop');
    expect(res.status).toBe(200);
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.ts'), 'utf8')).resolves.toContain(
      "import { model } from '@diagramming/core';",
    );
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.json'), 'utf8')).rejects.toThrow();
  });

  it('404s an unknown name', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'designer-eject-'));
    const diagramsDir = path.join(root, 'diagrams');
    const artifactsDir = path.join(root, 'artifacts');
    await mkdir(diagramsDir, { recursive: true });

    const res = await ejectDiagramSource(diagramsDir, artifactsDir, 'missing');
    expect(res.status).toBe(404);
  });

  it('409s a TS-owned diagram', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'designer-eject-'));
    const diagramsDir = path.join(root, 'diagrams');
    const artifactsDir = path.join(root, 'artifacts');
    await mkdir(diagramsDir, { recursive: true });
    await writeFile(path.join(diagramsDir, 'shop.diagram.ts'), 'export default {} as never;\n');

    const res = await ejectDiagramSource(diagramsDir, artifactsDir, 'shop');
    expect(res.status).toBe(409);
  });

  it('400s an unsafe name', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'designer-eject-'));
    const diagramsDir = path.join(root, 'diagrams');
    const artifactsDir = path.join(root, 'artifacts');
    await mkdir(diagramsDir, { recursive: true });

    const res = await ejectDiagramSource(diagramsDir, artifactsDir, '../evil');
    expect(res.status).toBe(400);
  });
});

describe('walkFiles', () => {
  it('collects files by suffix, posix-joined with the suffix stripped', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'walk-'),);
    await mkdir(path.join(root, 'sub', 'deep'), { recursive: true });
    await writeFile(path.join(root, 'a.diagram.json'), '{}');
    await writeFile(path.join(root, 'sub', 'b.diagram.json'), '{}');
    await writeFile(path.join(root, 'sub', 'c.layout.json'), '{}');
    await writeFile(path.join(root, 'sub', 'deep', 'd.layout.json'), '{}');
    await writeFile(path.join(root, 'sub', 'b.layout.json'), '{}');
    await writeFile(path.join(root, 'sub', 'b.diagram.json.bak'), '{}'); // suffix mismatch
    expect((await walkFiles(root, '.diagram.json')).sort()).toEqual(['a', 'sub/b']);
    expect((await walkFiles(root, '.layout.json')).sort()).toEqual(['sub/b', 'sub/c', 'sub/deep/d']);
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] for a missing directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'walk-missing-'));
    expect(await walkFiles(path.join(root, 'nope'), '.json')).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});

describe('listDiagramModels', () => {
  it('serves compiled TS artifacts and JSON sources, marking sources editable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'diagc-models-'));
    const src = path.join(root, 'src');
    const art = path.join(root, 'art');
    await mkdir(src, { recursive: true });
    await mkdir(art, { recursive: true });
    const json = (id: string) => JSON.stringify({ version: 1, id, name: id, nodes: [], containment: [], relations: [], layers: [], planes: [] });
    // a JSON source (editable) that also has a compiled artifact; source must win
    await writeFile(path.join(src, 'flows.diagram.json'), json('flows'));
    await writeFile(path.join(art, 'flows.diagram.json'), json('flows-artifact'));
    // a TS-authored diagram: artifact only (not editable)
    await writeFile(path.join(art, 'arch.diagram.json'), json('arch'));

    const r = await listDiagramModels(src, art);
    const body = r.body as { diagrams: { name: string; model: { id: string } | null; editable: boolean }[] };
    const byName = Object.fromEntries(body.diagrams.map((d) => [d.name, d]));
    expect(byName['flows']?.editable).toBe(true);
    expect(byName['flows']?.model?.id).toBe('flows'); // source, not the artifact
    expect(byName['arch']?.editable).toBe(false);
    expect(byName['arch']?.model?.id).toBe('arch');
    await rm(root, { recursive: true, force: true });
  });

  it('reports an issue (never throws) for a corrupt model file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'diagc-models-'));
    const src = path.join(root, 'src');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'bad.diagram.json'), '{ not json');
    const r = await listDiagramModels(src, path.join(root, 'art'));
    const body = r.body as { diagrams: { name: string; model: unknown; issues: unknown[] }[] };
    expect(body.diagrams[0]?.model).toBeNull();
    expect(body.diagrams[0]?.issues.length).toBeGreaterThan(0);
    await rm(root, { recursive: true, force: true });
  });
});

describe('listLayouts', () => {
  it('returns overlays keyed by diagram name', async () => {
    const src = await mkdtemp(path.join(os.tmpdir(), 'diagc-layouts-'));
    await writeFile(path.join(src, 'flows.layout.json'), JSON.stringify({ version: 1, planes: {} }));
    const r = await listLayouts(src);
    const body = r.body as { layouts: Record<string, { version: number }> };
    expect(body.layouts['flows']?.version).toBe(1);
    await rm(src, { recursive: true, force: true });
  });
});

describe('composed reads', () => {
  // child declares a keyed node whose type ('database') disagrees with the
  // umbrella's own same-keyed node ('service') — an easy, deterministic
  // trigger for composeIncludes' type-difference warning — alongside a plain
  // (unkeyed) node that grafts straight through to 'u/x'.
  const child = {
    version: 1,
    id: 'child',
    name: 'child',
    nodes: [
      { id: 'x', name: 'X', type: 'service' },
      { id: 'shared', name: 'Shared (child)', type: 'database', key: 'shared-key' },
    ],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  const umbrella = {
    version: 1,
    id: 'umbrella',
    name: 'umbrella',
    nodes: [
      { id: 'shared', name: 'Shared', type: 'service', key: 'shared-key' },
      { id: 'u', name: 'Included', type: 'system', include: './child.diagram.json' },
    ],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  const brokenUmbrella = {
    version: 1,
    id: 'umbrella',
    name: 'umbrella',
    nodes: [{ id: 'u', name: 'Included', type: 'system', include: './missing.diagram.json' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };

  it('listDiagramModels composes an editable umbrella and surfaces warnings as issues', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await writeFile(path.join(dir, 'child.diagram.json'), JSON.stringify(child));
    await writeFile(path.join(dir, 'umbrella.diagram.json'), JSON.stringify(umbrella));

    const r = await listDiagramModels(dir, path.join(dir, 'art'));
    const body = r.body as {
      diagrams: { name: string; model: { nodes: { id: string }[] } | null; issues: { message: string }[]; editable: boolean }[];
    };
    const entry = body.diagrams.find((d) => d.name === 'umbrella');
    expect(entry?.editable).toBe(true);
    expect(entry?.model?.nodes.some((n) => n.id === 'u/x')).toBe(true); // grafted child content
    expect(entry?.issues.some((i) => /shared-key/.test(i.message) && /type/.test(i.message))).toBe(true);
  });

  it('listDiagramModels falls back to the raw model when compose fails', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await writeFile(path.join(dir, 'umbrella.diagram.json'), JSON.stringify(brokenUmbrella));

    const r = await listDiagramModels(dir, path.join(dir, 'art'));
    const body = r.body as {
      diagrams: { name: string; model: { nodes: { include?: string }[] } | null; issues: { message: string }[]; editable: boolean }[];
    };
    const entry = body.diagrams.find((d) => d.name === 'umbrella');
    expect(entry?.editable).toBe(true);
    expect(entry?.model?.nodes[0]?.include).toBe('./missing.diagram.json'); // raw, unexpanded
    expect(entry?.issues[0]?.message).toMatch(/missing/);
  });

  it('readComposedDiagram returns the composed model', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await writeFile(path.join(dir, 'child.diagram.json'), JSON.stringify(child));
    await writeFile(path.join(dir, 'umbrella.diagram.json'), JSON.stringify(umbrella));

    const res = await readComposedDiagram(dir, 'umbrella');
    expect(res.status).toBe(200);
    const body = res.body as { model: { nodes: { id: string }[] } };
    expect(body.model.nodes.some((n) => n.id === 'u/x')).toBe(true);
  });

  it('readComposedDiagram passes non-include sources through', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await saveDiagram(dir, 'sketch', goodModel);

    const res = await readComposedDiagram(dir, 'sketch');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ model: goodModel });
  });

  it('readComposedDiagram 404s an unknown name', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    expect((await readComposedDiagram(dir, 'missing')).status).toBe(404);
  });

  it('readComposedDiagram 409s a failing compose', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await writeFile(path.join(dir, 'umbrella.diagram.json'), JSON.stringify(brokenUmbrella));

    const res = await readComposedDiagram(dir, 'umbrella');
    expect(res.status).toBe(409);
    const body = res.body as { issues: { message: string }[] };
    expect(body.issues[0]?.message).toMatch(/missing/);
  });
});

describe('library handlers', () => {
  const emptyLib = { categories: [], entries: [] };
  const goodLib = {
    categories: [{ id: 'gcp', name: 'GCP' }],
    entries: [{ id: 'gcp-bq', category: 'gcp', name: 'BigQuery', template: { type: 'image', image: 'a1b2c3.svg', width: 64, height: 64 } }],
  };

  it('reads an empty library when the file is absent', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const r = await readLibrary(dir);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(emptyLib);
  });

  it('round-trips a valid library', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    expect((await saveLibrary(dir, goodLib)).status).toBe(200);
    const r = await readLibrary(dir);
    expect(r.body).toEqual(goodLib);
  });

  it('round-trips a shape (silhouette) entry', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const withShape = {
      categories: [{ id: 'gcp', name: 'GCP' }],
      entries: [{ id: 'gcp-sil', category: 'gcp', name: 'Silhouette', template: { shape: 'a1b2c3.svg', color: '#08427b' } }],
    };
    expect((await saveLibrary(dir, withShape)).status).toBe(200);
    expect((await readLibrary(dir)).body).toEqual(withShape);
  });

  it('rejects a non-object shape', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    expect((await saveLibrary(dir, { categories: {} })).status).toBe(400);
    expect((await saveLibrary(dir, null)).status).toBe(400);
  });

  it('rejects an entry referencing an unknown category', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const bad = { categories: [], entries: [{ id: 'x', category: 'nope', name: 'X', template: { color: '#000' } }] };
    expect((await saveLibrary(dir, bad)).status).toBe(400);
  });

  it('rejects duplicate ids and bad template field types', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const dup = { categories: [{ id: 'c', name: 'C' }], entries: [
      { id: 'e', category: 'c', name: 'E', template: { color: '#000' } },
      { id: 'e', category: 'c', name: 'E2', template: { color: '#111' } },
    ] };
    expect((await saveLibrary(dir, dup)).status).toBe(400);
    const badField = { categories: [{ id: 'c', name: 'C' }], entries: [
      { id: 'e', category: 'c', name: 'E', template: { width: 'big' } },
    ] };
    expect((await saveLibrary(dir, badField)).status).toBe(400);
  });
});
