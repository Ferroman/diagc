#!/usr/bin/env node
// Published entry point. It stays a hand-written .mjs rather than the emitted
// cli.js so the path in package.json's `bin` exists in a fresh checkout too —
// pnpm links bins at install time, long before anything is built.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
if (!existsSync(cli)) {
  console.error(
    'diagc: dist/ is missing.\n' +
      'In a checkout, build it with `pnpm build:dist` (or run the CLI from source with `pnpm compile`).\n' +
      'From an npm install, this means the package is damaged — reinstall it.',
  );
  process.exit(1);
}
await import(pathToFileURL(cli).href);
