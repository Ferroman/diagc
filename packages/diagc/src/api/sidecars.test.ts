import { chmod, mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDiagram, saveDiagram } from './diagrams';
import { listDrawings, listLayouts, saveDrawings, saveLayout } from './sidecars';

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

describe('sidecar handlers', () => {
  it('saves layouts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'designer-'));
    const res = await saveLayout(dir, 'sketch', { version: 1, planes: { default: { a: { x: 1, y: 2 } } } });
    expect(res.status).toBe(200);
    expect(JSON.parse(await readFile(path.join(dir, 'sketch.layout.json'), 'utf8')).planes.default.a).toEqual({
      x: 1,
      y: 2,
    });
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
    expect(
      (await saveDrawings(dir, 'x', { version: 1, planes: { default: [{ id: 'k1', points: [1] }] } })).status,
    ).toBe(400);
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

// What a host sends for each answer, key order included: the hosts serialise a
// handler's body as it is, so a reordered key or a reworded refusal is a change a
// client sees.
const wire = (res: { status: number; body: unknown }): string => `${res.status} ${JSON.stringify(res.body)}`;
/** The one-message refusal the handlers answer with. */
const refusal = (status: number, message: string): string => wire({ status, body: { issues: [{ message }] } });
const tempDir = () => mkdtemp(path.join(tmpdir(), 'designer-pins-'));
/** What a save writes: the payload as sent, two-space indented, with a closing newline. */
const saved = (payload: unknown): string => `${JSON.stringify(payload, null, 2)}\n`;

describe('sidecar answers', () => {
  it('saveLayout: the name, then the shape; writes the overlay as sent', async () => {
    const dir = await tempDir();
    expect(wire(await saveLayout(dir, 'Bad', null))).toBe(refusal(400, "Unsafe name 'Bad'"));
    for (const payload of [null, {}, { version: 2, planes: {} }]) {
      expect(wire(await saveLayout(dir, 'x', payload))).toBe(refusal(400, 'Not a version-1 layout overlay'));
    }
    const layout = { version: 1, planes: { default: { a: { x: 1, y: 2 } } } };
    expect(wire(await saveLayout(dir, 'team/x', layout))).toBe(wire({ status: 200, body: { ok: true } }));
    expect(await readFile(path.join(dir, 'team', 'x.layout.json'), 'utf8')).toBe(saved(layout));
  });

  it('saveDrawings: the name, then the shape; writes the strokes as sent, and no file for none', async () => {
    const dir = await tempDir();
    expect(wire(await saveDrawings(dir, 'Bad', null))).toBe(refusal(400, "Unsafe name 'Bad'"));
    for (const payload of [null, {}, { version: 2, planes: {} }]) {
      expect(wire(await saveDrawings(dir, 'x', payload))).toBe(refusal(400, 'Not a version-1 drawings overlay'));
    }
    expect(wire(await saveDrawings(dir, 'team/x', { version: 1, planes: { a: [] } }))).toBe(
      wire({ status: 200, body: { ok: true } }),
    );
    expect(await readdir(dir)).toEqual([]);
    const drawings = { version: 1, planes: { a: [], b: [{ id: 'k', points: [1, 2] }] } };
    expect(wire(await saveDrawings(dir, 'team/x', drawings))).toBe(wire({ status: 200, body: { ok: true } }));
    expect(await readFile(path.join(dir, 'team', 'x.drawings.json'), 'utf8')).toBe(saved(drawings));
  });

  it('listLayouts and listDrawings key each readable sidecar by its diagram name, folders included', async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, 'team'), { recursive: true });
    await writeFile(path.join(dir, 'team', 'a.layout.json'), '{"version":1,"planes":{}}');
    await writeFile(path.join(dir, 'bad.layout.json'), '{');
    await writeFile(path.join(dir, 'team', 'a.drawings.json'), '{"version":1,"planes":{}}');
    await writeFile(path.join(dir, 'bad.drawings.json'), '{');
    expect(wire(await listLayouts(dir))).toBe('200 {"layouts":{"team/a":{"version":1,"planes":{}}}}');
    expect(wire(await listDrawings(dir))).toBe('200 {"drawings":{"team/a":{"version":1,"planes":{}}}}');
    expect(wire(await listLayouts(path.join(dir, 'nope')))).toBe('200 {"layouts":{}}');
    expect(wire(await listDrawings(path.join(dir, 'nope')))).toBe('200 {"drawings":{}}');
  });
});
