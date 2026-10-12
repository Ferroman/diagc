import path from 'node:path';

/** Every place diagc reads or writes in a project, all under the one `.diagrams` folder
 * at the project's root. */
export interface ProjectPaths {
  /** the `.diagrams` folder itself */
  readonly diagramsDir: string;
  /** the sources, `*.diagram.ts` and `*.diagram.json`, with their sidecars */
  readonly srcDir: string;
  /** where compile writes artifacts without `--out`, and where the studio reads them */
  readonly artifactsDir: string;
  /** publish's pages and gallery */
  readonly htmlDir: string;
  /** publish's PNGs */
  readonly staticDir: string;
  /** the images the studio saves, beside the sources that show them */
  readonly assetsDir: string;
  /** diff's pages, a folder per range */
  readonly diffDir: string;
  /** the vendored snapshots of remote includes */
  readonly includesDir: string;
  /** the lock that pins each remote include to its vendored snapshot */
  readonly lockFile: string;
}

function layout(root: string, join: (...parts: string[]) => string): ProjectPaths {
  const diagramsDir = join(root, '.diagrams');
  const srcDir = join(diagramsDir, 'src');
  return {
    diagramsDir,
    srcDir,
    artifactsDir: join(diagramsDir, '.artifacts'),
    htmlDir: join(diagramsDir, 'html'),
    staticDir: join(diagramsDir, 'static'),
    assetsDir: join(srcDir, 'assets'),
    diffDir: join(diagramsDir, 'diff'),
    includesDir: join(diagramsDir, 'includes'),
    lockFile: join(diagramsDir, 'includes.lock.json'),
  };
}

/** The places in the project at `root`, joined as `path.join` joins them: `.` and `..`
 * collapse, and an empty root is the current directory. */
export function projectPaths(root: string): ProjectPaths {
  return layout(root, path.join);
}

/** The same places relative to a project's root, spelled with `/` on every platform.
 * The CLI runs at the root and names them this way: a user reads and types them so,
 * and fast-glob patterns and `.gitignore` lines take a backslash for an escape. */
export const RELATIVE_PATHS: ProjectPaths = layout('', path.posix.join);
