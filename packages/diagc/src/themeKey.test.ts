import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findHome } from './home';
import { THEME_STORAGE_KEY } from './publish/pageTheme';

// One key, written in three places that cannot import each other: the renderer (the
// published page), the CLI (the index and the diff overview) and the landing site. A
// reader's choice covers every page on a host only while the three agree.
const root = findHome(fileURLToPath(import.meta.url)).root;
const read = (...parts: string[]): string => readFileSync(path.join(root, ...parts), 'utf8');

describe('the theme key', () => {
  it('is the same in the renderer, the CLI and the landing site', () => {
    expect(read('packages', 'renderer', 'src', 'theme.ts')).toContain(`THEME_STORAGE_KEY = '${THEME_STORAGE_KEY}'`);
    expect(read('site', 'site.js')).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(read('site', 'index.html')).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });
});

// Kept here, not beside the viewer: that app's tsconfig has no node types, and this is
// the package that reads files.
describe('the published page shell', () => {
  it('declares both colour schemes, so the empty page is not white on a dark system', () => {
    expect(read('apps', 'viewer', 'index.html')).toContain('<meta name="color-scheme" content="light dark" />');
  });
});
