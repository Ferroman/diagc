import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compareDiagramSets } from './compare';
import { loadDiagramSet } from './load';
import { OVERVIEW_SCRIPT } from './overview';
import { writeDiffPages } from './pages';
import { DG_DATA_SENTINEL, stampHtml } from '../publish/html';
import { THEME_HEAD_SCRIPT, THEME_SWITCH } from '../publish/pageTheme';
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
      'diff/shop.diff.html',
    ]);
    expect(rendered.sort()).toEqual(res.pages.map((p) => path.relative(out, p)).sort());
    expect(res.images.map((p) => path.relative(out, p))).toContain('diff/shop.diff.png');

    const stamped = (rel: string) => {
      const html = readFileSync(path.join(out, 'diff', rel), 'utf8');
      return JSON.parse(
        html.slice(html.indexOf('>', html.indexOf('id="dg-data"')) + 1, html.lastIndexOf('</script>')),
      ) as {
        model: { nodes: { id: string }[]; relations: { id: string }[] };
        diff: { marks: unknown; combined?: unknown };
        layout?: unknown;
      };
    };
    // both versions in one model: the removed node and its relation are back in it
    const combined = stamped('shop.diff.html');
    expect(combined.model.nodes.map((n) => n.id)).toContain('legacy');
    expect(combined.model.relations.map((r) => r.id)).toContain('web->legacy#0');
    expect(combined.diff).toEqual({
      marks: {
        nodes: { api: 'changed', db: 'added', legacy: 'removed' },
        relations: { 'web->api#0': 'changed', 'api->db#0': 'added', 'web->legacy#0': 'removed' },
      },
      combined: { planes: {} },
    });
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
    // a diagram both sides have opens on the combined picture; its sides load on demand
    expect(index).toContain('<iframe src="shop.diff.html"');
    expect(index).toContain('<iframe data-src="shop.before.html?export=1"');
    expect(index).toContain('<iframe src="new/fresh.after.html?export=1"');
    expect(index).toContain(
      '<li class="add"><button type="button" data-focus="{&quot;node&quot;:&quot;db&quot;}">+ Orders DB [database]</button></li>',
    );
    // the overview follows the reader's theme, as the index page does
    expect(index).toContain(THEME_HEAD_SCRIPT);
    expect(index).toContain(':root[data-theme=dark]');
    expect(index).toContain('id="dg-theme"');
    const summary = readFileSync(res.summary, 'utf8');
    expect(summary).toContain('| ![before](shop.before.png) | ![after](shop.after.png) |');
    expect(summary).toContain('| ![before](gone.before.png) | — |');
    expect(summary).toContain('- `~` API -> API gateway (renamed)');
    expect(summary).toContain('**Changes**\n\n![Changes](shop.diff.png)');
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
  const summaryOf = (cells: [string, string, string], combined: string[] = []) =>
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
      ...combined,
    ].join('\n');

  it('writes the pages in order, each with its data, and the overview and summary byte for byte', async () => {
    const sets = everyStatus();
    const { out, res, rendered, rel } = await write(compareDiagramSets(sets.before, sets.after), sets);
    const pages = ['diff/gone.before', 'diff/new/fresh.after', 'diff/shop.before', 'diff/shop.after'];
    expect(rel(res.pages)).toEqual([...pages, 'diff/shop.diff'].map((p) => `${p}.html`));
    // The three planes of the combined model show the same changes, so it gets one
    // picture: its first plane's.
    expect(rel(res.images)).toEqual([...pages, 'diff/shop.diff'].map((p) => `${p}.png`));
    expect(rendered).toEqual([...pages, 'diff/shop.diff'].map((p) => `${p}.html ${p}.png`));
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

    // The overview from its styles on, byte for byte.
    const index = readFileSync(res.index, 'utf8');
    expect(index.slice(index.indexOf('</style>'))).toBe(`</style></head><body>
<header><h1>Diagram diff · v1 → feat/&lt;x&gt; &amp; &quot;y&quot;</h1>${THEME_SWITCH}</header>
<p class="key"><span><i style="border-color:#16a34a"></i>added</span><span><i style="border-color:#dc2626;border-style:dashed"></i>removed</span><span><i style="border-color:#d97706"></i>changed</span><span><i style="border-color:#d97706;border-style:dashed"></i>holds a change (folded box, on the linked pages)</span></p>
<ul><li>shop.drawings.json at v1: not a drawings overlay — compared and drawn without it</li><li>shop.layout.json at feat/&lt;x&gt; &amp; &quot;y&quot;: does not parse (oops) — compared and drawn without it</li></ul>
<section><h2>broken</h2><p>Not compared: does not compile at feat/&lt;x&gt; &amp; &quot;y&quot;: bad &lt;json&gt;</p></section>
<section><h2>gone</h2><div class="diagram"><ul><li class="del">- diagram removed: gone</li></ul><div class="pair"><div class="side"><h3><a href="gone.before.html">Before · v1</a></h3><iframe src="gone.before.html?export=1" title="Before · v1"></iframe></div><div class="side empty"><h3>After · feat/&lt;x&gt; &amp; &quot;y&quot;</h3><p>not present</p></div></div></div></section>
<section><h2>new/fresh</h2><div class="diagram"><ul><li class="add">+ new diagram: fresh (1 nodes, 0 relations)</li></ul><div class="pair"><div class="side empty"><h3>Before · v1</h3><p>not present</p></div><div class="side"><h3><a href="new/fresh.after.html">After · feat/&lt;x&gt; &amp; &quot;y&quot;</a></h3><iframe src="new/fresh.after.html?export=1" title="After · feat/&lt;x&gt; &amp; &quot;y&quot;"></iframe></div></div></div></section>
<section><h2>shop</h2><div class="diagram"><ul><li class="add"><button type="button" data-focus="{&quot;node&quot;:&quot;db&quot;}">+ Orders &lt;DB&gt; [database]</button></li><li class="add"><button type="button" data-focus="{&quot;node&quot;:&quot;note&quot;}">+ note</button></li><li class="del"><button type="button" data-focus="{&quot;node&quot;:&quot;legacy&quot;}">- Legacy [service]</button></li><li class="del"><button type="button" data-focus="{&quot;node&quot;:&quot;tmp&quot;}">- tmp</button></li><li class="chg"><button type="button" data-focus="{&quot;node&quot;:&quot;web&quot;}">~ Web: type</button><dl><dt>type</dt><dd class="was">service</dd><dd>webapp</dd></dl></li><li class="chg"><button type="button" data-focus="{&quot;node&quot;:&quot;api&quot;}">~ API -&gt; API gateway (renamed): description</button><dl><dt>description</dt><dd class="was">—</dd><dd>edge</dd></dl></li><li class="add"><button type="button" data-focus="{&quot;relation&quot;:&quot;api-&gt;db#0&quot;}">+ API gateway -&gt; Orders &lt;DB&gt; (reads: SQL)</button></li><li class="del"><button type="button" data-focus="{&quot;relation&quot;:&quot;web-&gt;legacy#0&quot;}">- Web -&gt; Legacy (sync)</button></li><li class="chg"><button type="button" data-focus="{&quot;relation&quot;:&quot;web-&gt;api#0&quot;}">~ Web -&gt; API gateway (sync: HTTPS): label</button><dl><dt>label</dt><dd class="was">—</dd><dd>HTTPS</dd></dl></li><li class="add">+ layer new</li><li class="del">- layer old</li><li class="add"><button type="button" data-focus="{&quot;plane&quot;:&quot;ops&quot;}">+ plane ops</button></li><li class="del"><button type="button" data-focus="{&quot;plane&quot;:&quot;flow&quot;}">- plane flow</button></li></ul><div><div class="views"><button type="button" data-show="combined" aria-pressed="true">Combined</button><button type="button" data-show="sides" aria-pressed="false">Side by side</button></div><div class="combined" data-view="combined"><iframe src="shop.diff.html" title="v1 → feat/&lt;x&gt; &amp; &quot;y&quot;"></iframe></div><div class="pair" data-view="sides" hidden><div class="side"><h3><a href="shop.before.html">Before · v1</a></h3><iframe data-src="shop.before.html?export=1" title="Before · v1"></iframe></div><div class="side"><h3><a href="shop.after.html">After · feat/&lt;x&gt; &amp; &quot;y&quot;</a></h3><iframe data-src="shop.after.html?export=1" title="After · feat/&lt;x&gt; &amp; &quot;y&quot;"></iframe></div></div></div></div></section>
${OVERVIEW_SCRIPT}
</body></html>
`);
    expect(index).toContain(THEME_HEAD_SCRIPT);

    expect(readFileSync(res.summary, 'utf8')).toBe(
      summaryOf(
        [
          '| ![before](https://host/gone.before.png?raw=1) | — |',
          '| — | ![after](https://host/new/fresh.after.png?raw=1) |',
          '| ![before](https://host/shop.before.png?raw=1) | ![after](https://host/shop.after.png?raw=1) |',
        ],
        ['**Changes on Main**', '', '![Changes on Main](https://host/shop.diff.png?raw=1)', ''],
      ),
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
      /<\/p>\n<ul><li>shop\.drawings\.json at v1: .*<\/li><\/ul>\n<p>No diagram changed\.<\/p>\n<script>[^]*<\/script>\n<\/body><\/html>\n$/,
    );
    expect(readFileSync(res.summary, 'utf8')).toBe([...SUMMARY_HEAD, 'No diagram changed.', ''].join('\n'));
  });
});
