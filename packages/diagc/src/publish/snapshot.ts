import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { pageSize } from './pageSize';

/** Locate an installed Chrome/Chromium; undefined means "no browser available". */
export function findChrome(): string | undefined {
  const env = process.env['CHROME_PATH'];
  if (env !== undefined && existsSync(env)) return env;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((p) => existsSync(p));
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
  if (executablePath === undefined) {
    throw new Error(
      'No Chrome found for image export. Install Google Chrome/Chromium, set CHROME_PATH, or run with --no-images.',
    );
  }
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
