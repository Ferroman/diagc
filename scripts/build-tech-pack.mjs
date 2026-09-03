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

/** simple-icons ship a bare monochrome path with no fill, which would inherit
 * black — each entry pins the official brand hex from the simple-icons data. */
const si = (name) => `https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/${name}.svg`;

const SOURCES = [
  { slug: 'temporal', url: si('temporal'), fill: '#000000' },
  {
    slug: 'nats',
    url: 'https://raw.githubusercontent.com/cncf/artwork/main/projects/nats/icon/color/nats-icon-color.svg',
  },
  {
    slug: 'starrocks',
    url: 'https://raw.githubusercontent.com/StarRocks/starrocks/main/docs/docusaurus/static/img/logo.svg',
  },
  { slug: 'cloudflare', url: si('cloudflare'), fill: '#F38020' },
  { slug: 'github', url: si('github'), fill: '#181717' },
  { slug: 'github-actions', url: si('githubactions'), fill: '#2088FF' },
  { slug: 'auth0', url: si('auth0'), fill: '#EB5424' },
  // SendGrid left simple-icons; gilbarbara/logos ships the full-color mark.
  { slug: 'sendgrid', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/sendgrid-icon.svg' },
  { slug: 'new-relic', url: si('newrelic'), fill: '#1CE783' },
  { slug: 'clickhouse', url: si('clickhouse'), fill: '#FFCC01' },
  { slug: 'redis', url: si('redis'), fill: '#FF4438' },
  { slug: 'rabbitmq', url: si('rabbitmq'), fill: '#FF6600' },
  { slug: 'postgresql', url: si('postgresql'), fill: '#4169E1' },
  { slug: 'helm', url: si('helm'), fill: '#0F1689' },
  { slug: 'jupyter', url: si('jupyter'), fill: '#F37626' },
  { slug: 'kubernetes', url: si('kubernetes'), fill: '#326CE5' },
];

/** Kubernetes community resource icons (labeled heptagons — "pod", "svc", …).
 * They carry their own blue chrome and label, so they go out bare (no white
 * tile) into their own family dir, matching how they look in k8s diagrams. */
const K8S_ICONS = 'https://raw.githubusercontent.com/kubernetes/community/master/icons/svg';
const K8S_SOURCES = [
  { slug: 'pod', url: `${K8S_ICONS}/resources/labeled/pod.svg` },
  { slug: 'svc', url: `${K8S_ICONS}/resources/labeled/svc.svg` },
  { slug: 'deploy', url: `${K8S_ICONS}/resources/labeled/deploy.svg` },
  { slug: 'ing', url: `${K8S_ICONS}/resources/labeled/ing.svg` },
  { slug: 'secret', url: `${K8S_ICONS}/resources/labeled/secret.svg` },
  { slug: 'node', url: `${K8S_ICONS}/infrastructure_components/labeled/node.svg` },
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

/** Bare passthrough: strip the fat, normalise the root tag onto the source's
 * own viewBox at a 64px footprint, keep the artwork (and its labels) intact.
 * The rebuilt root drops the original namespace declarations, so every
 * Inkscape/RDF leftover must go too — an undeclared prefix is invalid XML and
 * a browser refuses the whole file. */
function bare(svg) {
  const [minX, minY, w, h] = viewBox(svg);
  let inner = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<metadata[\s>][\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/\s(?:inkscape|sodipodi):[a-zA-Z-]+="[^"]*"/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
  if (!/<(text|tspan)[\s>]/.test(inner)) inner = inner.replace(/>\s+</g, '><');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="${round(minX)} ${round(minY)} ${round(w)} ${round(h)}" width="${TILE}" height="${TILE}">` +
    `${inner}</svg>\n`
  );
}

async function fetchSvg(slug, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${slug}: ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

await mkdir(OUT, { recursive: true });
for (const { slug, url, fill } of SOURCES) {
  await writeFile(path.join(OUT, `${slug}.svg`), tile(await fetchSvg(slug, url), fill));
  process.stderr.write(`tech/${slug}.svg\n`);
}

const K8S_OUT = path.join(ROOT, 'apps', 'studio', 'public', 'library', 'k8s');
await mkdir(K8S_OUT, { recursive: true });
for (const { slug, url } of K8S_SOURCES) {
  await writeFile(path.join(K8S_OUT, `${slug}.svg`), bare(await fetchSvg(slug, url)));
  process.stderr.write(`k8s/${slug}.svg\n`);
}
