#!/usr/bin/env node
// Sources import siblings extensionless (`./compile`), which TypeScript emits
// verbatim and Node ESM then refuses to resolve. tsc has no flag for this, so
// the emitted tree is rewritten in place: every *relative* specifier that has no
// extension gains `.js`.
//
// Two properties make the naive rewrite safe here rather than merely convenient:
// no source uses a directory import (`./view` meaning `./view/index`), and no
// relative specifier already carries an extension. `assertRewritable` enforces
// both against the emitted tree, so a future directory import fails the build
// instead of shipping a package that throws ERR_MODULE_NOT_FOUND on install.
//
// Usage: node scripts/fix-esm-extensions.mjs <dist-dir> [<dist-dir>...]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** `from './x'`, `import('./x')`, and bare side-effect `import './x'`. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]*)\2/g;

const hasExtension = (spec) => path.extname(spec) !== '';

/** Rewrite one file's relative specifiers; returns the new text (or null). */
export function rewrite(text) {
  let changed = false;
  const out = text.replace(SPECIFIER, (match, head, quote, spec) => {
    if (hasExtension(spec)) return match;
    changed = true;
    return `${head}${quote}${spec}.js${quote}`;
  });
  return changed ? out : null;
}

/** Every .js/.d.ts file under `dir`, recursively. */
export function emittedFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...emittedFiles(full));
    else if (full.endsWith('.js') || full.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Fail loudly on the two shapes the rewrite cannot handle. */
export function assertRewritable(file, text, exists = existsSync) {
  for (const [, , , spec] of text.matchAll(SPECIFIER)) {
    if (hasExtension(spec)) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (exists(target) && statSync(target).isDirectory()) {
      throw new Error(
        `${file}: directory import '${spec}' — fix-esm-extensions only appends '.js'; import the file (e.g. '${spec}/index') instead.`,
      );
    }
  }
}

export function fixDir(dir) {
  let count = 0;
  for (const file of emittedFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    assertRewritable(file, text);
    const next = rewrite(text);
    if (next !== null) {
      writeFileSync(file, next);
      count++;
    }
  }
  return count;
}

// Only run when invoked as a script, so the helpers above stay unit-testable.
if (process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: fix-esm-extensions.mjs <dist-dir> [<dist-dir>...]');
    process.exit(1);
  }
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      console.error(`fix-esm-extensions: no such directory ${dir}`);
      process.exit(1);
    }
    console.log(`✓ ${fixDir(dir)} file(s) rewritten in ${dir}`);
  }
}
