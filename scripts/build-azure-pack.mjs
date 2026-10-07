#!/usr/bin/env node
/**
 * Regenerate the bundled Azure library pack from the official Azure Public
 * Service Icons package (https://learn.microsoft.com/azure/architecture/icons/).
 *
 *   node scripts/build-azure-pack.mjs                    # download the pinned release
 *   node scripts/build-azure-pack.mjs --src <dir>        # use an already-extracted package
 *   node scripts/build-azure-pack.mjs --zip <file>       # use a downloaded zip
 *
 * Writes (all committed, so no network is needed to build or run the studio):
 *   apps/studio/public/library/azure/<slug>.svg   service icons
 *   apps/studio/src/library/packs.azure.ts        the generated manifest
 *
 * Microsoft's terms permit the icons in architecture diagrams, training
 * material and documentation only; see THIRD-PARTY-NOTICES.md.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kw, lit, minifySvg, resolveSource, slugify, svgFiles } from './icon-pack-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps', 'studio', 'public', 'library', 'azure');
const MANIFEST = path.join(ROOT, 'apps', 'studio', 'src', 'library', 'packs.azure.ts');

/** Pinned release; bump both when updating. */
const RELEASE = 'V24';
const RELEASE_URL = `https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_${RELEASE}.zip`;

/** Package folders that are too small to be categories of their own, folded
 * into the nearest real one. */
const FOLDER_ALIASES = {
  menu: 'general',
  migration: 'migrate',
  'developer tools': 'devops',
};

/** Catch-all folders. Microsoft files many icons under a specific category AND
 * one of these; they are read last so the specific category wins. */
const FALLBACK_FOLDERS = ['new icons', 'general', 'other'];

const CATEGORY_TITLES = {
  'ai-machine-learning': 'AI + Machine Learning',
  'app-services': 'App Services',
  'azure-ecosystem': 'Azure Ecosystem',
  devops: 'DevOps',
  'hybrid-multicloud': 'Hybrid + Multicloud',
  intune: 'Intune',
  iot: 'IoT',
  'management-governance': 'Management + Governance',
  'mixed-reality': 'Mixed Reality',
  'new-icons': 'New icons',
};

/**
 * Extra search terms for services whose official name does not contain the
 * abbreviation people actually type. Keyed by generated slug. Only terms the
 * name does NOT already contain belong here — the search box already matches
 * the display name and the category name.
 */
const ALIASES = {
  'virtual-machine': ['vm', 'compute', 'server'],
  'vm-scale-sets': ['vmss', 'autoscale'],
  'kubernetes-services': ['aks', 'k8s'],
  'aks-automatic': ['aks', 'k8s', 'kubernetes'],
  'container-instances': ['aci', 'docker'],
  'container-registries': ['acr', 'docker', 'registry'],
  'function-apps': ['functions', 'serverless', 'lambda'],
  'app-services': ['web app', 'paas'],
  'storage-accounts': ['blob', 'storage', 'files', 'queues', 'tables'],
  'azure-cosmos-db': ['cosmos', 'nosql', 'document'],
  'sql-database': ['sql', 'database', 'mssql'],
  'azure-database-postgresql-server': ['postgres', 'postgresql'],
  'azure-database-mysql-server': ['mysql'],
  'cache-redis': ['redis', 'cache'],
  'azure-managed-redis': ['cache'],
  'azure-service-bus': ['queue', 'topic', 'messaging', 'broker'],
  'event-hubs': ['kafka', 'streaming', 'events'],
  'event-grid-topics': ['events', 'pubsub'],
  'api-management-services': ['apim', 'api gateway', 'gateway'],
  'application-gateways': ['waf', 'load balancer', 'l7'],
  'load-balancers': ['lb', 'l4'],
  'front-door-and-cdn-profiles': ['cdn', 'afd', 'edge'],
  'virtual-networks': ['vnet', 'network'],
  'key-vaults': ['secrets', 'kms', 'certificates'],
  'entra-id-protection': ['azure ad', 'aad'],
  'application-insights': ['apm', 'telemetry', 'monitoring'],
  'log-analytics-workspaces': ['logs', 'kql', 'monitoring'],
  'azure-openai': ['openai', 'gpt', 'llm'],
  'logic-apps': ['workflow', 'integration'],
  'azure-synapse-analytics': ['synapse', 'warehouse'],
  'data-factories': ['adf', 'etl', 'pipeline'],
  'azure-databricks': ['databricks', 'spark'],
  'dns-zones': ['dns'],
  firewalls: ['firewall', 'network security'],
};

/** `02354-icon-service-Applens.svg` -> `Applens`. A few names carry a stray
 * space before the dash, and a handful have no numeric prefix at all. */
function coreName(file) {
  return path.basename(file, '.svg').replace(/^\d+\s*-icon-service-/, '');
}

const displayName = (s) => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

function categorySlug(folder) {
  const f = FOLDER_ALIASES[folder] ?? folder;
  return slugify(f.replace(/\s*\+\s*/g, ' '));
}

function categoryTitle(slug) {
  return (
    CATEGORY_TITLES[slug] ??
    slug
      .split('-')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ')
  );
}

async function main() {
  const { dir: pkgDir, cleanup } = await resolveSource(process.argv.slice(2), RELEASE_URL, 'azure');
  try {
    const iconsDir = path.join(pkgDir, 'Azure_Public_Service_Icons', 'Icons');
    const files = await svgFiles(iconsDir);
    const folderOf = (file) => path.relative(iconsDir, file).split(path.sep)[0];
    const rank = (file) => FALLBACK_FOLDERS.indexOf(folderOf(file)); // -1 = specific, read first
    files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });

    // First-wins by slug, both across folders and within one (a folder
    // occasionally lists two icons under one name).
    const seen = new Set();
    const rows = [];
    for (const file of files) {
      const core = coreName(file);
      const slug = slugify(core);
      if (seen.has(slug)) continue;
      seen.add(slug);
      await writeFile(path.join(OUT, `${slug}.svg`), minifySvg(await readFile(file, 'utf8')));
      rows.push({
        category: categorySlug(folderOf(file)),
        slug,
        name: displayName(core),
        keywords: ALIASES[slug] ?? [],
      });
    }
    rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const unused = Object.keys(ALIASES).filter((slug) => !seen.has(slug));
    if (unused.length > 0) throw new Error(`ALIASES name slugs not in the package: ${unused.join(', ')}`);

    await writeFile(MANIFEST, renderManifest(rows));
    const cats = new Set(rows.map((r) => r.category)).size;
    process.stderr.write(`Azure pack ${RELEASE}: ${rows.length} icons in ${cats} categories\n`);
  } finally {
    await cleanup?.();
  }
}

function renderManifest(rows) {
  const catIds = [...new Set(rows.map((r) => r.category))].sort();
  // Nested under the panel's 'Azure' group, so the names carry no prefix of
  // their own — the group header already says it.
  const categoryLines = catIds
    .map((id) => `  { id: 'azure-${id}', name: ${lit(categoryTitle(id))}, group: 'Azure', builtin: true },`)
    .join('\n');
  const entryLines = rows
    .map((r) => `  icon(${lit(r.category)}, ${lit(r.slug)}, ${lit(r.name)}${kw(r.keywords)}),`)
    .join('\n');

  return `// @generated
import type { Library, LibraryCategory, LibraryEntry } from './types';

// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/build-azure-pack.mjs
// Source: official Azure Public Service Icons package, release ${RELEASE}.

/** The Azure icon release these entries were generated from. */
export const AZURE_ICON_RELEASE = '${RELEASE}';

const icon = (category: string, slug: string, name: string, keywords?: string[]): LibraryEntry => ({
  id: \`azure-\${slug}\`,
  category: \`azure-\${category}\`,
  name,
  ...(keywords !== undefined ? { keywords } : {}),
  template: { type: 'image', image: \`/library/azure/\${slug}.svg\`, width: 64, height: 64 },
});

const categories: LibraryCategory[] = [
${categoryLines}
];

const entries: LibraryEntry[] = [
${entryLines}
];

/** Every official Azure service icon. */
export const AZURE_PACK: Library = { categories, entries };
`;
}

await main();
