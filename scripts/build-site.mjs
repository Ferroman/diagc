// Assembles the GitHub Pages site into _site/: the landing page from site/ at the root,
// the published diagram pages as html/, their pictures as static/. pages.yml runs it
// after `diagc publish`, and `pnpm build:site` makes the same folder for a local look.
//
//   node scripts/build-site.mjs [--root <dir>]
//
// --root is for the test, which builds from a stand-in tree.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const flag = process.argv.indexOf('--root');
const given = flag === -1 ? undefined : process.argv[flag + 1];
if (flag !== -1 && given === undefined) fail('--root needs a directory.');
const root = path.resolve(given ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const isDir = async (dir) => (await stat(dir).catch(() => undefined))?.isDirectory() ?? false;

const parts = [
  { from: 'site', to: '', fix: 'restore it from git' },
  { from: path.join('.diagrams', 'html'), to: 'html', fix: 'run `pnpm build:cli` and `pnpm publish-diagrams` first' },
  { from: path.join('.diagrams', 'static'), to: 'static', fix: 'run `pnpm publish-diagrams` first' },
];
// Everything is checked before anything is written, so a failed build leaves no half site.
for (const part of parts) {
  if (!(await isDir(path.join(root, part.from)))) fail(`${part.from} is missing — ${part.fix}.`);
}

const out = path.join(root, '_site');
// A page that left the sources must not stay on the site because an old build is lying
// around.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const part of parts) await cp(path.join(root, part.from), path.join(out, part.to), { recursive: true });
console.log(`✓ site -> ${path.relative(process.cwd(), out) || '.'}`);
