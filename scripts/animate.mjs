#!/usr/bin/env node
// Rebuild docs/media/ from the storyboards in videos/.
//
// Every storyboard acts on one committed diagram, .diagrams/src/fixtures/studio-demo.diagram.json,
// so a run is reproducible: the studio is started on the fixed port the storyboards' URLs name, and
// the demo diagram and its layout sidecar are restored before each take — a take edits them (a
// placed node, a typed name, a comment, an unfolded group) and the studio writes those edits back.
//
// Needs `howto` on PATH. Run `pnpm animate` from the repository root.

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const PORT = 5183;
const WIDTH = 800;
const OUT = path.join('docs', 'media');
const FIXTURES = [
  path.join('.diagrams', 'src', 'fixtures', 'studio-demo.diagram.json'),
  path.join('.diagrams', 'src', 'fixtures', 'studio-demo.layout.json'),
];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed`);
};

const storyboards = readdirSync(path.join(root, 'videos'))
  .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
  .sort();
if (storyboards.length === 0) fail('videos/ holds no storyboards.');

// Only the fixtures that exist are restored, so a run that starts from a clean tree leaves a clean
// tree: the layout sidecar is build output of the takes themselves. A sidecar created by one take
// must be removed before the next, or the next take lays out against the previous take's positions.
const snapshot = path.join(tmpdir(), 'diagc-animate-restore');
rmSync(snapshot, { recursive: true, force: true });
mkdirSync(snapshot, { recursive: true });
const saved = FIXTURES.filter((f) => existsSync(path.join(root, f)));
for (const file of saved) copyFileSync(path.join(root, file), path.join(snapshot, path.basename(file)));
const restore = () => {
  for (const file of FIXTURES) {
    const target = path.join(root, file);
    if (saved.includes(file)) copyFileSync(path.join(snapshot, path.basename(file)), target);
    else rmSync(target, { force: true });
  }
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
  if (!(await ready())) fail(`the studio did not come up on port ${PORT}.`);
  mkdirSync(path.join(root, OUT), { recursive: true });
  for (const file of storyboards) {
    restore();
    run('pnpm', ['compile']);
    run('howto', ['animate', path.join('videos', file), '--out', OUT, '--format', 'both', '--width', String(WIDTH)]);
  }
  restore();
};

try {
  await took();
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}
