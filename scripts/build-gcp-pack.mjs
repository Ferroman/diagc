#!/usr/bin/env node
/**
 * Regenerate the bundled Google Cloud library pack from the official icon
 * archives (https://cloud.google.com/icons).
 *
 *   node scripts/build-gcp-pack.mjs              # download the three archives
 *   node scripts/build-gcp-pack.mjs --src <dir>  # use extracted copies: <dir>/<archive>/…
 *
 * Google ships three archives, one family each:
 *   core-products-icons        the 2025-style icons for the flagship products
 *   google-cloud-legacy-icons  the console icons — still the only per-product
 *                              icon for most services (Pub/Sub, Cloud Functions, …)
 *   category-icons             one icon per product category
 *
 * Writes (all committed, so no network is needed to build or run the studio):
 *   apps/studio/public/library/gcp/<slug>.svg             core product icons
 *   apps/studio/public/library/gcp-products/<slug>.svg    legacy console icons
 *   apps/studio/public/library/gcp-categories/<slug>.svg  category icons
 *   apps/studio/src/library/packs.gcp.ts                  the generated manifest
 *
 * Google does not version the archives; the manifest records the date they were
 * fetched instead.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kw, lit, minifySvg, resolveSource, slugify, svgFiles } from './icon-pack-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY_DIR = path.join(ROOT, 'apps', 'studio', 'public', 'library');
const MANIFEST = path.join(ROOT, 'apps', 'studio', 'src', 'library', 'packs.gcp.ts');

const ARCHIVE_BASE = 'https://services.google.com/fh/files/misc';
const ARCHIVES = ['core-products-icons', 'google-cloud-legacy-icons', 'category-icons'];

/** Words in the legacy folder names (`cloud_sql`, `vertexai`) whose display
 * casing is not plain title case. */
const WORDS = {
  ai: 'AI', api: 'API', apis: 'APIs', automl: 'AutoML', beyondcorp: 'BeyondCorp', bigquery: 'BigQuery',
  cdn: 'CDN', cx: 'CX', dns: 'DNS', ekm: 'EKM', gce: 'GCE', gke: 'GKE', gpu: 'GPU', hsm: 'HSM', ids: 'IDS',
  iot: 'IoT', ip: 'IP', kuberun: 'KubeRun', nat: 'NAT', nlp: 'NLP', os: 'OS', powershell: 'PowerShell',
  pubsub: 'Pub/Sub', qna: 'QnA', sql: 'SQL', ssd: 'SSD', tensorflow: 'TensorFlow', tpu: 'TPU',
  vertexai: 'Vertex AI', vmware: 'VMware', vpn: 'VPN', and: 'and', for: 'for', of: 'of', to: 'to',
};

/**
 * Extra search terms for products whose name does not contain what people
 * type. Keyed by slug, applied in every family (the core and legacy icons of
 * one product share a slug). Only terms the name does NOT already contain.
 */
const ALIASES = {
  gke: ['kubernetes', 'k8s', 'google kubernetes engine'],
  'google-kubernetes-engine': ['gke', 'k8s'],
  'compute-engine': ['vm', 'gce', 'server'],
  'cloud-storage': ['gcs', 'bucket', 'blob', 'object storage'],
  'cloud-run': ['serverless', 'containers'],
  'cloud-functions': ['serverless', 'faas', 'lambda'],
  'pub-sub': ['pubsub', 'messaging', 'topic', 'queue', 'events'],
  bigquery: ['warehouse', 'analytics', 'sql'],
  'cloud-sql': ['postgres', 'mysql', 'sql server', 'database'],
  'cloud-spanner': ['database', 'sql', 'distributed'],
  alloydb: ['postgres', 'database'],
  memorystore: ['redis', 'memcached', 'cache'],
  'virtual-private-cloud': ['vpc', 'network'],
  'cloud-load-balancing': ['lb', 'load balancer'],
  'identity-and-access-management': ['iam', 'permissions'],
  'key-management-service': ['kms', 'encryption'],
  'secret-manager': ['secrets', 'credentials'],
  'vertex-ai': ['ml', 'llm', 'gemini', 'models'],
  'cloud-logging': ['logs', 'stackdriver'],
  'cloud-monitoring': ['metrics', 'alerting', 'stackdriver'],
  'artifact-registry': ['docker', 'registry', 'container registry'],
  'cloud-build': ['ci', 'pipeline'],
  'cloud-armor': ['waf', 'ddos'],
  apigee: ['api gateway', 'api management'],
};

/** `cloud_optimization_ai_-_fleet_routing_api` -> `Cloud Optimization AI - Fleet Routing API`. */
function legacyName(folder) {
  return folder
    .replace(/_-_/g, '_~_') // a spaced dash; parked so the split below keeps it a word of its own
    .split(/_/)
    .map((word) =>
      word
        .split('-')
        .map((w) => WORDS[w] ?? w[0].toUpperCase() + w.slice(1))
        .join('-'),
    )
    .join(' ')
    .replace(/ ~ /g, ' - ');
}

/** `AI _ Machine Learning` -> `AI & Machine Learning` (the `_` stands in for a
 * character the archive could not carry in a folder name). */
const categoryName = (folder) => folder.replace(/\s_\s/g, ' & ');

async function sources(argv) {
  const srcIdx = argv.indexOf('--src');
  if (srcIdx !== -1) {
    const root = argv[srcIdx + 1];
    return { dirs: Object.fromEntries(ARCHIVES.map((a) => [a, path.join(root, a)])), cleanup: async () => {} };
  }
  const dirs = {};
  const cleanups = [];
  for (const a of ARCHIVES) {
    const { dir, cleanup } = await resolveSource([], `${ARCHIVE_BASE}/${a}.zip`, `gcp-${a}`);
    dirs[a] = dir;
    cleanups.push(cleanup);
  }
  return { dirs, cleanup: () => Promise.all(cleanups.map((c) => c())) };
}

/** Write one family's icons to `subdir`, first-wins by slug. `parse(file)`
 * returns `{ slug, name }` or undefined to skip the file. */
async function collect(dir, subdir, parse) {
  const target = path.join(LIBRARY_DIR, subdir);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const seen = new Set();
  const rows = [];
  for (const file of await svgFiles(dir)) {
    const parsed = parse(file);
    if (parsed === undefined || seen.has(parsed.slug)) continue;
    seen.add(parsed.slug);
    await writeFile(path.join(target, `${parsed.slug}.svg`), minifySvg(await readFile(file, 'utf8')));
    rows.push({ ...parsed, keywords: ALIASES[parsed.slug] ?? [] });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/** `<root>/<Top>/<Name>/SVG/<file>.svg` -> `<Name>`, for the two newer archives. */
const productFolder = (file) => path.basename(path.dirname(path.dirname(file)));

async function main() {
  const { dirs, cleanup } = await sources(process.argv.slice(2));
  try {
    const core = await collect(dirs['core-products-icons'], 'gcp', (file) => {
      const name = productFolder(file);
      return { slug: slugify(name), name };
    });
    const products = await collect(dirs['google-cloud-legacy-icons'], 'gcp-products', (file) => {
      const name = legacyName(path.basename(file, '.svg'));
      return { slug: slugify(name), name };
    });
    const categories = await collect(dirs['category-icons'], 'gcp-categories', (file) => {
      const name = categoryName(productFolder(file));
      return { slug: slugify(name), name };
    });

    const used = new Set([...core, ...products].map((r) => r.slug));
    const unused = Object.keys(ALIASES).filter((slug) => !used.has(slug));
    if (unused.length > 0) throw new Error(`ALIASES name slugs not in the archives: ${unused.join(', ')}`);

    await writeFile(MANIFEST, renderManifest({ core, products, categories }));
    process.stderr.write(
      `Google Cloud pack: ${core.length} core, ${products.length} products, ${categories.length} categories\n`,
    );
  } finally {
    await cleanup();
  }
}

function renderRows(fn, rows) {
  return rows.map((r) => `  ${fn}(${lit(r.slug)}, ${lit(r.name)}${kw(r.keywords)}),`).join('\n');
}

function renderManifest({ core, products, categories }) {
  const fetched = new Date().toISOString().slice(0, 10);
  return `// @generated
import type { Library, LibraryCategory, LibraryEntry } from './types';

// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/build-gcp-pack.mjs
// Source: official Google Cloud icon archives (https://cloud.google.com/icons),
// fetched ${fetched}.

/** One entry factory per icon family: same shape, different asset dir and category. */
const family =
  (dir: string, category: string, idPrefix: string) =>
  (slug: string, name: string, keywords?: string[]): LibraryEntry => ({
    id: \`\${idPrefix}\${slug}\`,
    category,
    name,
    ...(keywords !== undefined ? { keywords } : {}),
    template: { type: 'image', image: \`/library/\${dir}/\${slug}.svg\`, width: 64, height: 64 },
  });

const core = family('gcp', 'gcp-core', 'gcp-');
const product = family('gcp-products', 'gcp-products', 'gcp-product-');
const cat = family('gcp-categories', 'gcp-categories', 'gcp-cat-');

// Nested under the panel's 'Google Cloud' group, so the names carry no prefix
// of their own — the group header already says it.
const categories: LibraryCategory[] = [
  { id: 'gcp-core', name: 'Core products', group: 'Google Cloud', builtin: true },
  { id: 'gcp-products', name: 'Products (console style)', group: 'Google Cloud', builtin: true },
  { id: 'gcp-categories', name: 'Category icons', group: 'Google Cloud', builtin: true },
];

const entries: LibraryEntry[] = [
${renderRows('core', core)}
${renderRows('product', products)}
${renderRows('cat', categories)}
];

/** Every official Google Cloud core-product, console and category icon. */
export const GCP_PACK: Library = { categories, entries };
`;
}

await main();
