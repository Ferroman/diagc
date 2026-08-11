import { describe, expect, it } from 'vitest';
import { DG_DATA_SENTINEL, stampHtml } from './html';

const shell = `<script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`;

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
