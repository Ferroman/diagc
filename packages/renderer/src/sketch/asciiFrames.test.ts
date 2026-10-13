import { describe, expect, it } from 'vitest';
import { asciiFrameVars } from './asciiFrames';

/** the SVG a frame variable's `url("data:…")` carries */
const svgOf = (url: string | undefined): string =>
  decodeURIComponent(/^url\("data:image\/svg\+xml,(.*)"\)$/.exec(url ?? '')?.[1] ?? '');

describe('asciiFrameVars', () => {
  const vars = asciiFrameVars();

  it('names one frame per kind the look draws', () => {
    expect(Object.keys(vars)).toEqual([
      '--dg-ascii-box',
      '--dg-ascii-table',
      '--dg-ascii-hex',
      '--dg-ascii-pill',
      '--dg-ascii-group',
    ]);
  });

  it('is a 3×3 grid of 8×14 character cells with the middle one empty', () => {
    const svg = svgOf(vars['--dg-ascii-box']);
    expect(svg).toMatch(/^<svg xmlns='http:\/\/www.w3.org\/2000\/svg' width='24' height='42'>/);
    expect(svg.match(/<g transform=/g)).toHaveLength(8);
    expect(svg).not.toContain('translate(8 14)');
  });

  it('escapes what a CSS url() cannot carry raw', () => {
    for (const url of Object.values(vars)) expect(url.slice('url("'.length, -'")'.length)).not.toMatch(/[<>#"]/);
  });

  it("types a table's top edge as = and a box's as -", () => {
    expect(svgOf(vars['--dg-ascii-table'])).toContain("<g transform='translate(8 0)'><rect x='1.5' y='4.8'");
    expect(svgOf(vars['--dg-ascii-box'])).toContain("<g transform='translate(8 0)'><rect x='1.5' y='6.25'");
  });
});
