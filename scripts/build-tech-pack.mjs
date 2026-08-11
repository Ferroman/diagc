#!/usr/bin/env node
/**
 * Regenerate the bundled "Tech" library pack — vendor logos that are not part of
 * a cloud provider's own icon set.
 *
 *   node scripts/build-tech-pack.mjs
 *
 * Each upstream logo is normalised onto the same 64×64 rounded white tile the
 * AWS icons use, so the marks sit at one visual weight in the palette and stay
 * legible on both the light and the dark canvas (several are monochrome black,
 * which would vanish on the dark theme unbacked).
 *
 * Writes apps/studio/public/library/tech/<slug>.svg — the manifest entries live
 * in apps/studio/src/library/packs.ts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps', 'studio', 'public', 'library', 'tech');

const TILE = 64;
const PADDING = 10;
const CONTENT = TILE - PADDING * 2;

const SOURCES = [
  {
    slug: 'temporal',
    url: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/temporal.svg',
    // simple-icons ships a bare path with no fill, which would inherit black.
    fill: '#000000',
  },
  {
    slug: 'nats',
    url: 'https://raw.githubusercontent.com/cncf/artwork/main/projects/nats/icon/color/nats-icon-color.svg',
  },
  {
    slug: 'starrocks',
    url: 'https://raw.githubusercontent.com/StarRocks/starrocks/main/docs/docusaurus/static/img/logo.svg',
  },
];

/** viewBox wins; fall back to the width/height attributes when it is absent. */
function viewBox(svg) {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (vb !== undefined) {
    const [minX, minY, w, h] = vb.trim().split(/[\s,]+/).map(Number);
    if (w > 0 && h > 0) return [minX, minY, w, h];
  }
  const attr = (name) => Number(new RegExp(`\\b${name}="([\\d.]+)`).exec(svg)?.[1] ?? 0);
  const [w, h] = [attr('width'), attr('height')];
  if (w > 0 && h > 0) return [0, 0, w, h];
  throw new Error('SVG has neither a usable viewBox nor width/height');
}

const round = (n) => Number(n.toFixed(4));

function tile(svg, fill) {
  const [minX, minY, w, h] = viewBox(svg);
  const inner = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/>\s+</g, '><')
    .trim();

  const scale = CONTENT / Math.max(w, h);
  const tx = PADDING + (CONTENT - w * scale) / 2 - minX * scale;
  const ty = PADDING + (CONTENT - h * scale) / 2 - minY * scale;
  const attrs = `transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})"${
    fill !== undefined ? ` fill="${fill}"` : ''
  }`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${TILE} ${TILE}" width="${TILE}" height="${TILE}">` +
    `<rect width="${TILE}" height="${TILE}" rx="10" fill="#ffffff"/>` +
    `<g ${attrs}>${inner}</g>` +
    `</svg>\n`
  );
}

await mkdir(OUT, { recursive: true });
for (const { slug, url, fill } of SOURCES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${slug}: ${res.status} ${res.statusText} for ${url}`);
  await writeFile(path.join(OUT, `${slug}.svg`), tile(await res.text(), fill));
  process.stderr.write(`tech/${slug}.svg\n`);
}
