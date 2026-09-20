#!/usr/bin/env node
// Copy the built plugin into a real vault's plugins folder for manual testing.
// `pnpm build:obsidian` produces the dist/ this reads; this script does not build it.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps', 'obsidian', 'dist');

const vault = process.env.OBSIDIAN_VAULT;
if (!vault) {
  console.error('install-obsidian: OBSIDIAN_VAULT is not set\n  usage: OBSIDIAN_VAULT=/path/to/vault node scripts/install-obsidian.mjs');
  process.exit(1);
}

if (!existsSync(dist)) {
  console.error(`install-obsidian: ${dist} not found\n  build it first: pnpm build:obsidian`);
  process.exit(1);
}

const target = path.join(vault, '.obsidian', 'plugins', 'diagc-studio');
cpSync(dist, target, { recursive: true });
console.log(`✓ installed diagc-studio -> ${target}`);
