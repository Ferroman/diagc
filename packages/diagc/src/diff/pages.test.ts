import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compareDiagramSets } from './compare';
import { loadDiagramSet } from './load';
import { writeDiffPages } from './pages';
import { DG_DATA_SENTINEL, stampHtml } from '../publish/html';
import { THEME_HEAD_SCRIPT, THEME_SWITCH, themeCss } from '../publish/pageTheme';
import {
  diffRepo,
  everyStatus,
  put,
  SHOP_CHANGES,
  SHOP_DRAWINGS,
  SHOP_LAYOUT,
  v2,
  type DiffRepo,
} from '../../test-fixtures/diff';

let repo: DiffRepo;
beforeAll(() => {
  repo = diffRepo();
});
afterEach(() => repo.cleanup());

describe('writeDiffPages', () => {
  it('writes a marked page (and image) per side, the side-by-side index and the ADR summary', async () => {
    const before = await repo.setAt('v1');
    const after = await repo.setAt('v2');
    const diffs = compareDiagramSets(before, after);
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(
      shellPath,
      `<!doctype html><script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`,
    );
    const rendered: string[] = [];
    const res = await writeDiffPages(diffs, {
      outDir: path.join(out, 'diff'),
      shellPath,
      libraryDir: out,
      before,
      after,
      renderPng: async (html, png) => {
        rendered.push(path.relative(out, html));
        writeFileSync(png, '');
      },
    });
    expect(res.pages.map((p) => path.relative(out, p)).sort()).toEqual([
      'diff/gone.before.html',
      'diff/new/fresh.after.html',
      'diff/shop.after.html',
      'diff/shop.before.html',
    ]);
    expect(rendered.sort()).toEqual(res.pages.map((p) => path.relative(out, p)).sort());

    const stamped = (rel: string) => {
      const html = readFileSync(path.join(out, 'diff', rel), 'utf8');
      return JSON.parse(
        html.slice(html.indexOf('>', html.indexOf('id="dg-data"')) + 1, html.lastIndexOf('</script>')),
      ) as {
        diff: { marks: unknown };
        layout?: unknown;
      };
    };
    expect(stamped('shop.before.html').diff.marks).toEqual({
      nodes: { api: 'changed', legacy: 'removed' },
      relations: { 'web->api#0': 'changed', 'web->legacy#0': 'removed' },
    });
    expect(stamped('shop.after.html').diff.marks).toEqual({
      nodes: { api: 'changed', db: 'added' },
      relations: { 'web->api#0': 'changed', 'api->db#0': 'added' },
    });
    expect(stamped('shop.before.html').layout).toEqual({ version: 1, planes: {} });

    const index = readFileSync(res.index, 'utf8');
    expect(index).toContain('<iframe src="shop.before.html?export=1"');
    expect(index).toContain('<iframe src="new/fresh.after.html?export=1"');
    expect(index).toContain('<li class="add">+ Orders DB [database]</li>');
    // the overview follows the reader's theme, as the index page does
    expect(index).toContain(THEME_HEAD_SCRIPT);
    expect(index).toContain(':root[data-theme=dark]');
    expect(index).toContain('id="dg-theme"');
    const summary = readFileSync(res.summary, 'utf8');
    expect(summary).toContain('| ![before](shop.before.png) | ![after](shop.after.png) |');
    expect(summary).toContain('| ![before](gone.before.png) | — |');
    expect(summary).toContain('- `~` API -> API gateway (renamed)');
  });

  it('points the summary images at --image-url when given', async () => {
    const before = await repo.setAt('v1');
    const after = await repo.setAt('v2');
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, DG_DATA_SENTINEL);
    const res = await writeDiffPages(compareDiagramSets(before, after, ['shop']), {
      outDir: out,
      shellPath,
      libraryDir: out,
      before,
      after,
      renderPng: async (_html, png) => writeFileSync(png, ''),
      imageUrl: 'https://host/pr-7/{path}?raw=true',
    });
    expect(readFileSync(res.summary, 'utf8')).toContain(
      '| ![before](https://host/pr-7/shop.before.png?raw=true) | ![after](https://host/pr-7/shop.after.png?raw=true) |',
    );
  });

  it('links the pages instead of images when no PNGs were rendered', async () => {
    const before = await repo.setAt('v1');
    const after = await repo.setAt('v2');
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, DG_DATA_SENTINEL);
    const res = await writeDiffPages(compareDiagramSets(before, after, ['shop']), {
      outDir: out,
      shellPath,
      libraryDir: out,
      before,
      after,
    });
    expect(res.images).toEqual([]);
    expect(readFileSync(res.summary, 'utf8')).toContain('| [before](shop.before.html) | [after](shop.after.html) |');
  });

  it('shows a diagram it could not compare on the index, as the summary does', async () => {
    const before = await repo.setAt('v1');
    const after = await repo.setAt('v2');
    after.errors.set('broken', 'bad json');
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, DG_DATA_SENTINEL);
    const res = await writeDiffPages(compareDiagramSets(before, after), {
      outDir: out,
      shellPath,
      libraryDir: out,
      before,
      after,
    });
    expect(readFileSync(res.index, 'utf8')).toContain(
      '<section><h2>broken</h2><p>Not compared: does not compile at v2: bad json</p></section>',
    );
    expect(readFileSync(res.summary, 'utf8')).toContain('## broken\n\nNot compared: does not compile at v2: bad json');
  });

  it('names a sidecar it left out on the index and in the summary', async () => {
    const before = await repo.setAt('v1');
    const dir = mkdtempSync(path.join(tmpdir(), 'diagc-diff-set-'));
    put(dir, 'src/shop.diagram.json', v2);
    put(dir, 'src/shop.layout.json', '{');
    const after = await loadDiagramSet('wip', dir);
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, DG_DATA_SENTINEL);
    const res = await writeDiffPages(compareDiagramSets(before, after, ['shop']), {
      outDir: out,
      shellPath,
      libraryDir: out,
      before,
      after,
    });
    const warning = /shop\.layout\.json at wip: does not parse \(.+\) — compared and drawn without it/;
    expect(readFileSync(res.index, 'utf8')).toMatch(warning);
    expect(readFileSync(res.summary, 'utf8')).toMatch(new RegExp(`^> ${warning.source}$`, 'm'));
  });
});

// The whole output for two sides with a diagram of each status: the pages, and
// index.html and summary.md byte for byte.
describe('every status, whole', () => {
  const SHELL = `<!doctype html><script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`;
  async function write(diffs: ReturnType<typeof compareDiagramSets>, sets: ReturnType<typeof everyStatus>, png = true) {
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-whole-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, SHELL);
    const rendered: string[] = [];
    const res = await writeDiffPages(diffs, {
      outDir: path.join(out, 'diff'),
      shellPath,
      libraryDir: out,
      ...sets,
      ...(png
        ? {
            renderPng: async (html: string, image: string) => {
              rendered.push(`${path.relative(out, html)} ${path.relative(out, image)}`);
              writeFileSync(image, '');
            },
            imageUrl: 'https://host/{path}?raw=1',
          }
        : {}),
    });
    const rel = (files: string[]) => files.map((f) => path.relative(out, f));
    return { out, res, rendered, rel };
  }

  const SUMMARY_HEAD = [
    '# Diagram changes: v1 → feat/<x> & "y"',
    '',
    '> shop.drawings.json at v1: not a drawings overlay — compared and drawn without it',
    '',
    '> shop.layout.json at feat/<x> & "y": does not parse (oops) — compared and drawn without it',
    '',
  ];
  const summaryOf = (cells: [string, string, string]) =>
    [
      ...SUMMARY_HEAD,
      '## broken',
      '',
      'Not compared: does not compile at feat/<x> & "y": bad <json>',
      '',
      '## gone',
      '',
      '| Before (v1) | After (feat/<x> & "y") |',
      '| --- | --- |',
      cells[0],
      '',
      '- `-` diagram removed: gone',
      '',
      '## new/fresh',
      '',
      '| Before (v1) | After (feat/<x> & "y") |',
      '| --- | --- |',
      cells[1],
      '',
      '- `+` new diagram: fresh (1 nodes, 0 relations)',
      '',
      '## shop',
      '',
      '| Before (v1) | After (feat/<x> & "y") |',
      '| --- | --- |',
      cells[2],
      '',
      ...SHOP_CHANGES.map((l) => `- \`${l[0]}\` ${l.slice(2)}`),
      '',
    ].join('\n');

  it('writes the pages in order, each with its data, and the overview and summary byte for byte', async () => {
    const sets = everyStatus();
    const { out, res, rendered, rel } = await write(compareDiagramSets(sets.before, sets.after), sets);
    const pages = ['diff/gone.before', 'diff/new/fresh.after', 'diff/shop.before', 'diff/shop.after'];
    expect(rel(res.pages)).toEqual(pages.map((p) => `${p}.html`));
    expect(rel(res.images)).toEqual(pages.map((p) => `${p}.png`));
    expect(rendered).toEqual(pages.map((p) => `${p}.html ${p}.png`));
    expect(rel([res.index, res.summary])).toEqual(['diff/index.html', 'diff/summary.md']);
    expect(readFileSync(path.join(out, 'diff/shop.before.html'), 'utf8')).toBe(
      stampHtml(SHELL, {
        model: sets.before.versions.get('shop')!.model,
        layout: SHOP_LAYOUT,
        drawings: SHOP_DRAWINGS,
        diff: {
          marks: {
            nodes: { web: 'changed', api: 'changed', legacy: 'removed', tmp: 'removed' },
            relations: { 'web->api#0': 'changed', 'web->legacy#0': 'removed' },
          },
        },
      }),
    );

    const light =
      '--bg:#fff;--card:#fff;--border:#d0d7de;--text:#1f2328;--muted:#57606a;--faint:#8c959f;--add:#16a34a;--del:#dc2626;--chg:#b45309';
    const dark =
      '--bg:#12161b;--card:#1b222b;--border:#2d3743;--text:#e6ebf0;--muted:#a3afbb;--faint:#8b98a5;--add:#4ade80;--del:#f87171;--chg:#fbbf24';
    expect(readFileSync(res.index, 'utf8')).toBe(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagram diff v1 → feat/&lt;x&gt; &amp; &quot;y&quot;</title>
${THEME_HEAD_SCRIPT}
<style>
${themeCss(light, dark)}
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0 auto; padding: 16px 24px 48px; max-width: 1800px; color: var(--text); background: var(--bg); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin: 32px 0 6px; } h3 { font-size: 13px; margin: 0 0 6px; color: var(--muted); }
  ul { margin: 0 0 12px; padding-left: 18px; font-family: ui-monospace, monospace; font-size: 12.5px; }
  li.add { color: var(--add); } li.del { color: var(--del); } li.chg { color: var(--chg); }
  .key span { display: inline-block; margin-right: 14px; } .key i { display: inline-block; width: 12px; height: 12px; border: 3px solid; border-radius: 3px; vertical-align: -2px; margin-right: 4px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .side iframe { width: 100%; height: 70vh; border: 1px solid var(--border); border-radius: 6px; }
  .side.empty p { height: 70vh; margin: 0; display: grid; place-items: center; border: 1px dashed var(--border); border-radius: 6px; color: var(--faint); }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
</style></head><body>
<header><h1>Diagram diff · v1 → feat/&lt;x&gt; &amp; &quot;y&quot;</h1>${THEME_SWITCH}</header>
<p class="key"><span><i style="border-color:#16a34a"></i>added</span><span><i style="border-color:#dc2626;border-style:dashed"></i>removed</span><span><i style="border-color:#d97706"></i>changed</span><span><i style="border-color:#d97706;border-style:dashed"></i>holds a change (folded box, on the linked pages)</span></p>
<ul><li>shop.drawings.json at v1: not a drawings overlay — compared and drawn without it</li><li>shop.layout.json at feat/&lt;x&gt; &amp; &quot;y&quot;: does not parse (oops) — compared and drawn without it</li></ul>
<section><h2>broken</h2><p>Not compared: does not compile at feat/&lt;x&gt; &amp; &quot;y&quot;: bad &lt;json&gt;</p></section>
<section><h2>gone</h2><ul><li class="del">- diagram removed: gone</li></ul><div class="pair"><div class="side"><h3><a href="gone.before.html">Before · v1</a></h3><iframe src="gone.before.html?export=1" title="Before · v1"></iframe></div><div class="side empty"><h3>After · feat/&lt;x&gt; &amp; &quot;y&quot;</h3><p>not present</p></div></div></section>
<section><h2>new/fresh</h2><ul><li class="add">+ new diagram: fresh (1 nodes, 0 relations)</li></ul><div class="pair"><div class="side empty"><h3>Before · v1</h3><p>not present</p></div><div class="side"><h3><a href="new/fresh.after.html">After · feat/&lt;x&gt; &amp; &quot;y&quot;</a></h3><iframe src="new/fresh.after.html?export=1" title="After · feat/&lt;x&gt; &amp; &quot;y&quot;"></iframe></div></div></section>
<section><h2>shop</h2><ul><li class="add">+ Orders &lt;DB&gt; [database]</li><li class="add">+ note</li><li class="del">- Legacy [service]</li><li class="del">- tmp</li><li class="chg">~ Web: type</li><li class="chg">~ API -&gt; API gateway (renamed): description</li><li class="add">+ API gateway -&gt; Orders &lt;DB&gt; (reads: SQL)</li><li class="del">- Web -&gt; Legacy (sync)</li><li class="chg">~ Web -&gt; API gateway (sync: HTTPS): label</li><li class="add">+ layer new</li><li class="del">- layer old</li><li class="add">+ plane ops</li><li class="del">- plane flow</li></ul><div class="pair"><div class="side"><h3><a href="shop.before.html">Before · v1</a></h3><iframe src="shop.before.html?export=1" title="Before · v1"></iframe></div><div class="side"><h3><a href="shop.after.html">After · feat/&lt;x&gt; &amp; &quot;y&quot;</a></h3><iframe src="shop.after.html?export=1" title="After · feat/&lt;x&gt; &amp; &quot;y&quot;"></iframe></div></div></section>
</body></html>
`);

    expect(readFileSync(res.summary, 'utf8')).toBe(
      summaryOf([
        '| ![before](https://host/gone.before.png?raw=1) | — |',
        '| — | ![after](https://host/new/fresh.after.png?raw=1) |',
        '| ![before](https://host/shop.before.png?raw=1) | ![after](https://host/shop.after.png?raw=1) |',
      ]),
    );
  });

  it('links the pages from the summary when there are no images', async () => {
    const sets = everyStatus();
    const { res } = await write(compareDiagramSets(sets.before, sets.after), sets, false);
    expect(res.images).toEqual([]);
    expect(readFileSync(res.summary, 'utf8')).toBe(
      summaryOf([
        '| [before](gone.before.html) | — |',
        '| — | [after](new/fresh.after.html) |',
        '| [before](shop.before.html) | [after](shop.after.html) |',
      ]),
    );
  });

  it('says so on the overview and in the summary when nothing changed', async () => {
    const sets = everyStatus();
    const { res } = await write(compareDiagramSets(sets.before, sets.after, ['same']), sets);
    expect(res.pages).toEqual([]);
    expect(readFileSync(res.index, 'utf8')).toMatch(
      /<\/p>\n<ul><li>shop\.drawings\.json at v1: .*<\/li><\/ul>\n<p>No diagram changed\.<\/p>\n<\/body><\/html>\n$/,
    );
    expect(readFileSync(res.summary, 'utf8')).toBe([...SUMMARY_HEAD, 'No diagram changed.', ''].join('\n'));
  });
});
