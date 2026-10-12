import { describe, expect, it } from 'vitest';
import { compareDiagramSets } from './compare';
import { indexHtml } from './overview';
import { THEME_HEAD_SCRIPT } from '../publish/pageTheme';
import { everyStatus } from '../../test-fixtures/diff';

const { before, after } = everyStatus();
const diffs = compareDiagramSets(before, after);
const pages = new Map([
  ['gone', { before: 'gone.before' }],
  ['new/fresh', { after: 'new/fresh.after' }],
  ['shop', { before: 'shop.before', after: 'shop.after' }],
]);
const html = indexHtml(diffs, pages, before, after);
const AFTER = 'feat/&lt;x&gt; &amp; &quot;y&quot;';

describe('indexHtml', () => {
  it('puts the two sides of a changed diagram next to each other, linking each page', () => {
    expect(html).toContain(
      '<div class="side"><h3><a href="shop.before.html">Before · v1</a></h3><iframe src="shop.before.html?export=1" title="Before · v1"></iframe></div>',
    );
    expect(html).toContain(`<iframe src="new/fresh.after.html?export=1" title="After · ${AFTER}"></iframe>`);
  });

  it('shows a side the diagram does not have as not present', () => {
    expect(html).toContain('<div class="side empty"><h3>Before · v1</h3><p>not present</p></div>');
    expect(html).toContain(`<div class="side empty"><h3>After · ${AFTER}</h3><p>not present</p></div>`);
  });

  it('lists a diagram it could not compare, with why, and leaves out the unchanged', () => {
    expect(html).toContain(
      `<section><h2>broken</h2><p>Not compared: does not compile at ${AFTER}: bad &lt;json&gt;</p></section>`,
    );
    expect(html).not.toContain('<h2>same</h2>');
  });

  it('colours each change by its sign', () => {
    expect(html).toContain('<li class="add">+ Orders &lt;DB&gt; [database]</li>');
    expect(html).toContain('<li class="del">- Legacy [service]</li>');
    expect(html).toContain('<li class="chg">~ API -&gt; API gateway (renamed): description</li>');
  });

  it('names each sidecar left out, from both sides', () => {
    expect(html).toContain(
      `<ul><li>shop.drawings.json at v1: not a drawings overlay — compared and drawn without it</li><li>shop.layout.json at ${AFTER}: does not parse (oops) — compared and drawn without it</li></ul>`,
    );
  });

  it('says so when nothing changed', () => {
    const none = indexHtml(compareDiagramSets(before, after, ['same']), new Map(), before, after);
    expect(none).toContain('<p>No diagram changed.</p>');
    expect(none).not.toContain('<section>');
  });

  it("follows the reader's theme", () => {
    expect(html).toContain(THEME_HEAD_SCRIPT);
    expect(html).toContain(':root[data-theme=dark]');
    expect(html).toContain('id="dg-theme"');
  });
});
