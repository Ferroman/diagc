import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findHome } from './home';

// What the looks' stylesheet has to hold for the cascade to come out right — facts
// no component test sees, since jsdom applies none of it. Kept here, not beside the
// renderer: that package's tsconfig has no node types to open a file with.
const src = path.join(findHome(fileURLToPath(import.meta.url)).root, 'packages', 'renderer', 'src');
const read = (...parts: string[]): string => readFileSync(path.join(src, ...parts), 'utf8');

/** presets.css without its comments */
const css = read('presets.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** every `selector { declarations }` in order, a rule inside an at-rule included */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1]!.trim(),
  body: m[2]!,
  at: m.index,
}));

/** where the block that opens at or after `from` closes */
function blockEnd(from: number): number {
  let depth = 0;
  for (let i = css.indexOf('{', from); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return i;
  }
  return css.length;
}

/** the families fonts.css declares */
const bundledFaces = new Set([...read('fonts.css').matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]));

describe('presets.css', () => {
  // The plan's highlight and its drop target are outlines on a node's own box
  // (styles.css); a look that framed that box with `outline` would replace both.
  it('leaves `outline` to the marks the canvas draws with it', () => {
    expect(rules.filter((r) => /(^|[;\s])outline(-[a-z]+)?\s*:/.test(r.body)).map((r) => r.selector)).toEqual([]);
  });

  // React Flow colours the line grid and the snap dots from the one variable.
  it("keeps a look's grid colour off the snap grid", () => {
    const colouring = rules.filter((r) => r.body.includes('--xy-background-pattern-color'));
    expect(colouring.length).toBeGreaterThan(0);
    for (const r of colouring) expect(r.selector).toContain(':not(.dg-grid-on)');
  });

  // A browser without mask-box-image (Firefox) gets the ascii frames as borders
  // from an @supports block. Its rules weigh what the look's own do, so they
  // win only from below them.
  it('puts the ascii fallback after every other ascii rule', () => {
    const fallback = css.indexOf('@supports not (-webkit-mask-box-image-source');
    expect(fallback).toBeGreaterThan(-1);
    const after = rules.filter((r) => r.at > blockEnd(fallback) && r.selector.includes('.dg-style-ascii'));
    expect(after.map((r) => r.selector)).toEqual([]);
  });

  it('names no font face but the bundled ones', () => {
    const named = rules.flatMap((r) => [...r.body.matchAll(/font(?:-family)?\s*:[^;]*?'([^']+)'/g)].map((m) => m[1]));
    for (const family of named) expect(bundledFaces).toContain(family);
  });
});

describe('fonts.css', () => {
  // An @font-face is the whole document's. Declared as 'Inter', the bundled Latin,
  // two-weight cut would stand in for a host page's own Inter (an Obsidian vault
  // set in it), so each face goes by a name no page uses.
  it('bundles each face under a name of its own', () => {
    expect(bundledFaces.size).toBeGreaterThan(0);
    for (const family of bundledFaces) expect(family).toMatch(/^diagc /);
  });

  it('declares every face a preset asks for', () => {
    const asked = [...read('sketch', 'stylePresets.ts').matchAll(/'(diagc [^']+)'/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(0);
    for (const family of asked) expect(bundledFaces).toContain(family);
  });
});
