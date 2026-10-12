import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAsset, saveAsset } from './assets';

describe('asset handlers', () => {
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
});

// What a host sends for each answer, key order included: the hosts serialise a
// handler's body as it is, so a reordered key or a reworded refusal is a change a
// client sees.
const wire = (res: { status: number; body: unknown }): string => `${res.status} ${JSON.stringify(res.body)}`;
/** The one-message refusal the handlers answer with. */
const refusal = (status: number, message: string): string => wire({ status, body: { issues: [{ message }] } });
const tempDir = () => mkdtemp(path.join(tmpdir(), 'designer-pins-'));

describe('asset answers', () => {
  const MB5 = 5 * 1024 * 1024;
  const hashName = (bytes: Buffer, ext: string) =>
    `${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${ext}`;

  it('saveAsset: the type, then the size', async () => {
    const dir = await tempDir();
    expect(wire(await saveAsset(dir, 'application/pdf', Buffer.alloc(0)))).toBe(
      refusal(400, "Unsupported image type 'application/pdf'"),
    );
    expect(wire(await saveAsset(dir, '', Buffer.from('x')))).toBe(refusal(400, "Unsupported image type ''"));
    expect(wire(await saveAsset(dir, 'IMAGE/PNG', Buffer.from('x')))).toBe(
      refusal(400, "Unsupported image type 'IMAGE/PNG'"),
    );
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(MB5 + 1)]) {
      expect(wire(await saveAsset(dir, 'image/png', bytes))).toBe(refusal(400, 'Image must be 1 byte to 5 MB'));
    }
    expect((await saveAsset(dir, 'image/png', Buffer.alloc(MB5))).status).toBe(200);
  });

  it('saveAsset names the bytes by their hash and type, and leaves a stored file as it is', async () => {
    const dir = await tempDir();
    const bytes = Buffer.from('picture');
    const types: [string, string][] = [
      ['image/png', 'png'],
      ['image/jpeg', 'jpg'],
      ['image/svg+xml', 'svg'],
      ['image/webp', 'webp'],
      ['image/gif', 'gif'],
      [' image/gif ; charset=binary', 'gif'],
    ];
    for (const [type, ext] of types) {
      expect(wire(await saveAsset(dir, type, bytes))).toBe(wire({ status: 200, body: { name: hashName(bytes, ext) } }));
    }
    await writeFile(path.join(dir, 'assets', hashName(bytes, 'png')), 'other');
    await saveAsset(dir, 'image/png', bytes);
    expect(await readFile(path.join(dir, 'assets', hashName(bytes, 'png')), 'utf8')).toBe('other');
  });

  it('readAsset: the name, then the file; the type from the extension', async () => {
    const dir = await tempDir();
    for (const name of ['x.exe', 'UPPER.png', 'a-b.png', '../a.png']) {
      expect(wire(await readAsset(dir, name))).toBe(refusal(400, `Unsafe asset name '${name}'`));
    }
    expect(wire(await readAsset(dir, 'abc.png'))).toBe(refusal(404, "No asset 'abc.png'"));
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    const bytes = Buffer.from('picture');
    const types: [string, string][] = [
      ['png', 'image/png'],
      ['jpg', 'image/jpeg'],
      ['jpeg', 'image/jpeg'],
      ['svg', 'image/svg+xml'],
      ['webp', 'image/webp'],
      ['gif', 'image/gif'],
    ];
    for (const [ext, contentType] of types) {
      await writeFile(path.join(dir, 'assets', `abc.${ext}`), bytes);
      const read = await readAsset(dir, `abc.${ext}`);
      expect(read).toEqual({ status: 200, body: null, bytes, contentType });
      expect(Object.keys(read)).toEqual(['status', 'body', 'bytes', 'contentType']);
    }
  });
});
