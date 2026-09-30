/**
 * Helpers shared by the cloud icon-pack builders (build-aws-pack.mjs,
 * build-azure-pack.mjs, build-gcp-pack.mjs). Each provider ships a zip of SVGs
 * in its own layout; these are the parts that do not depend on that layout.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Lowercase kebab slug restricted to [a-z0-9-], per LIBRARY_IMAGE_REF. */
export function slugify(s) {
  return s
    .replace(/&/g, '-and-')
    .replace(/\+/g, '-plus-')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Drop the parts of a vendor SVG that cost bytes but carry nothing: the XML
 * prolog, comments, and the `<title>` echo of the file name (which browsers
 * would surface as a tooltip over the icon). Inter-tag whitespace is collapsed
 * only when the file has no text nodes to damage.
 */
export function minifySvg(src) {
  let out = src
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<desc>[\s\S]*?<\/desc>/g, '');
  if (!/<(text|tspan)[\s>]/.test(out)) out = out.replace(/>\s+</g, '><');
  return `${out.trim()}\n`;
}

/** Every .svg under `dir`, sorted, skipping macOS zip debris. */
export async function svgFiles(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith('.svg') && !e.parentPath.includes('__MACOSX')) {
      found.push(path.join(e.parentPath, e.name));
    }
  }
  return found.sort();
}

/**
 * Resolve the provider package from the command line: `--src <dir>` uses an
 * extracted copy, `--zip <file>` a downloaded one, and neither downloads
 * `url`. Returns the extracted directory plus a cleanup for the temp copy.
 */
export async function resolveSource(argv, url, label) {
  const srcIdx = argv.indexOf('--src');
  if (srcIdx !== -1) return { dir: argv[srcIdx + 1], cleanup: undefined };

  const work = mkdtempSync(path.join(tmpdir(), `${label}-icons-`));
  const zipIdx = argv.indexOf('--zip');
  let zip = argv[zipIdx + 1];
  if (zipIdx === -1) {
    zip = path.join(work, 'icons.zip');
    process.stderr.write(`Downloading ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  }
  const dir = path.join(work, 'pkg');
  execFileSync('unzip', ['-qo', zip, '-d', dir]);
  return { dir, cleanup: () => rm(work, { recursive: true, force: true }) };
}

/** A single-quoted TS string literal. */
export const lit = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The optional trailing keywords argument of a generated manifest row. */
export const kw = (words) => (words.length === 0 ? '' : `, [${words.map(lit).join(', ')}]`);
