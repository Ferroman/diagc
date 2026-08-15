import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Which of the two shipping shapes the CLI is running from.
 *
 * - `monorepo`: a checkout (or a `pnpm link --global` bin pointing into one).
 *   Assets are read from `apps/`, the studio runs on Vite, core is TS source.
 * - `packaged`: installed from the registry. Assets were staged into the
 *   package at build time, the studio is a prebuilt bundle served by our own
 *   http server, and core is the published dependency. */
export type HomeLayout = 'monorepo' | 'packaged';

export interface HomePaths {
  root: string;
  layout: HomeLayout;
  /** single-file viewer HTML that `publish` stamps models into */
  viewerShell: string;
  /** icon/shape library that `publish` inlines `/library/...` refs from */
  libraryDir: string;
  /** module `@diagramming/core` is aliased to when jiti executes a `.diagram.ts` */
  coreEntry: string;
  /** monorepo: the studio's Vite root; packaged: the prebuilt studio bundle */
  studioDir: string;
}

export interface Home {
  root: string;
  layout: HomeLayout;
}

/** Marker that identifies a packaged install: the staged viewer shell. It is
 * the one file `publish` cannot work without, so if it is missing the install
 * is broken whatever we decide to call it. */
const PACKAGED_MARKER = path.join('assets', 'viewer', 'index.html');

/** Every directory from `startPath`'s realpath up to the filesystem root.
 * Resolving the realpath first is what lets a globally linked bin find its
 * source checkout through the symlink. */
function ancestors(startPath: string): string[] {
  const out: string[] = [];
  let dir = path.dirname(realpathSync(startPath));
  for (;;) {
    out.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) return out;
    dir = parent;
  }
}

/** Locate the CLI's home and decide which layout it is.
 *
 * A workspace anywhere above wins over a packaged marker, even though the
 * marker sits closer: once assets have been staged into `packages/diagc/assets`
 * for a release, a depth-ordered search would find them first and quietly put a
 * development checkout into packaged mode. */
export function findHome(startPath: string): Home {
  const dirs = ancestors(startPath);
  for (const dir of dirs) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return { root: dir, layout: 'monorepo' };
  }
  for (const dir of dirs) {
    if (existsSync(path.join(dir, PACKAGED_MARKER)) && existsSync(path.join(dir, 'package.json'))) {
      return { root: dir, layout: 'packaged' };
    }
  }
  throw new Error(
    'cannot locate diagc home (expected an installed package with assets/, or a monorepo with pnpm-workspace.yaml above the bin); reinstall diagc, or re-run `pnpm link --global` from the monorepo.',
  );
}

/** Resolve the installed `@diagramming/core` entry from this module's location,
 * so jiti aliases a user's `.diagram.ts` to the very copy the CLI itself uses.
 * Injectable for tests; the default is the real resolver. */
export function resolveCoreEntry(resolve: (id: string) => string = createRequire(import.meta.url).resolve): string {
  try {
    return resolve('@diagramming/core');
  } catch {
    throw new Error(
      "diagc is installed without its '@diagramming/core' dependency — reinstall it (npm i -g diagc).",
    );
  }
}

export function homePaths(home: Home, coreEntry = resolveCoreEntry): HomePaths {
  const { root, layout } = home;
  if (layout === 'packaged') {
    const studioDir = path.join(root, 'assets', 'studio');
    return {
      root,
      layout,
      viewerShell: path.join(root, 'assets', 'viewer', 'index.html'),
      // The studio bundle carries its own `public/library` through the Vite
      // build, so publish and the studio server read one staged copy.
      libraryDir: path.join(studioDir, 'library'),
      coreEntry: coreEntry(),
      studioDir,
    };
  }
  return {
    root,
    layout,
    viewerShell: path.join(root, 'apps', 'viewer', 'dist', 'index.html'),
    libraryDir: path.join(root, 'apps', 'studio', 'public', 'library'),
    coreEntry: path.join(root, 'packages', 'core', 'src', 'index.ts'),
    studioDir: path.join(root, 'apps', 'studio'),
  };
}
