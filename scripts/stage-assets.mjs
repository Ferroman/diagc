#!/usr/bin/env node
// Copy the two prebuilt browser artifacts into the CLI package so an installed
// `diagc` can find them without a workspace: the single-file viewer shell that
// `publish` stamps models into, and the static studio bundle that
// `diagc studio` serves (its `public/library` rides along in the same output,
// which is why publish and the studio read one staged copy — see home.ts).
//
// Run after `vite build` for both apps; `pnpm build:dist` chains them.
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'packages', 'diagc', 'assets');

const VIEWER_SHELL = path.join(root, 'apps', 'viewer', 'dist', 'index.html');
const STUDIO_BUNDLE = path.join(root, 'apps', 'studio', 'dist');
// The attribution for everything those two bundles inline. It lives at the repo root
// (one copy, next to LICENSE) but `files` in a manifest resolves relative to the
// package, so the published CLI needs its own copy staged beside the code it covers.
const NOTICES = path.join(root, 'THIRD-PARTY-NOTICES.md');
// What `diagc guide` prints and `diagc init` copies. The guide's Markdown lives in
// the package already; the starters are the examples' own `starter.diagram.ts`
// files, so only those are taken — not the realistic examples beside them.
const GUIDE = path.join(root, 'packages', 'diagc', 'guide');
const EXAMPLES = path.join(root, '.diagrams', 'src', 'examples');
const STARTER = 'starter.diagram.ts';
// What `diagc init --agents` writes into a repository that uses Claude Code.
const SKILL = path.join(root, 'packages', 'diagc', 'skill', 'SKILL.md');

async function require(target, what, how) {
  try {
    return await stat(target);
  } catch {
    console.error(`stage-assets: ${what} not found at ${target}\n  build it first: ${how}`);
    process.exit(1);
  }
}

await require(VIEWER_SHELL, 'viewer shell', 'pnpm build:cli');
await require(NOTICES, 'third-party notices', 'restore THIRD-PARTY-NOTICES.md at the repo root');
await require(path.join(GUIDE, 'index.md'), 'guide', 'restore packages/diagc/guide/');
await require(EXAMPLES, 'examples', 'restore .diagrams/src/examples/');
await require(SKILL, 'agent skill', 'restore packages/diagc/skill/SKILL.md');
const starters = (await readdir(EXAMPLES, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && existsSync(path.join(EXAMPLES, e.name, STARTER)))
  .map((e) => e.name)
  .sort();
if (starters.length === 0) {
  console.error(`stage-assets: no <type>/${STARTER} under ${EXAMPLES}`);
  process.exit(1);
}
const studio = await require(STUDIO_BUNDLE, 'studio bundle', 'pnpm build:studio');
if (!studio.isDirectory()) {
  console.error(`stage-assets: ${STUDIO_BUNDLE} is not a directory`);
  process.exit(1);
}

// Start clean so a renamed hashed chunk from an earlier build cannot linger and
// ship alongside its replacement.
await rm(assets, { recursive: true, force: true });
await mkdir(path.join(assets, 'viewer'), { recursive: true });
await cp(VIEWER_SHELL, path.join(assets, 'viewer', 'index.html'));
await cp(STUDIO_BUNDLE, path.join(assets, 'studio'), { recursive: true });
await cp(GUIDE, path.join(assets, 'guide'), { recursive: true });
for (const type of starters) {
  await mkdir(path.join(assets, 'starters', type), { recursive: true });
  await cp(path.join(EXAMPLES, type, STARTER), path.join(assets, 'starters', type, STARTER));
}
await mkdir(path.join(assets, 'skill'), { recursive: true });
await cp(SKILL, path.join(assets, 'skill', 'SKILL.md'));

// Sits outside `assets/` (which is wiped above) because it is package metadata, not a
// build artifact — `files` lists it explicitly. Gitignored; regenerated every build.
await cp(NOTICES, path.join(root, 'packages', 'diagc', 'THIRD-PARTY-NOTICES.md'));

const bytes = async (p) => (await stat(p)).size;
console.log(`✓ viewer shell -> assets/viewer/index.html (${Math.round((await bytes(VIEWER_SHELL)) / 1024)} kB)`);
console.log(`✓ studio bundle -> assets/studio/`);
console.log(`✓ third-party notices -> packages/diagc/THIRD-PARTY-NOTICES.md`);
console.log(`✓ guide -> assets/guide/`);
console.log(`✓ starters -> assets/starters/ (${starters.join(', ')})`);
console.log(`✓ agent skill -> assets/skill/SKILL.md`);
