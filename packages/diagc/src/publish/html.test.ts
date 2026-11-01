import { describe, expect, it } from 'vitest';
import {
  DG_DATA_SENTINEL,
  linkedPageHtml,
  SOURCE_NOTICE,
  SOURCE_URL,
  stampHtml,
  VIEWER_DIR,
  viewerRelFor,
  withSourceNotice,
} from './html';

const shell = `<script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`;
const doctypeShell = `<!doctype html>\n<html><head></head><body>${shell}</body></html>`;

describe('stampHtml', () => {
  it('replaces the sentinel with escaped JSON of the data', () => {
    const out = stampHtml(shell, { model: { id: 'm' }, layout: undefined });
    expect(out).not.toContain(DG_DATA_SENTINEL);
    expect(out).toContain('"id":"m"');
  });
  it('escapes </script> so it cannot break out of the tag', () => {
    const out = stampHtml(shell, { model: { id: '</script>' } });
    expect(out).not.toContain('</script></script>');
    expect(out).toContain('\\u003c/script>');
  });
  it('treats $-patterns in the data as literal text, not replacement patterns', () => {
    // String.prototype.replace(pattern, stringReplacement) special-cases
    // $$, $&, $`, $' in the replacement STRING even for a plain-string
    // search pattern. If stampHtml ever passes the JSON string directly as
    // the replacement argument (instead of via a replacer function), a
    // data value containing $' would splice the raw (unescaped) tail of
    // `shell` back into the output -- reintroducing a literal </script>
    // breakout despite the `<` -> < escaping.
    const payload = { model: { id: "a$$b$&c$'</script>y" } };
    const out = stampHtml(shell, payload);

    expect(out).not.toContain(DG_DATA_SENTINEL);

    // The only </script> in the output must be the shell's own closing
    // tag for the <script id="dg-data"> element -- not a raw breakout
    // spliced in from `shell`'s tail via a $' replacement pattern.
    const scriptCloseCount = (out.match(/<\/script>/g) ?? []).length;
    expect(scriptCloseCount).toBe(1);
    expect(out).not.toContain("$'</script>y");

    // The escaped form must be present since '<' in the data is escaped
    // to < before embedding.
    expect(out).toContain('\\u003c/script>');

    // The embedded JSON must round-trip back to the exact input.
    const match = out.match(/<script id="dg-data" type="application\/json">([\s\S]*)<\/script>$/);
    expect(match).not.toBeNull();
    const embedded = match![1]!.replace(/\\u003c/g, '<');
    expect(JSON.parse(embedded)).toEqual(payload);
  });
});

describe('withSourceNotice', () => {
  it('keeps the notice after the doctype so the page cannot fall into quirks mode', () => {
    const out = withSourceNotice(doctypeShell);
    // The load-bearing assertion: a comment placed BEFORE the doctype triggers quirks
    // mode in every browser, which changes box sizing and would silently alter the
    // published layout. Order matters more than presence here.
    expect(out.indexOf('<!doctype html>')).toBeLessThan(out.indexOf(SOURCE_NOTICE));
    expect(out.trimStart().startsWith('<!doctype html>')).toBe(true);
  });

  it('still emits the offer when the shell has no doctype', () => {
    expect(withSourceNotice(shell)).toContain(SOURCE_URL);
  });

  it('does not contain sequences that would truncate the HTML comment', () => {
    // `--` closes a comment early, which would spill the rest of the notice into the
    // document as visible text.
    expect(SOURCE_NOTICE.slice('<!--'.length, -'-->'.length)).not.toContain('--');
  });

  it('names the licence and offers the source', () => {
    expect(SOURCE_NOTICE).toContain('AGPL-3.0-only');
    expect(SOURCE_NOTICE).toContain(SOURCE_URL);
  });
});

describe('stampHtml source offer', () => {
  it('carries the offer into every stamped page', () => {
    expect(stampHtml(doctypeShell, { model: { id: 'm' } })).toContain(SOURCE_URL);
  });

  it('adds the offer without introducing another script tag', () => {
    const out = stampHtml(shell, { model: { id: 'm' } });
    expect((out.match(/<\/script>/g) ?? []).length).toBe(1);
  });
});

describe('viewerRelFor', () => {
  it('reaches the viewer folder from a page at any depth', () => {
    expect(VIEWER_DIR).toBe('diagc-viewer');
    expect(viewerRelFor('shop')).toBe('./diagc-viewer');
    expect(viewerRelFor('team/app')).toBe('../diagc-viewer');
    expect(viewerRelFor('a/b/c')).toBe('../../diagc-viewer');
  });
});

describe('linkedPageHtml', () => {
  const out = linkedPageHtml({ model: { id: 'm', name: '</title><b>' } }, '../diagc-viewer', 'A <b> & "title"');

  it('is a whole page that links the stylesheet and the script by the path it is given', () => {
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<meta charset="UTF-8">');
    expect(out).toContain('<meta name="color-scheme" content="light dark">');
    expect(out).toContain('<link rel="stylesheet" href="../diagc-viewer/viewer.css">');
    expect(out).toContain('<script src="../diagc-viewer/viewer.js"></script>');
    expect(out).toContain('<div id="root"></div>');
  });

  it('titles the page with the name, escaped', () => {
    expect(out).toContain('<title>A &lt;b&gt; &amp; &quot;title&quot;</title>');
  });

  it('inlines the data with < escaped, so nothing in it can close its tag', () => {
    expect(out).toContain('<script id="dg-data" type="application/json">');
    expect(out).toContain('\\u003c/title>');
    expect((out.match(/<\/script>/g) ?? []).length).toBe(2);
    const match = /<script id="dg-data" type="application\/json">([\s\S]*?)<\/script>/.exec(out);
    expect(JSON.parse(match![1]!.replace(/\\u003c/g, '<'))).toEqual({ model: { id: 'm', name: '</title><b>' } });
  });

  it('carries the source offer, after the doctype, worded for a page that loads the viewer', () => {
    expect(out).toContain(SOURCE_URL);
    expect(out.indexOf('<!doctype html>')).toBeLessThan(out.indexOf('<!--'));
    expect(out).toContain('loads the diagc viewer');
    expect(out.slice(out.indexOf('<!--') + 4, out.indexOf('-->'))).not.toContain('--');
  });
});
