import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate, type DiagramModel } from '@diagc/core/internal';
import {
  ejectDiagramSource,
  listDiagramModels,
  readComposedDiagram,
  readDiagram,
  renameDiagram,
  saveDiagram,
  type DiagramEntry,
} from './diagrams';
import { runRoute } from './dispatch';
import * as handlers from './handlers';
import { saveDrawings, saveLayout } from './sidecars';

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

describe('diagram handlers', () => {
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

  it("keeps a diagram's title across a rename; a title that was its id follows the new one", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await saveDiagram(dir, 'shop', { ...goodModel, id: 'shop', name: 'Order Processing' });
    expect((await renameDiagram(dir, 'shop', 'orders-v2')).status).toBe(200);
    expect((await readDiagram(dir, 'orders-v2')).body).toMatchObject({
      model: { id: 'orders-v2', name: 'Order Processing' },
    });
    await saveDiagram(dir, 'cart', { ...goodModel, id: 'cart', name: 'cart' });
    expect((await renameDiagram(dir, 'cart', 'basket')).status).toBe(200);
    expect((await readDiagram(dir, 'basket')).body).toMatchObject({ model: { id: 'basket', name: 'basket' } });
  });

  it('refuses to rename or save onto a name a .diagram.ts source owns', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await writeFile(path.join(dir, 'tsone.diagram.ts'), 'export default {};\n');
    await saveDiagram(dir, 'shop', goodModel);
    const renamed = await renameDiagram(dir, 'shop', 'tsone');
    expect(renamed.status).toBe(409);
    expect(JSON.stringify(renamed.body)).toContain("'tsone' is already TypeScript-owned");
    expect((await readDiagram(dir, 'shop')).status).toBe(200);
    const saved = await saveDiagram(dir, 'tsone', goodModel);
    expect(saved.status).toBe(409);
    expect(JSON.stringify(saved.body)).toContain("'tsone' is already TypeScript-owned");
    await expect(readFile(path.join(dir, 'tsone.diagram.json'), 'utf8')).rejects.toThrow();
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

describe('a rename that fails', () => {
  /** Every file under `dir`, with its content: what a failed rename must leave as it was. */
  async function files(dir: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const e of await readdir(dir, { recursive: true, withFileTypes: true })) {
      if (e.isFile())
        out[path.relative(dir, path.join(e.parentPath, e.name))] = await readFile(
          path.join(e.parentPath, e.name),
          'utf8',
        );
    }
    return out;
  }
  /** A diagram with both sidecars under `name`. */
  async function diagramAt(dir: string, name: string): Promise<void> {
    await saveDiagram(dir, name, goodModel);
    await saveLayout(dir, name, { version: 1, planes: { default: { a: { x: 1, y: 2 } } } });
    await saveDrawings(dir, name, { version: 1, planes: { default: [{ id: 'k1', points: [1, 2] }] } });
  }
  const renameVia = async (dir: string, from: string, to: string) =>
    (await runRoute(
      { method: 'POST', url: `/api/diagrams/${from}/rename`, body: Buffer.from(JSON.stringify({ to })) },
      { diagramsDir: dir, artifactsDir: path.join(dir, 'art') },
      handlers,
    ))!.status;

  it('leaves everything under the old name when a sidecar cannot move', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await diagramAt(dir, 'shop');
    // The layout moves first; a folder in the drawings' way stops the second move.
    await mkdir(path.join(dir, 'orders.drawings.json'));
    await writeFile(path.join(dir, 'orders.drawings.json', 'keep'), '');
    const before = await files(dir);
    expect(await renameVia(dir, 'shop', 'orders')).toBe(500);
    expect(await files(dir)).toEqual(before);
  });

  it('leaves everything under the old name when a sidecar cannot leave its folder', async () => {
    // root ignores the write bit, so nothing would fail
    if (process.getuid?.() === 0) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await diagramAt(dir, 'team/shop');
    const before = await files(dir);
    await chmod(path.join(dir, 'team'), 0o555);
    try {
      expect(await renameVia(dir, 'team/shop', 'shop')).toBe(500);
    } finally {
      await chmod(path.join(dir, 'team'), 0o755);
    }
    expect(await files(dir)).toEqual(before);
  });

  it('leaves everything under the old name when the old source cannot be deleted', async () => {
    if (process.getuid?.() === 0) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    // No sidecars, so the first step that fails is the delete.
    await saveDiagram(dir, 'team/shop', goodModel);
    const before = await files(dir);
    await chmod(path.join(dir, 'team'), 0o555);
    try {
      expect(await renameVia(dir, 'team/shop', 'shop')).toBe(500);
    } finally {
      await chmod(path.join(dir, 'team'), 0o755);
    }
    expect(await files(dir)).toEqual(before);
  });

  it('leaves everything under the old name when the new folder cannot be written', async () => {
    if (process.getuid?.() === 0) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    await diagramAt(dir, 'shop');
    await mkdir(path.join(dir, 'team'));
    const before = await files(dir);
    await chmod(path.join(dir, 'team'), 0o555);
    try {
      expect(await renameVia(dir, 'shop', 'team/shop')).toBe(500);
    } finally {
      await chmod(path.join(dir, 'team'), 0o755);
    }
    expect(await files(dir)).toEqual(before);
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
      "import { model } from '@diagc/core';",
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

describe('listDiagramModels', () => {
  it('serves compiled TS artifacts and JSON sources, marking sources editable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'diagc-models-'));
    const src = path.join(root, 'src');
    const art = path.join(root, 'art');
    await mkdir(src, { recursive: true });
    await mkdir(art, { recursive: true });
    const json = (id: string) =>
      JSON.stringify({ version: 1, id, name: id, nodes: [], containment: [], relations: [], layers: [], planes: [] });
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

  it('lists a source whose name the API refuses as read-only, saying why, and still renders it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'diagc-models-'));
    const src = path.join(root, 'src');
    await mkdir(src, { recursive: true });
    const model = {
      version: 1,
      id: 'shop',
      name: 'Shop',
      nodes: [],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    await writeFile(path.join(src, 'My_Shop.diagram.json'), JSON.stringify(model));

    const r = await listDiagramModels(src, path.join(root, 'art'));
    const [entry] = (
      r.body as { diagrams: { name: string; model: unknown; editable: boolean; issues: { message: string }[] }[] }
    ).diagrams;
    expect(entry).toMatchObject({ name: 'My_Shop', model, editable: false });
    expect(entry!.issues).toEqual([{ message: expect.stringMatching(/'My_Shop'.*lowercase letters, digits/) }]);
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
  // composeIncludes only grafts — it never checks the result for id collisions
  // — so an umbrella-declared node whose id collides with a namespaced include
  // id (here 'perm/svc' twice) composes cleanly and only validate() catches it.
  // Mirrors test-fixtures/umbrella-collision.diagram.json.
  const collisionChild = {
    version: 1,
    id: 'permission',
    name: 'Permission service',
    nodes: [{ id: 'svc', name: 'Permission svc', type: 'service' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  const collisionUmbrella = {
    version: 1,
    id: 'coll',
    name: 'Architecture (collision)',
    nodes: [
      { id: 'perm/svc', name: 'Existing', type: 'service' },
      { id: 'perm', name: 'Permission', type: 'system', include: './permission.diagram.json' },
    ],
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
      diagrams: {
        name: string;
        model: { nodes: { id: string }[] } | null;
        issues: { message: string }[];
        editable: boolean;
      }[];
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
      diagrams: {
        name: string;
        model: { nodes: { include?: string }[] } | null;
        issues: { message: string }[];
        editable: boolean;
      }[];
    };
    const entry = body.diagrams.find((d) => d.name === 'umbrella');
    expect(entry?.editable).toBe(true);
    expect(entry?.model?.nodes[0]?.include).toBe('./missing.diagram.json'); // raw, unexpanded
    expect(entry?.issues[0]?.message).toMatch(/missing/);
  });

  it('listDiagramModels falls back to the raw model when the composed result fails validation', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await writeFile(path.join(dir, 'permission.diagram.json'), JSON.stringify(collisionChild));
    await writeFile(path.join(dir, 'coll.diagram.json'), JSON.stringify(collisionUmbrella));

    const r = await listDiagramModels(dir, path.join(dir, 'art'));
    const body = r.body as {
      diagrams: {
        name: string;
        model: { nodes: { id: string; include?: string }[] } | null;
        issues: { message: string }[];
        editable: boolean;
      }[];
    };
    const entry = body.diagrams.find((d) => d.name === 'coll');
    expect(entry?.editable).toBe(true);
    // the composed result is invalid (duplicate 'perm/svc'), so the raw model —
    // still unexpanded, its include node still a placeholder — is what renders
    expect(entry?.model?.nodes.some((n) => n.include === './permission.diagram.json')).toBe(true);
    expect(entry?.issues.some((i) => /perm\/svc/.test(i.message))).toBe(true);
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

  it('readComposedDiagram 409s when the composed result fails validation', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-compose-'));
    await writeFile(path.join(dir, 'permission.diagram.json'), JSON.stringify(collisionChild));
    await writeFile(path.join(dir, 'coll.diagram.json'), JSON.stringify(collisionUmbrella));

    const res = await readComposedDiagram(dir, 'coll');
    expect(res.status).toBe(409);
    const body = res.body as { issues: { message: string }[] };
    expect(body.issues.some((i) => /perm\/svc/.test(i.message))).toBe(true);
  });
});

// What a host sends for each answer, key order included: the hosts serialise a
// handler's body as it is, so a reordered key or a reworded refusal is a change a
// client sees.
const wire = (res: { status: number; body: unknown }): string => `${res.status} ${JSON.stringify(res.body)}`;
/** The one-message refusal the handlers answer with. */
const refusal = (status: number, message: string): string => wire({ status, body: { issues: [{ message }] } });
const tempDir = () => mkdtemp(path.join(tmpdir(), 'designer-pins-'));
/** What a save writes: the payload as sent, two-space indented, with a closing newline. */
const saved = (payload: unknown): string => `${JSON.stringify(payload, null, 2)}\n`;

describe('diagram answers', () => {
  it('readDiagram: the name, then the source; the layout and the drawings after the model, each only when readable', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'Bad.diagram.json'), JSON.stringify(goodModel));
    expect(wire(await readDiagram(dir, 'Bad'))).toBe(refusal(400, "Unsafe name 'Bad'"));
    expect(wire(await readDiagram(dir, 'nope'))).toBe(refusal(404, "No diagram source 'nope'"));
    await writeFile(path.join(dir, 'corrupt.diagram.json'), '{');
    expect(wire(await readDiagram(dir, 'corrupt'))).toBe(refusal(404, "No diagram source 'corrupt'"));
    const layout = { version: 1, planes: {} };
    const drawings = { version: 1, planes: {} };
    await writeFile(path.join(dir, 'sketch.diagram.json'), JSON.stringify(goodModel));
    await writeFile(path.join(dir, 'sketch.drawings.json'), JSON.stringify(drawings));
    await writeFile(path.join(dir, 'sketch.layout.json'), JSON.stringify(layout));
    expect(wire(await readDiagram(dir, 'sketch'))).toBe(
      wire({ status: 200, body: { model: goodModel, layout, drawings } }),
    );
    await writeFile(path.join(dir, 'sketch.layout.json'), '{');
    expect(wire(await readDiagram(dir, 'sketch'))).toBe(wire({ status: 200, body: { model: goodModel, drawings } }));
  });

  it('readComposedDiagram: the name, then the source; a source with no includes passes through unvalidated', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'Bad.diagram.json'), JSON.stringify(goodModel));
    expect(wire(await readComposedDiagram(dir, 'Bad'))).toBe(refusal(400, "Unsafe name 'Bad'"));
    expect(wire(await readComposedDiagram(dir, 'nope'))).toBe(refusal(404, "No diagram source 'nope'"));
    await writeFile(path.join(dir, 'corrupt.diagram.json'), '{');
    expect(wire(await readComposedDiagram(dir, 'corrupt'))).toBe(refusal(404, "No diagram source 'corrupt'"));
    const invalid = { ...goodModel, relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }] };
    await writeFile(path.join(dir, 'invalid.diagram.json'), JSON.stringify(invalid));
    expect(wire(await readComposedDiagram(dir, 'invalid'))).toBe(wire({ status: 200, body: { model: invalid } }));
  });

  it('readComposedDiagram answers the composed model, its warnings after it only when there are some', async () => {
    const dir = await tempDir();
    const child = {
      ...goodModel,
      id: 'child',
      name: 'child',
      nodes: [{ id: 'x', name: 'X', type: 'service', key: 'k' }],
    };
    const include = { id: 'u', name: 'U', type: 'system', include: './child.diagram.json' };
    await writeFile(path.join(dir, 'child.diagram.json'), JSON.stringify(child));
    await writeFile(path.join(dir, 'quiet.diagram.json'), JSON.stringify({ ...goodModel, nodes: [include] }));
    await writeFile(
      path.join(dir, 'noisy.diagram.json'),
      JSON.stringify({ ...goodModel, nodes: [{ id: 'x', name: 'X', type: 'database', key: 'k' }, include] }),
    );
    const quiet = await readComposedDiagram(dir, 'quiet');
    expect(quiet.status).toBe(200);
    expect(Object.keys(quiet.body as object)).toEqual(['model']);
    const noisy = await readComposedDiagram(dir, 'noisy');
    expect(noisy.status).toBe(200);
    expect(Object.keys(noisy.body as object)).toEqual(['model', 'warnings']);
    expect((noisy.body as { warnings: string[] }).warnings).toEqual([expect.stringMatching(/'k'/)]);
  });

  it('saveDiagram: the name, then a .diagram.ts twin, then the shape, then validation', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'Bad.diagram.ts'), '');
    await writeFile(path.join(dir, 'owned.diagram.ts'), '');
    expect(wire(await saveDiagram(dir, 'Bad', null))).toBe(refusal(400, "Unsafe name 'Bad'"));
    expect(wire(await saveDiagram(dir, 'owned', null))).toBe(
      refusal(409, `'owned' is already TypeScript-owned (${path.join(dir, 'owned.diagram.ts')})`),
    );
    for (const payload of [null, [], 'x', { ...goodModel, version: 2 }, { ...goodModel, planes: {} }]) {
      expect(wire(await saveDiagram(dir, 'x', payload))).toBe(refusal(400, 'Not a version-1 diagram model'));
    }
    const invalid = { ...goodModel, relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }] };
    expect(wire(await saveDiagram(dir, 'x', invalid))).toBe(
      wire({ status: 400, body: { issues: validate(invalid as DiagramModel) } }),
    );
    await expect(readdir(dir)).resolves.toEqual(expect.not.arrayContaining(['x.diagram.json']));
    expect(wire(await saveDiagram(dir, 'team/x', goodModel))).toBe(wire({ status: 200, body: { ok: true } }));
    expect(await readFile(path.join(dir, 'team', 'x.diagram.json'), 'utf8')).toBe(saved(goodModel));
  });

  it('renameDiagram: the names, then the same name, the source, the target, a .diagram.ts twin, the parse', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'corrupt.diagram.json'), '{');
    await writeFile(path.join(dir, 'taken.diagram.json'), JSON.stringify(goodModel));
    await writeFile(path.join(dir, 'taken.diagram.ts'), '');
    await writeFile(path.join(dir, 'owned.diagram.ts'), '');
    // the source name is checked first, then the target's
    expect(wire(await renameDiagram(dir, 'Bad', 'Worse'))).toBe(refusal(400, "Unsafe name 'Bad'"));
    expect(wire(await renameDiagram(dir, 'nope', 'Worse'))).toBe(refusal(400, "Unsafe name 'Worse'"));
    expect(wire(await renameDiagram(dir, 'nope', 'nope'))).toBe(refusal(400, 'New name is the same as the old'));
    expect(wire(await renameDiagram(dir, 'nope', 'taken'))).toBe(refusal(404, "No diagram source 'nope'"));
    expect(wire(await renameDiagram(dir, 'corrupt', 'taken'))).toBe(
      refusal(409, "A diagram named 'taken' already exists"),
    );
    expect(wire(await renameDiagram(dir, 'corrupt', 'owned'))).toBe(
      refusal(409, `'owned' is already TypeScript-owned (${path.join(dir, 'owned.diagram.ts')})`),
    );
    expect(wire(await renameDiagram(dir, 'corrupt', 'free'))).toBe(refusal(400, "Corrupt diagram source 'corrupt'"));
    expect((await readdir(dir)).sort()).toEqual([
      'corrupt.diagram.json',
      'owned.diagram.ts',
      'taken.diagram.json',
      'taken.diagram.ts',
    ]);
  });

  it('renameDiagram writes the source with its keys in their order, the id and a default title changed', async () => {
    const dir = await tempDir();
    // name before version and id, an unknown key last: the order the file had
    const source = (id: string) => ({ name: id, version: 1, id, nodes: [], extra: { b: 1, a: 2 } });
    await writeFile(path.join(dir, 'shop.diagram.json'), JSON.stringify(source('shop')));
    expect(wire(await renameDiagram(dir, 'shop', 'team/cart'))).toBe(wire({ status: 200, body: { ok: true } }));
    expect(await readFile(path.join(dir, 'team', 'cart.diagram.json'), 'utf8')).toBe(saved(source('team/cart')));
    expect((await readdir(dir)).sort()).toEqual(['team']);
  });

  it('ejectDiagramSource: the name, then eject’s own refusals, each to its status', async () => {
    const root = await tempDir();
    const src = path.join(root, 'src');
    const art = path.join(root, 'art');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'Bad.diagram.json'), JSON.stringify(goodModel));
    expect(wire(await ejectDiagramSource(src, art, 'Bad'))).toBe(refusal(400, "Unsafe name 'Bad'"));
    // a .diagram.ts answers before a missing JSON source
    await writeFile(path.join(src, 'owned.diagram.ts'), '');
    expect(wire(await ejectDiagramSource(src, art, 'owned'))).toBe(
      refusal(409, `'owned' is already TypeScript-owned (${path.join(src, 'owned.diagram.ts')})`),
    );
    expect(wire(await ejectDiagramSource(src, art, 'nope'))).toBe(
      refusal(404, `no diagram 'nope' (${path.join(src, 'nope.diagram.json')})`),
    );
    await writeFile(path.join(src, 'corrupt.diagram.json'), '{');
    const corrupt = await ejectDiagramSource(src, art, 'corrupt');
    expect(corrupt.status).toBe(400);
    expect(wire(corrupt)).toMatch(/^400 \{"issues":\[\{"message":"'corrupt' is not valid JSON: /);
    await writeFile(
      path.join(src, 'invalid.diagram.json'),
      JSON.stringify({ ...goodModel, relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }] }),
    );
    const invalid = await ejectDiagramSource(src, art, 'invalid');
    expect(invalid.status).toBe(400);
    expect(wire(invalid)).toMatch(
      /^400 \{"issues":\[\{"message":"'invalid' fails validation; fix it before ejecting:\\n/,
    );
  });
});

describe('listDiagramModels entries', () => {
  const rawModel = (id: string, nodes: unknown[] = []) => ({ ...goodModel, id, name: id, nodes });

  it('lists name, model, issues and editable, in that order, sorted by name, a source over its artifact', async () => {
    const root = await tempDir();
    const src = path.join(root, 'src');
    const art = path.join(root, 'art');
    await mkdir(path.join(src, 'team'), { recursive: true });
    await mkdir(art, { recursive: true });
    await writeFile(path.join(src, 'team', 'b.diagram.json'), JSON.stringify(rawModel('b')));
    await writeFile(path.join(art, 'team'), '');
    await writeFile(path.join(art, 'a.diagram.json'), JSON.stringify(rawModel('a')));
    await writeFile(path.join(art, 'c.diagram.json'), JSON.stringify(rawModel('c-artifact')));
    await writeFile(path.join(src, 'c.diagram.json'), JSON.stringify(rawModel('c')));
    expect(wire(await listDiagramModels(src, art))).toBe(
      wire({
        status: 200,
        body: {
          diagrams: [
            { name: 'a', model: rawModel('a'), issues: [], editable: false },
            { name: 'c', model: rawModel('c'), issues: [], editable: true },
            { name: 'team/b', model: rawModel('b'), issues: [], editable: true },
          ],
        },
      }),
    );
  });

  it('says why a source is read-only before saying it could not be read', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'Bad.diagram.json'), '{');
    expect(wire(await listDiagramModels(root, path.join(root, 'art')))).toBe(
      wire({
        status: 200,
        body: {
          diagrams: [
            {
              name: 'Bad',
              model: null,
              issues: [
                {
                  message:
                    "'Bad' is read-only here: the studio saves names of lowercase letters, digits, '-' and '/', none ending in /rename, /eject or /composed. Rename the file to edit it.",
                },
                { message: "Could not read model for 'Bad'" },
              ],
              editable: false,
            },
          ],
        },
      }),
    );
  });

  it('composes a read-only source too, but never an artifact, and leaves a model with no node list alone', async () => {
    const root = await tempDir();
    const src = path.join(root, 'src');
    const art = path.join(root, 'art');
    await mkdir(src, { recursive: true });
    await mkdir(art, { recursive: true });
    const include = { id: 'u', name: 'U', type: 'system', include: './child.diagram.json' };
    await writeFile(path.join(src, 'child.diagram.json'), JSON.stringify(rawModel('child', [{ id: 'x', name: 'X' }])));
    await writeFile(path.join(src, 'Up.diagram.json'), JSON.stringify(rawModel('up', [include])));
    await writeFile(path.join(art, 'child.diagram.json'), JSON.stringify(rawModel('child')));
    await writeFile(path.join(art, 'built.diagram.json'), JSON.stringify(rawModel('built', [include])));
    await writeFile(path.join(src, 'odd.diagram.json'), JSON.stringify({ nodes: 'none' }));
    const { diagrams } = (await listDiagramModels(src, art)).body as { diagrams: DiagramEntry[] };
    const byName = Object.fromEntries(diagrams.map((d) => [d.name, d]));
    expect(byName['Up']!.model!.nodes.map((n) => n.id)).toEqual(['u', 'u/x']);
    expect(byName['Up']!.issues).toHaveLength(1);
    expect(byName['built']!.model).toEqual(rawModel('built', [include]));
    expect(byName['built']!.issues).toEqual([]);
    expect(byName['odd']).toEqual({ name: 'odd', model: { nodes: 'none' }, issues: [], editable: true });
  });

  it('lists a compose warning after the read-only issue, and a failed compose as one issue', async () => {
    const root = await tempDir();
    const include = { id: 'u', name: 'U', type: 'system', include: './child.diagram.json' };
    await writeFile(
      path.join(root, 'child.diagram.json'),
      JSON.stringify(rawModel('child', [{ id: 'x', name: 'X', type: 'service', key: 'k' }])),
    );
    await writeFile(
      path.join(root, 'Up.diagram.json'),
      JSON.stringify(rawModel('up', [{ id: 'x', name: 'X', type: 'database', key: 'k' }, include])),
    );
    await writeFile(
      path.join(root, 'gone.diagram.json'),
      JSON.stringify(rawModel('gone', [{ ...include, include: './missing.diagram.json' }])),
    );
    const { diagrams } = (await listDiagramModels(root, path.join(root, 'art'))).body as { diagrams: DiagramEntry[] };
    const byName = Object.fromEntries(diagrams.map((d) => [d.name, d]));
    expect(byName['Up']!.issues).toEqual([
      { message: expect.stringMatching(/^'Up' is read-only here/) },
      { message: expect.stringMatching(/'k'/) },
    ]);
    expect(byName['gone']!.model).toEqual(rawModel('gone', [{ ...include, include: './missing.diagram.json' }]));
    expect(byName['gone']!.issues).toEqual([{ message: expect.stringMatching(/^Includes not expanded: .*missing/) }]);
  });
});

describe('remote includes in the studio', () => {
  // The lock and the vendored copies sit in the folder above the sources, the
  // `.diagrams` root; the studio reads them and never fetches.
  const url = 'https://example.invalid/child.diagram.json';
  const childModel = {
    ...goodModel,
    id: 'child',
    name: 'child',
    nodes: [{ id: 'inner', name: 'Inner', type: 'service' }],
  };
  const umbrella = {
    ...goodModel,
    id: 'umbrella',
    name: 'umbrella',
    nodes: [{ id: 'remote', name: 'Remote', type: 'system', include: url }],
  };
  async function project(vendored: boolean): Promise<{ src: string; art: string }> {
    const root = await tempDir();
    const src = path.join(root, 'src');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'umbrella.diagram.json'), JSON.stringify(umbrella));
    if (vendored) {
      const text = `${JSON.stringify(childModel, null, 2)}\n`;
      const sha256 = createHash('sha256').update(text).digest('hex');
      await mkdir(path.join(root, 'includes'), { recursive: true });
      await writeFile(path.join(root, 'includes', 'child.diagram.json'), text);
      await writeFile(
        path.join(root, 'includes.lock.json'),
        JSON.stringify({ version: 1, includes: { [url]: { file: 'includes/child.diagram.json', sha256 } } }),
      );
    }
    return { src, art: path.join(root, 'art') };
  }
  const notSnapshotted = (from: string) =>
    `Include '${url}' (from ${from}): Include '${url}' is not snapshotted — run 'diagc compile --update-includes' and commit .diagrams/includes/ + .diagrams/includes.lock.json`;

  it('an include the lock does not hold is an issue in the list and a 409 on the composed read', async () => {
    const { src, art } = await project(false);
    const { diagrams } = (await listDiagramModels(src, art)).body as { diagrams: DiagramEntry[] };
    expect(diagrams).toEqual([
      {
        name: 'umbrella',
        model: umbrella,
        issues: [{ message: `Includes not expanded: ${notSnapshotted(path.join(src, 'umbrella.diagram.json'))}` }],
        editable: true,
      },
    ]);
    expect(wire(await readComposedDiagram(src, 'umbrella'))).toBe(
      refusal(409, notSnapshotted(path.join(src, 'umbrella.diagram.json'))),
    );
  });

  it('a vendored include is read from the lock beside the sources’ folder', async () => {
    const { src, art } = await project(true);
    const { diagrams } = (await listDiagramModels(src, art)).body as { diagrams: DiagramEntry[] };
    expect(diagrams[0]!.issues).toEqual([]);
    expect(diagrams[0]!.model!.nodes.map((n) => n.id)).toEqual(['remote', 'remote/inner']);
    const composed = await readComposedDiagram(src, 'umbrella');
    expect(composed.status).toBe(200);
    expect((composed.body as { model: DiagramModel }).model.nodes.map((n) => n.id)).toEqual(['remote', 'remote/inner']);
  });

  it('eject compiles through the same lock, and a failing compile after the swap is thrown, not answered', async () => {
    const vendored = await project(true);
    expect(wire(await ejectDiagramSource(vendored.src, vendored.art, 'umbrella'))).toBe(
      wire({ status: 200, body: { ok: true } }),
    );
    const artifact = JSON.parse(
      await readFile(path.join(vendored.art, 'umbrella.diagram.json'), 'utf8'),
    ) as DiagramModel;
    expect(artifact.nodes.map((n) => n.id)).toEqual(['remote', 'remote/inner']);
    const bare = await project(false);
    await expect(ejectDiagramSource(bare.src, bare.art, 'umbrella')).rejects.toThrow(
      notSnapshotted(path.join(bare.src, 'umbrella.diagram.ts')),
    );
  });
});
