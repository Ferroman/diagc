import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLibrary, saveLibrary } from './library';

describe('library handlers', () => {
  const emptyLib = { categories: [], entries: [] };
  const goodLib = {
    categories: [{ id: 'gcp', name: 'GCP' }],
    entries: [
      {
        id: 'gcp-bq',
        category: 'gcp',
        name: 'BigQuery',
        template: { type: 'image', image: 'a1b2c3.svg', width: 64, height: 64 },
      },
    ],
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
      entries: [
        { id: 'gcp-sil', category: 'gcp', name: 'Silhouette', template: { shape: 'a1b2c3.svg', color: '#08427b' } },
      ],
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
    const dup = {
      categories: [{ id: 'c', name: 'C' }],
      entries: [
        { id: 'e', category: 'c', name: 'E', template: { color: '#000' } },
        { id: 'e', category: 'c', name: 'E2', template: { color: '#111' } },
      ],
    };
    expect((await saveLibrary(dir, dup)).status).toBe(400);
    const badField = {
      categories: [{ id: 'c', name: 'C' }],
      entries: [{ id: 'e', category: 'c', name: 'E', template: { width: 'big' } }],
    };
    expect((await saveLibrary(dir, badField)).status).toBe(400);
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

describe('library answers', () => {
  const cat = { id: 'c', name: 'C' };
  const entry = (extra: Record<string, unknown> = {}) => ({
    id: 'e',
    category: 'c',
    name: 'E',
    template: { color: '#000' },
    ...extra,
  });
  const lib = (categories: unknown[], entries: unknown[]) => ({ categories, entries });
  const answer = async (payload: unknown) => wire(await saveLibrary(await tempDir(), payload));

  it('refuses what is not a library', async () => {
    for (const payload of [
      null,
      {},
      [],
      { categories: [] },
      { categories: {}, entries: [] },
      { categories: [], entries: 'x' },
    ]) {
      expect(await answer(payload)).toBe(refusal(400, 'Not a library { categories, entries }'));
    }
  });

  it('checks every category, its fields before its id, before any entry', async () => {
    expect(await answer(lib([cat, { id: 'c' }], [{}]))).toBe(refusal(400, 'Category needs string id and name'));
    expect(await answer(lib([{ id: 1, name: 'x' }], []))).toBe(refusal(400, 'Category needs string id and name'));
    expect(await answer(lib([cat, cat], [{}]))).toBe(refusal(400, "Duplicate category 'c'"));
  });

  it('checks each entry in turn: its fields, its category, its id, then its template', async () => {
    for (const bad of [{ id: 1 }, { name: null }, { category: undefined }]) {
      expect(await answer(lib([cat], [entry(bad)]))).toBe(refusal(400, 'Entry needs string id, name, category'));
    }
    expect(await answer(lib([cat], [entry(), entry({ category: 'nope', template: null })]))).toBe(
      refusal(400, "Entry 'e' references unknown category 'nope'"),
    );
    expect(await answer(lib([cat], [entry(), entry({ template: null })]))).toBe(refusal(400, "Duplicate entry 'e'"));
    for (const template of [null, undefined, [], 'x', 3]) {
      expect(await answer(lib([cat], [entry({ template })]))).toBe(refusal(400, "Entry 'e' missing template"));
    }
    expect(await answer(lib([cat], [entry({ template: { color: '#000', width: '1', size: 2 } })]))).toBe(
      refusal(400, "Entry 'e' has invalid template field 'width'"),
    );
    for (const template of [
      { type: 1 },
      { color: null },
      { image: 2 },
      { shape: {} },
      { height: '2' },
      { icon: 'x' },
    ]) {
      const key = Object.keys(template)[0];
      expect(await answer(lib([cat], [entry({ template })]))).toBe(
        refusal(400, `Entry 'e' has invalid template field '${key}'`),
      );
    }
  });

  it("answers the first entry's template before the second entry's id", async () => {
    expect(await answer(lib([cat], [entry({ template: { size: 1 } }), entry()]))).toBe(
      refusal(400, "Entry 'e' has invalid template field 'size'"),
    );
  });

  it('throws, rather than answering, on a category or an entry that is null', async () => {
    const dir = await tempDir();
    await expect(saveLibrary(dir, lib([null], []))).rejects.toThrow("Cannot read properties of null (reading 'id')");
    await expect(saveLibrary(dir, lib([cat], [null]))).rejects.toThrow("Cannot read properties of null (reading 'id')");
  });

  it('writes the library as sent, and reads a missing or corrupt file as an empty one', async () => {
    const dir = await tempDir();
    expect(wire(await readLibrary(dir))).toBe('200 {"categories":[],"entries":[]}');
    const full = {
      entries: [entry({ template: { type: 't', color: 'c', image: 'i', shape: 's', width: 1, height: 2 } })],
      categories: [cat],
      extra: true,
    };
    expect(wire(await saveLibrary(dir, full))).toBe(wire({ status: 200, body: { ok: true } }));
    expect(await readFile(path.join(dir, 'library.json'), 'utf8')).toBe(saved(full));
    expect(wire(await readLibrary(dir))).toBe(wire({ status: 200, body: full }));
    await writeFile(path.join(dir, 'library.json'), '{');
    expect(wire(await readLibrary(dir))).toBe('200 {"categories":[],"entries":[]}');
  });
});
