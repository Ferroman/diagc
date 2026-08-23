import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagramming/core';
import { DG_DATA_SENTINEL } from './html';
import { publishDiagrams } from './publish';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'pub-'));
  const src = path.join(root, 'src');
  const artifacts = path.join(root, 'artifacts');
  const html = path.join(root, 'html');
  const stat = path.join(root, 'static');
  const lib = path.join(root, 'lib');
  const assets = path.join(src, 'assets');
  await mkdir(src, { recursive: true });
  await mkdir(artifacts, { recursive: true });
  await mkdir(lib, { recursive: true });
  await mkdir(assets, { recursive: true });
  const b = model('demo');
  b.node('a', { name: 'Alpha', shape: '/library/shapes/person.svg' });
  await writeFile(path.join(artifacts, 'demo.diagram.json'), JSON.stringify(b.toJSON()));
  await mkdir(path.join(lib, 'shapes'), { recursive: true });
  await writeFile(path.join(lib, 'shapes', 'person.svg'), '<svg/>');
  const shell = path.join(root, 'shell.html');
  await writeFile(shell, `<script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`);
  return { root, src, artifacts, html, stat, lib, assets, shell };
}

describe('publishDiagrams', () => {
  it('writes a stamped, asset-inlined page and a gallery; no images when images:false', async () => {
    const f = await fixture();
    const res = await publishDiagrams({
      srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
      libraryDir: f.lib, assetsDir: f.assets, images: false,
    });
    expect(res.pages).toEqual([path.join(f.html, 'demo.html')]);
    expect(res.images).toEqual([]);
    const page = await readFile(path.join(f.html, 'demo.html'), 'utf8');
    expect(page).not.toContain(DG_DATA_SENTINEL);
    expect(page).toContain('data:image/svg+xml;base64,'); // /library ref inlined
    const gallery = await readFile(path.join(f.html, 'index.html'), 'utf8');
    expect(gallery).toContain('href="demo.html"');
  });

  it('inlines a bare-name uploaded image asset end-to-end', async () => {
    const f = await fixture();
    await writeFile(path.join(f.assets, 'e49c5314228f.jpg'), Buffer.from('fake-jpg-bytes'));
    const b = model('withimg');
    b.node('img', { name: 'Img', type: 'image', image: 'e49c5314228f.jpg' });
    await writeFile(path.join(f.artifacts, 'withimg.diagram.json'), JSON.stringify(b.toJSON()));

    const res = await publishDiagrams({
      srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
      libraryDir: f.lib, assetsDir: f.assets, images: false,
    });

    expect(res.pages).toContain(path.join(f.html, 'withimg.html'));
    const page = await readFile(path.join(f.html, 'withimg.html'), 'utf8');
    expect(page).toContain('data:image/jpeg;base64,');
  });

  it('keeps publishing and still writes every page + the gallery when renderPng fails for every diagram', async () => {
    const f = await fixture();
    const b2 = model('demo2');
    b2.node('x', { name: 'X' });
    await writeFile(path.join(f.artifacts, 'demo2.diagram.json'), JSON.stringify(b2.toJSON()));

    let calls = 0;
    const renderPng = async () => {
      calls++;
      throw new Error('no chrome found');
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let res: Awaited<ReturnType<typeof publishDiagrams>> | undefined;
    await expect((async () => {
      res = await publishDiagrams({
        srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
        libraryDir: f.lib, assetsDir: f.assets, images: true, renderPng,
      });
    })()).resolves.not.toThrow();
    warnSpy.mockRestore();

    expect(calls).toBe(2);
    expect(res!.pages.sort()).toEqual(
      [path.join(f.html, 'demo.html'), path.join(f.html, 'demo2.html')].sort(),
    );
    expect(res!.images).toEqual([]);
    await expect(readFile(path.join(f.html, 'demo.html'), 'utf8')).resolves.toContain('demo');
    await expect(readFile(path.join(f.html, 'demo2.html'), 'utf8')).resolves.toContain('demo2');
    const gallery = await readFile(path.join(f.html, 'index.html'), 'utf8');
    expect(gallery).toContain('href="demo.html"');
    expect(gallery).toContain('href="demo2.html"');
  });

  it('skips a malformed diagram source but keeps publishing the rest and the gallery', async () => {
    const f = await fixture();
    await writeFile(path.join(f.artifacts, 'broken.diagram.json'), '{}');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await publishDiagrams({
      srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
      libraryDir: f.lib, assetsDir: f.assets, images: false,
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('broken'))).toBe(true);
    warnSpy.mockRestore();

    expect(res.pages).toEqual([path.join(f.html, 'demo.html')]);
    const gallery = await readFile(path.join(f.html, 'index.html'), 'utf8');
    expect(gallery).toContain('href="demo.html"');
    // the skipped diagram has no page, so it must not get a dead link in the gallery
    expect(gallery).not.toContain('href="broken.html"');
  });

  it('publishes a compiled artifact (as a TS source or an include-expansion would produce) whose nodes carry an expanded include child id, and still resolves its layout from srcDir', async () => {
    const f = await fixture();
    // Simulates what compileFile writes for both a .diagram.ts source and an
    // include-expanded umbrella: the artifact is plain JSON with a namespaced
    // child id ("perm/svc") baked in — discoverDiagrams/publish never see the
    // include machinery, only the compiled result under artifactsDir.
    const b = model('umbrella');
    b.node('perm', { name: 'Permissions' });
    b.node('perm/svc', { name: 'Perm Svc' });
    await writeFile(path.join(f.artifacts, 'umbrella.diagram.json'), JSON.stringify(b.toJSON()));
    await writeFile(
      path.join(f.src, 'umbrella.layout.json'),
      JSON.stringify({ version: 1, planes: { default: { 'perm/svc': { x: 42, y: 7 } } } }),
    );

    const res = await publishDiagrams({
      srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
      libraryDir: f.lib, assetsDir: f.assets, images: false,
    });

    expect(res.pages).toContain(path.join(f.html, 'umbrella.html'));
    const page = await readFile(path.join(f.html, 'umbrella.html'), 'utf8');
    // the expanded include child id survived from the compiled artifact into the page
    expect(page).toContain('"perm/svc"');
    // the layout, resolved from srcDir (not artifactsDir), was embedded too
    expect(page).toContain('"x":42');
  });

  it('embeds the drawings sidecar from srcDir into the page', async () => {
    const f = await fixture();
    const b = model('inked');
    b.node('a', { name: 'A' });
    await writeFile(path.join(f.artifacts, 'inked.diagram.json'), JSON.stringify(b.toJSON()));
    await writeFile(
      path.join(f.src, 'inked.drawings.json'),
      JSON.stringify({ version: 1, planes: { default: [{ id: 'k1', points: [7, 8, 9, 10] }] } }),
    );
    await publishDiagrams({
      srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
      libraryDir: f.lib, assetsDir: f.assets, images: false,
    });
    const page = await readFile(path.join(f.html, 'inked.html'), 'utf8');
    expect(page).toContain('"drawings":{"version":1');
    expect(page).toContain('[7,8,9,10]');
  });

  it('warns and drops a sidecar that parses but is not a drawings overlay', async () => {
    const f = await fixture();
    const b = model('smudged');
    b.node('a', { name: 'A' });
    await writeFile(path.join(f.artifacts, 'smudged.diagram.json'), JSON.stringify(b.toJSON()));
    // Valid JSON, invalid overlay: an odd-length `points` array is exactly what
    // isDrawings rejects — and what the renderer would read as a half-coordinate.
    await writeFile(
      path.join(f.src, 'smudged.drawings.json'),
      JSON.stringify({ version: 1, planes: { default: [{ id: 'k1', points: [1] }] } }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await publishDiagrams({
        srcDir: f.src, artifactsDir: f.artifacts, htmlDir: f.html, staticDir: f.stat, shellPath: f.shell,
        libraryDir: f.lib, assetsDir: f.assets, images: false,
      });
      // the page still ships — just without ink
      expect(res.pages).toContain(path.join(f.html, 'smudged.html'));
      const page = await readFile(path.join(f.html, 'smudged.html'), 'utf8');
      expect(page).not.toContain('"drawings"');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('smudged'));
    } finally {
      warn.mockRestore();
    }
  });
});
