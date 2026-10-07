// Takes the two studio pictures that the landing page and the README show. Run it by
// hand after a change to the studio's look:
//
//   CHROME_PATH=/path/to/chrome node scripts/site-screenshots.mjs
//
// It compiles the repo's own diagrams, starts the studio's dev server on a port of its
// own, drives it with the browser at CHROME_PATH and writes site/img/studio-*.png. The
// pictures are committed, like the PNGs in .diagrams/static/.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// playwright-core is the CLI's dependency (it draws the PNGs), not the workspace root's.
const { chromium } = createRequire(path.join(root, 'packages', 'diagc', 'package.json'))('playwright-core');

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(root, 'site', 'img');
const VIEWPORT = { width: 1360, height: 850 };

const chrome = process.env.CHROME_PATH;
if (chrome === undefined || !existsSync(chrome)) {
  console.error('Set CHROME_PATH to a Chrome or Chromium binary.');
  process.exit(1);
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('the studio dev server stopped before it answered');
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the studio did not answer on ${BASE}`);
}

/** Open a diagram by the studio's deep link and wait for it to be drawn. */
async function open(page, diagram) {
  await page.goto(`${BASE}/#/${encodeURIComponent(diagram)}`);
  await page.locator('.react-flow__node').first().waitFor();
  // The pictures sit on a light page beside diagrams published in the light theme.
  const toLight = page.locator('button[title^="Light theme"]');
  if ((await toLight.count()) > 0) await toLight.click();
  await page.waitForTimeout(900); // layout, then the fit animation
}

/** Fit the whole diagram in the canvas: an unfolded group grows where it stands. */
async function fit(page) {
  await page.locator('.react-flow__controls-fitview').click();
  await page.waitForTimeout(700);
}

/** Unfold a group in place, by the chip on its header. */
async function unfold(page, groupName) {
  await page
    .locator('.react-flow__node', { hasText: groupName })
    .locator('button[aria-expanded="false"]')
    .first()
    .click();
  await page.waitForTimeout(900);
}

async function shoot(page, file) {
  await page.screenshot({ path: path.join(OUT, file) });
  console.log(`✓ site/img/${file}`);
}

const compiled = spawnSync('pnpm', ['compile'], { cwd: root, stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

/** The diagram sources as git sees them: which files differ, and how. */
const git = (...args) => spawnSync('git', [...args, '--', '.diagrams/src'], { cwd: root, encoding: 'utf8' }).stdout;
const sourceChanges = () => git('status', '--porcelain') + git('diff');
const before = sourceChanges();

// Whatever answers before the server is started is not the studio this script starts: a
// server left by an interrupted run, most likely. Its pictures would be of another tree.
if (
  await fetch(BASE).then(
    () => true,
    () => false,
  )
) {
  console.error(`✗ something already answers on ${BASE} — stop it first.`);
  process.exit(1);
}

// detached: the server gets a process group of its own, so pnpm, vite and esbuild stop
// together.
const server = spawn(
  'pnpm',
  ['--filter', '@diagc/studio', 'exec', 'vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: root, stdio: 'ignore', detached: true },
);
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
// Ctrl+C skips `finally`, and a server left behind holds the port for the next run.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopServer();
    process.exit(130);
  });
}

let browser;
try {
  await waitForServer();
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'light' });

  // View mode: semantic zoom, with one system opened inside the platform.
  await open(page, 'examples/acme');
  await unfold(page, 'Acme Platform');
  await unfold(page, 'Identity');
  await fit(page);
  await shoot(page, 'studio-view.png');

  // Edit mode, on a diagram drawn in the studio, with the icon library open.
  await open(page, 'examples/nested-zoom-demo');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('tab', { name: 'Library' }).click();
  // No unfolding here: in edit mode the studio writes which groups are open into the
  // diagram's layout file, and this script must leave the sources as it found them.
  await fit(page);
  await shoot(page, 'studio-edit.png');
} finally {
  await browser?.close().catch(() => {});
  stopServer();
  // The studio saves some things without being asked. A picture is not worth a changed
  // diagram, so say so loudly instead of leaving it for a later `git status` — also when
  // the run failed half way, which is when it is easiest to miss.
  if (sourceChanges() !== before) {
    console.error(
      '✗ the studio changed files under .diagrams/src while the pictures were taken — look at `git status`.',
    );
    process.exitCode = 1;
  }
}
