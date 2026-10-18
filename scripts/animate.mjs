#!/usr/bin/env node
// Rebuild docs/media/ from the storyboards in videos/.
//
// Every storyboard acts on a committed diagram under .diagrams/src/fixtures/, so a run is
// reproducible. The studio is started on the fixed port the studio storyboards' URLs name, and the
// fixtures folder is restored before each take — a take edits a fixture (a placed node, a typed
// name, a comment, an unfolded group) and the studio writes those edits back. The
// published-page storyboards open the fixtures' published pages, which this script publishes and
// serves on a second port; a published page cannot save, so those need no restoring. The README's
// showcase is the one exception: it opens examples/acme, which the studio shows read-only, and a
// read-only diagram's unfolding and style are never written back.
//
// Needs `howto` on PATH. Run `pnpm animate` from the repository root; `pnpm animate NAME…` takes
// only the storyboards named (videos/NAME.yaml), so one change does not re-encode every picture.

import { spawn } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const PORT = 5183;
const PAGES_PORT = 5184;
const WIDTH = 800;
const OUT = path.join('docs', 'media');
const FIXTURES = path.join(root, '.diagrams', 'src', 'fixtures');
// The diagrams whose published pages the storyboards open, as `diagc publish` names them.
const PAGES = ['fixtures/published-demo'];
const PAGES_DIR = path.join(root, '.diagrams', 'html');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// Asynchronous, so the page server below keeps answering while a take runs: a synchronous spawn
// blocks the event loop the server needs, and the take's browser waits for a page that never comes.
// A failure throws rather than exits, so the studio and the server are stopped either way.
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed`))));
  });

const all = readdirSync(path.join(root, 'videos'))
  .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
  .sort();
if (all.length === 0) fail('videos/ holds no storyboards.');
const asked = process.argv.slice(2);
const unknown = asked.filter((name) => !all.includes(`${name}.yaml`));
if (unknown.length > 0)
  fail(`no storyboard ${unknown.join(', ')}; videos/ holds ${all.map((f) => f.slice(0, -5)).join(', ')}.`);
const storyboards = asked.length === 0 ? all : all.filter((f) => asked.includes(f.slice(0, -5)));

// The files the folder holds now are put back, and any other file is removed, so a run that starts
// from a clean tree leaves a clean tree: a layout sidecar a take writes is build output of the take
// itself, and left in place the next take would lay out against the previous take's positions.
const snapshot = path.join(tmpdir(), 'diagc-animate-restore');
rmSync(snapshot, { recursive: true, force: true });
mkdirSync(snapshot, { recursive: true });
const saved = readdirSync(FIXTURES);
for (const file of saved) copyFileSync(path.join(FIXTURES, file), path.join(snapshot, file));
const restore = () => {
  for (const file of readdirSync(FIXTURES)) if (!saved.includes(file)) rmSync(path.join(FIXTURES, file));
  for (const file of saved) copyFileSync(path.join(snapshot, file), path.join(FIXTURES, file));
};

// Spawned detached so the whole process group can be signalled: pnpm runs vite through a shell,
// and killing only the pnpm process leaves the grandchild holding stdout, which hangs a piped run.
// `exec` rather than the package's dev script so the run ends quietly: killing the dev script makes
// pnpm report a recursive-run failure for a signal this script sends on purpose.
const server = spawn('pnpm', ['--filter', '@diagc/studio', 'exec', 'vite', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  detached: true,
});

// The published pages, served over http rather than opened from disk, so a storyboard's URL names
// the same page on every machine. Only files under PAGES_DIR are served.
const pages = createServer((request, response) => {
  const file = path.join(PAGES_DIR, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  if (!file.startsWith(PAGES_DIR + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});

const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${PORT}/api/diagrams`);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

const took = async () => {
  if (!(await ready())) throw new Error(`the studio did not come up on port ${PORT}.`);
  await run('node', [path.join('bin', 'diagc.mjs'), 'publish', ...PAGES, '--no-images']);
  await new Promise((resolve, reject) => pages.once('error', reject).listen(PAGES_PORT, '127.0.0.1', resolve));
  mkdirSync(path.join(root, OUT), { recursive: true });
  // Restored after a failed take too, which would otherwise leave its edits in the fixtures.
  try {
    for (const file of storyboards) {
      restore();
      await run('pnpm', ['compile']);
      await run('howto', [
        'animate',
        path.join('videos', file),
        '--out',
        OUT,
        '--format',
        'both',
        '--width',
        String(WIDTH),
      ]);
    }
  } finally {
    restore();
  }
};

try {
  await took();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  pages.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}
