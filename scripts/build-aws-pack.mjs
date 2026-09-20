#!/usr/bin/env node
/**
 * Regenerate the bundled AWS library pack from the official AWS Architecture
 * Icons package.
 *
 *   node scripts/build-aws-pack.mjs                    # download the pinned release
 *   node scripts/build-aws-pack.mjs --src <dir>        # use an already-extracted package
 *   node scripts/build-aws-pack.mjs --zip <file>       # use a downloaded zip
 *
 * Writes (all committed, so no network is needed to build or run the studio):
 *   apps/studio/public/library/aws/<slug>.svg             architecture service icons
 *   apps/studio/public/library/aws-resources/<slug>.svg   resource icons
 *   apps/studio/public/library/aws-groups/<slug>.svg      group/boundary icons
 *   apps/studio/public/library/aws-categories/<slug>.svg  category icons
 *   apps/studio/src/library/packs.aws.ts                  the generated manifest
 *
 * Icon file names must satisfy LIBRARY_IMAGE_REF (@diagc/core): exactly
 * `/library/<kebab-dir>/<kebab-file>.<ext>`, lowercase, one directory level.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AWS_ALIASES, AWS_CATEGORY_ALIASES } from './aws-aliases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY_DIR = path.join(ROOT, 'apps', 'studio', 'public', 'library');
const MANIFEST = path.join(ROOT, 'apps', 'studio', 'src', 'library', 'packs.aws.ts');

/** Pinned release. AWS ships quarterly (Q1/Q2/Q3); bump both when updating. */
const RELEASE = '07312026';
const RELEASE_URL =
  'https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip';

/** Legacy file names referenced by diagrams authored against the old placeholder
 * pack. Kept as copies of the real icon so those diagrams keep resolving; they
 * are deliberately NOT manifest entries (the real slugs are). */
const LEGACY_ALIASES = {
  'lambda.svg': 'aws-lambda',
  's3.svg': 'amazon-simple-storage-service',
  'sns.svg': 'amazon-simple-notification-service',
  'dynamodb.svg': 'amazon-dynamodb',
  'api-gateway.svg': 'amazon-api-gateway',
  'cloudwatch.svg': 'amazon-cloudwatch',
};

// ---------------------------------------------------------------- helpers ---

/** Lowercase kebab slug restricted to [a-z0-9-], per LIBRARY_IMAGE_REF. */
function slugify(s) {
  return s
    .replace(/&/g, '-and-')
    .replace(/\+/g, '-plus-')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** AWS encodes display names as dash-joined words; restore the spaces. */
const displayName = (s) => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Drop the parts of an AWS SVG that cost bytes but carry nothing: the XML
 * prolog, comments, and the `<title>` echo of the file name (which browsers
 * would surface as a tooltip over the icon). Inter-tag whitespace is collapsed
 * only when the file has no text nodes to damage.
 */
function minifySvg(src) {
  let out = src
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<desc>[\s\S]*?<\/desc>/g, '');
  if (!/<(text|tspan)[\s>]/.test(out)) out = out.replace(/>\s+</g, '><');
  return `${out.trim()}\n`;
}

async function svgFiles(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith('.svg') && !e.parentPath.includes('__MACOSX')) {
      found.push(path.join(e.parentPath, e.name));
    }
  }
  return found.sort();
}

/** First-wins: AWS lists a handful of icons under two categories. */
function claim(seen, slug, file) {
  if (seen.has(slug)) return false;
  seen.set(slug, file);
  return true;
}

async function resolveSource(argv) {
  const srcIdx = argv.indexOf('--src');
  if (srcIdx !== -1) return { dir: argv[srcIdx + 1], cleanup: undefined };

  const work = mkdtempSync(path.join(tmpdir(), 'aws-icons-'));
  const zipIdx = argv.indexOf('--zip');
  let zip = argv[zipIdx + 1];
  if (zipIdx === -1) {
    zip = path.join(work, 'icons.zip');
    process.stderr.write(`Downloading ${RELEASE_URL}\n`);
    const res = await fetch(RELEASE_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  }
  const dir = path.join(work, 'pkg');
  execFileSync('unzip', ['-qo', zip, '-d', dir]);
  return { dir, cleanup: () => rm(work, { recursive: true, force: true }) };
}

// ------------------------------------------------------------ collection ---

/**
 * Read one icon family out of the package.
 *
 * `parse(file)` returns `{ category, slug, name, keywords }` or undefined to
 * skip the file; every accepted icon is written to `outDir` and returned as a
 * manifest row.
 */
async function collect(pkgDir, familyPrefix, subdir, parse) {
  const roots = (await readdir(pkgDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith(familyPrefix))
    .map((e) => path.join(pkgDir, e.name));
  if (roots.length === 0) throw new Error(`No '${familyPrefix}*' directory in ${pkgDir}`);

  const target = path.join(LIBRARY_DIR, subdir);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const seen = new Map();
  const rows = [];
  for (const root of roots) {
    for (const file of await svgFiles(root)) {
      const parsed = parse(file, root);
      if (parsed === undefined) continue;
      if (!claim(seen, parsed.slug, file)) continue;
      await writeFile(path.join(target, `${parsed.slug}.svg`), minifySvg(await readFile(file, 'utf8')));
      rows.push(parsed);
    }
  }
  rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { rows, target };
}

/** `Arch_Compute` / `Res_Compute` -> `compute`, folding AWS's naming drift. */
function categorySlug(dirName) {
  const bare = dirName.replace(/^(Arch|Res)_/, '');
  const slug = slugify(bare);
  return AWS_CATEGORY_ALIASES[slug] ?? slug;
}

async function main() {
  const { dir: pkgDir, cleanup } = await resolveSource(process.argv.slice(2));
  try {
    // Architecture service icons: Arch_<Category>/64/Arch_<Name>_64.svg
    const services = await collect(pkgDir, 'Architecture-Service-Icons', 'aws', (file) => {
      if (path.basename(path.dirname(file)) !== '64') return undefined;
      const core = path.basename(file, '.svg').replace(/^Arch_/, '').replace(/_64$/, '');
      const category = categorySlug(path.basename(path.dirname(path.dirname(file))));
      const slug = slugify(core);
      return { category, slug, name: displayName(core), keywords: AWS_ALIASES[slug] ?? [] };
    });

    // Resource icons: Res_<Category>/Res_<Service>_<Resource>_48.svg
    const resources = await collect(pkgDir, 'Resource-Icons', 'aws-resources', (file) => {
      const base = path.basename(file, '.svg');
      if (!base.endsWith('_48')) return undefined;
      const core = base.replace(/^Res_/, '').replace(/_48$/, '');
      const parts = core.split('_');
      const category = categorySlug(path.basename(path.dirname(file)));
      const parentSlug = slugify(parts[0] ?? '');
      return {
        category,
        slug: slugify(core),
        name: displayName(parts.join(' ')),
        keywords: AWS_ALIASES[parentSlug] ?? [],
      };
    });

    // Group icons: <Name>_32[_Dark].svg — the boundary boxes (VPC, Region, …)
    const groups = await collect(pkgDir, 'Architecture-Group-Icons', 'aws-groups', (file) => {
      const base = path.basename(file, '.svg');
      const dark = base.endsWith('_Dark');
      const core = base.replace(/_Dark$/, '').replace(/_32$/, '');
      return {
        category: 'groups',
        slug: slugify(dark ? `${core}-dark` : core),
        name: `${displayName(core)}${dark ? ' (dark)' : ''}`,
        keywords: ['group', 'boundary', 'container'],
      };
    });

    // Category icons: Arch-Category_64/Arch-Category_<Name>_64.svg
    const categories = await collect(pkgDir, 'Category-Icons', 'aws-categories', (file) => {
      if (path.basename(path.dirname(file)) !== 'Arch-Category_64') return undefined;
      const core = path.basename(file, '.svg').replace(/^Arch-Category_/, '').replace(/_64$/, '');
      return { category: 'categories', slug: slugify(core), name: displayName(core), keywords: ['category'] };
    });

    // Legacy names kept resolvable for diagrams authored against the old pack.
    for (const [legacy, slug] of Object.entries(LEGACY_ALIASES)) {
      const from = path.join(LIBRARY_DIR, 'aws', `${slug}.svg`);
      await writeFile(path.join(LIBRARY_DIR, 'aws', legacy), await readFile(from));
    }

    await writeFile(MANIFEST, renderManifest({ services, resources, groups, categories }));

    const total = services.rows.length + resources.rows.length + groups.rows.length + categories.rows.length;
    process.stderr.write(
      `AWS pack ${RELEASE}: ${services.rows.length} services, ${resources.rows.length} resources, ` +
        `${groups.rows.length} groups, ${categories.rows.length} categories (${total} entries)\n`,
    );
  } finally {
    await cleanup?.();
  }
}

// -------------------------------------------------------------- rendering ---

const CATEGORY_TITLES = {
  ai: 'AI',
  iot: 'IoT',
  vr: 'VR',
};

/** `networking-content-delivery` -> `Networking Content Delivery`. */
function categoryTitle(slug) {
  return slug
    .split('-')
    .map((w) => CATEGORY_TITLES[w] ?? w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const lit = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const kw = (words) => (words.length === 0 ? '' : `, [${words.map(lit).join(', ')}]`);

function renderRows(fn, rows) {
  return rows.map((r) => `  ${fn}(${lit(r.category)}, ${lit(r.slug)}, ${lit(r.name)}${kw(r.keywords)}),`).join('\n');
}

function renderManifest({ services, resources, groups, categories }) {
  const catIds = [...new Set([...services.rows, ...resources.rows].map((r) => r.category))].sort();
  // Nested under the panel's 'AWS' group, so the names carry no 'AWS ·' prefix
  // of their own — the group header already says it.
  const categoryLines = [
    ...catIds.map((id) => `  { id: 'aws-${id}', name: '${categoryTitle(id)}', group: 'AWS', builtin: true },`),
    `  { id: 'aws-groups', name: 'Groups', group: 'AWS', builtin: true },`,
    `  { id: 'aws-categories', name: 'Category icons', group: 'AWS', builtin: true },`,
  ].join('\n');

  return `import type { Library, LibraryCategory, LibraryEntry } from './types';

// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/build-aws-pack.mjs
// Source: official AWS Architecture Icons package, release ${RELEASE}.

/** The AWS icon release these entries were generated from (MMDDYYYY). */
export const AWS_ICON_RELEASE = '${RELEASE}';

/** One entry factory per icon family: same shape, different asset dir and the
 * family's native pixel size (which becomes the placed node's footprint). */
const family =
  (dir: string, size: number, idPrefix = '') =>
  (category: string, slug: string, name: string, keywords?: string[]): LibraryEntry => ({
    id: \`\${idPrefix}\${slug}\`,
    category: \`aws-\${category}\`,
    name,
    ...(keywords !== undefined ? { keywords } : {}),
    template: { type: 'image', image: \`/library/\${dir}/\${slug}.svg\`, width: size, height: size },
  });

const svc = family('aws', 64);
const res = family('aws-resources', 48, 'aws-res-');
const grp = family('aws-groups', 64, 'aws-group-');
const cat = family('aws-categories', 64, 'aws-cat-');

const categories: LibraryCategory[] = [
${categoryLines}
];

const entries: LibraryEntry[] = [
${renderRows('svc', services.rows)}
${renderRows('res', resources.rows)}
${renderRows('grp', groups.rows)}
${renderRows('cat', categories.rows)}
];

/** Every official AWS architecture, resource, group and category icon. */
export const AWS_PACK: Library = { categories, entries };
`;
}

await main();
