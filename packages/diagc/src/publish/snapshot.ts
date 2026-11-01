import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { pageSize } from './pageSize';

/** The one line to print when there is no browser: what to do about it, in the
 * order a reader is likely to want. `npx playwright-core install chromium` works
 * wherever diagc is installed, since playwright-core is its dependency. */
export const NO_CHROME_MESSAGE =
  "No Chrome found — writing HTML only. Get one with 'npx playwright-core install chromium' (diagc finds it there), set CHROME_PATH, or use --no-images.";

/** The browsers an installation puts on a machine, where `publish` looks before
 * Playwright's own cache. */
const FIXED_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** The machine as `findChrome` sees it; every field is the process's own unless a
 * test says otherwise. */
export interface ChromeSearch {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  /** the places an installer puts a browser (FIXED_CANDIDATES) */
  systemPlaces?: readonly string[];
}

/**
 * Locate a Chrome or Chromium; undefined means "no browser available". In order:
 * `CHROME_PATH`, the places an installer puts a browser, then the Chromium that
 * `npx playwright-core install chromium` puts in Playwright's cache — the one
 * command that works on a stock CI runner, so what it installs must be found
 * without a second step.
 */
export function findChrome(search: ChromeSearch = {}): string | undefined {
  const env = search.env ?? process.env;
  const named = env['CHROME_PATH'];
  if (named !== undefined && existsSync(named)) return named;
  return (
    (search.systemPlaces ?? FIXED_CANDIDATES).find((p) => existsSync(p)) ??
    playwrightChromium(env, search.homeDir ?? os.homedir(), search.platform ?? process.platform)
  );
}

/** Where Playwright keeps its browsers on this platform, unless `PLAYWRIGHT_BROWSERS_PATH`
 * says otherwise (`0` means beside the package, which diagc does not look into). */
function playwrightCache(env: NodeJS.ProcessEnv, homeDir: string, platform: NodeJS.Platform): string | undefined {
  const named = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (named !== undefined && named !== '') return named === '0' ? undefined : named;
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'];
    return local === undefined ? undefined : path.join(local, 'ms-playwright');
  }
  return path.join(env['XDG_CACHE_HOME'] ?? path.join(homeDir, '.cache'), 'ms-playwright');
}

/** The executable a Playwright build folder holds, whatever the layout of that
 * version (`chrome-linux/chrome`, `chrome-mac-arm64/Chromium.app/…`, `chrome-win64/chrome.exe`). */
const EXECUTABLES = new Set(['chrome', 'chrome.exe', 'headless_shell', 'chrome-headless-shell', 'Chromium']);
function executableIn(dir: string, depth = 5): string | undefined {
  if (depth === 0) return undefined;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry);
    let isDir: boolean;
    try {
      isDir = statSync(file).isDirectory();
    } catch {
      continue;
    }
    if (!isDir && EXECUTABLES.has(entry)) return file;
    if (isDir) {
      const found = executableIn(file, depth - 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** The newest full Chromium in Playwright's cache, else the newest headless shell. */
function playwrightChromium(env: NodeJS.ProcessEnv, homeDir: string, platform: NodeJS.Platform): string | undefined {
  const cache = playwrightCache(env, homeDir, platform);
  if (cache === undefined || !existsSync(cache)) return undefined;
  const builds = readdirSync(cache)
    .map((name) => /^(chromium|chromium_headless_shell)-(\d+)$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    // a full browser first, then by build number, newest first
    .sort((a, b) => (a[1] === b[1] ? Number(b[2]) - Number(a[2]) : a[1] === 'chromium' ? -1 : 1));
  for (const build of builds) {
    const found = executableIn(path.join(cache, build[0]));
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Frame padding around the graph, in screen px. */
const FRAME_PADDING = 32;

interface ExportWindow {
  __DG_READY__?: boolean;
  __DG_BOUNDS__?: { width: number; height: number };
  __DG_RESERVE__?: { side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null;
  __DG_FIT__?: (pad?: number) => void;
}

/** How a picture is taken: which plane (the first when absent), and the look the
 * publisher chose — a style preset, light or dark — in place of the page's own
 * (the diagram's style, light). */
export interface PictureLook {
  plane?: string;
  style?: string;
  theme?: 'light' | 'dark';
}

/** The page's export render: `?export=1` unfolds every group for a full overview;
 * `plane`, `style` and `theme` say which plane, and in what look (see PictureLook —
 * the viewer reads them as apps/viewer/src/style.ts and theme.ts say). */
export function exportUrl(htmlPath: string, look: PictureLook = {}): string {
  const query = new URLSearchParams({
    export: '1',
    ...(look.plane !== undefined ? { plane: look.plane } : {}),
    ...(look.style !== undefined ? { style: look.style } : {}),
    ...(look.theme !== undefined ? { theme: look.theme } : {}),
  });
  return `${pathToFileURL(path.resolve(htmlPath)).href}?${query.toString()}`;
}

export async function renderPng(htmlPath: string, pngPath: string, look: PictureLook = {}): Promise<void> {
  const executablePath = findChrome();
  if (executablePath === undefined) throw new Error(NO_CHROME_MESSAGE);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    // Named, not left to the browser: `?export=1` already makes the viewer light (or
    // the theme in the address) whatever the browser prefers, and this says so where
    // the picture is taken.
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: look.theme ?? 'light',
    });
    await page.goto(exportUrl(htmlPath, look));
    await page.waitForFunction(() => (window as unknown as ExportWindow).__DG_READY__ === true, null, {
      timeout: 15_000,
    });
    // __DG_BOUNDS__ is the TRUE node bounding box in flow coordinates, so the
    // frame gets the real content aspect; then re-fit into it (React Flow's
    // `fitView` prop only fits on init, not after this resize) so nothing clips.
    // __DG_RESERVE__ is the legend's extent in SCREEN px and is added to the
    // frame unscaled — see pageSize for why the two must not be mixed.
    const bounds = await page.evaluate(
      () => (window as unknown as ExportWindow).__DG_BOUNDS__ ?? { width: 1200, height: 800 },
    );
    const reserve = await page.evaluate(() => (window as unknown as ExportWindow).__DG_RESERVE__ ?? null);
    const size = pageSize(bounds, {
      maxWidth: 2000,
      maxHeight: 1400,
      padding: FRAME_PADDING,
      // Only a top/bottom legend costs height, which is all `legendReserve`
      // ever reports today; a side legend would need pageSize to widen instead.
      reserve: reserve === null || reserve.side === 'left' || reserve.side === 'right' ? 0 : reserve.px,
    });
    await page.setViewportSize(size);
    await page.evaluate((pad) => (window as unknown as ExportWindow).__DG_FIT__?.(pad), FRAME_PADDING);
    await page.waitForTimeout(350); // let the re-fit settle into the resized frame
    const el = await page.$('.react-flow');
    await (el ?? page).screenshot({ path: pngPath });
  } finally {
    await browser.close();
  }
}
