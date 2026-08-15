#!/usr/bin/env node
// Copy the two prebuilt browser artifacts into the CLI package so an installed
// `diagc` can find them without a workspace: the single-file viewer shell that
// `publish` stamps models into, and the static studio bundle that
// `diagc studio` serves (its `public/library` rides along in the same output,
// which is why publish and the studio read one staged copy — see home.ts).
//
// Run after `vite build` for both apps; `pnpm build:dist` chains them.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
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

// Sits outside `assets/` (which is wiped above) because it is package metadata, not a
// build artifact — `files` lists it explicitly. Gitignored; regenerated every build.
await cp(NOTICES, path.join(root, 'packages', 'diagc', 'THIRD-PARTY-NOTICES.md'));

const bytes = async (p) => (await stat(p)).size;
console.log(`✓ viewer shell -> assets/viewer/index.html (${Math.round((await bytes(VIEWER_SHELL)) / 1024)} kB)`);
console.log(`✓ studio bundle -> assets/studio/`);
console.log(`✓ third-party notices -> packages/diagc/THIRD-PARTY-NOTICES.md`);
