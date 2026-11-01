import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportUrl, findChrome } from './snapshot';

describe('exportUrl', () => {
  it("opens the page's export render, on the first plane when none is named", () => {
    expect(exportUrl('/out/html/a b.html')).toBe('file:///out/html/a%20b.html?export=1');
  });

  it('names the plane to draw, encoded', () => {
    expect(exportUrl('/out/html/a.html', { plane: 'Target VPC/2' })).toBe(
      'file:///out/html/a.html?export=1&plane=Target+VPC%2F2',
    );
  });

  it('names the style and the theme the picture is taken in, when the publisher chose them', () => {
    expect(exportUrl('/out/html/a.html', { style: 'sketch', theme: 'dark' })).toBe(
      'file:///out/html/a.html?export=1&style=sketch&theme=dark',
    );
    expect(exportUrl('/out/html/a.html', { plane: 'p', theme: 'light' })).toBe(
      'file:///out/html/a.html?export=1&plane=p&theme=light',
    );
  });
});

describe('findChrome', () => {
  // systemPlaces: [] — the machine running the tests may well have a Chrome of its own
  let home: string;
  const plant = (...rel: string[]): string => {
    const file = path.join(home, ...rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '');
    return file;
  };
  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'diagc-chrome-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('takes CHROME_PATH first, when it is there, and ignores one that is not', () => {
    const named = plant('my', 'chrome');
    expect(findChrome({ env: { CHROME_PATH: named }, homeDir: home, platform: 'linux', systemPlaces: [] })).toBe(named);
    expect(
      findChrome({ env: { CHROME_PATH: path.join(home, 'gone') }, homeDir: home, platform: 'linux', systemPlaces: [] }),
    ).toBeUndefined();
  });

  it("finds the Chromium Playwright installed under the platform's cache, the newest build first", () => {
    plant('.cache', 'ms-playwright', 'chromium-1140', 'chrome-linux', 'chrome');
    const newest = plant('.cache', 'ms-playwright', 'chromium-1243', 'chrome-linux64', 'chrome');
    plant('.cache', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-linux');
    expect(findChrome({ env: {}, homeDir: home, platform: 'linux', systemPlaces: [] })).toBe(newest);
  });

  it('settles for the headless shell when that is all Playwright installed', () => {
    const shell = plant('.cache', 'ms-playwright', 'chromium_headless_shell-1243', 'chrome-linux', 'headless_shell');
    expect(findChrome({ env: {}, homeDir: home, platform: 'linux', systemPlaces: [] })).toBe(shell);
    // a full browser of any build beats a newer headless shell: it is what the fixed paths name too
    const full = plant('.cache', 'ms-playwright', 'chromium-1140', 'chrome-linux', 'chrome');
    expect(findChrome({ env: {}, homeDir: home, platform: 'linux', systemPlaces: [] })).toBe(full);
  });

  it("reads the cache from PLAYWRIGHT_BROWSERS_PATH when it is set, and from each platform's own place", () => {
    const custom = plant('elsewhere', 'chromium-1300', 'chrome-linux', 'chrome');
    expect(
      findChrome({
        env: { PLAYWRIGHT_BROWSERS_PATH: path.join(home, 'elsewhere') },
        homeDir: home,
        platform: 'linux',
        systemPlaces: [],
      }),
    ).toBe(custom);
    const mac = plant(
      'Library',
      'Caches',
      'ms-playwright',
      'chromium-1243',
      'chrome-mac-arm64',
      'Chromium.app',
      'Contents',
      'MacOS',
      'Chromium',
    );
    expect(findChrome({ env: {}, homeDir: home, platform: 'darwin', systemPlaces: [] })).toBe(mac);
    const win = plant('AppData', 'Local', 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
    expect(
      findChrome({
        env: { LOCALAPPDATA: path.join(home, 'AppData', 'Local') },
        homeDir: home,
        platform: 'win32',
        systemPlaces: [],
      }),
    ).toBe(win);
  });

  it('is undefined with nothing installed anywhere', () => {
    expect(findChrome({ env: {}, homeDir: home, platform: 'linux', systemPlaces: [] })).toBeUndefined();
  });
});
