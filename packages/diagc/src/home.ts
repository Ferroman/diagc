import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export interface HomePaths {
  root: string;
  viewerShell: string;
  libraryDir: string;
  coreEntry: string;
  studioDir: string;
}

/** Walk up from `startPath`'s realpath to the monorepo root (the dir holding
 * pnpm-workspace.yaml). Resolving the realpath first is what lets a globally
 * linked bin find its source checkout through the symlink. */
export function findHome(startPath: string): string {
  let dir = path.dirname(realpathSync(startPath));
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        'cannot locate diagc home (expected a monorepo with pnpm-workspace.yaml above the linked bin); re-run `pnpm link --global` from the monorepo.',
      );
    }
    dir = parent;
  }
}

export function homePaths(root: string): HomePaths {
  return {
    root,
    viewerShell: path.join(root, 'apps', 'viewer', 'dist', 'index.html'),
    libraryDir: path.join(root, 'apps', 'studio', 'public', 'library'),
    coreEntry: path.join(root, 'packages', 'core', 'src', 'index.ts'),
    studioDir: path.join(root, 'apps', 'studio'),
  };
}
