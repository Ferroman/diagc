import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import type { HomePaths } from './home';
import { projectPaths } from './paths';
import { startStudioServer } from './serve';
import { lockedResolverFor } from './snapshots';
import { formatCompileEvent, startWatch } from './watch';

export interface StudioEnv {
  DIAGRAMS_DIR: string;
  ARTIFACTS_DIR: string;
  DIAGRAMS_CWD: string;
  DIAGRAMS_OPEN: string;
}

/** Env that points the monorepo's studio Vite server at the target repo. */
export function studioEnv(cwd: string): StudioEnv {
  const { srcDir, artifactsDir } = projectPaths(cwd);
  return {
    DIAGRAMS_DIR: srcDir,
    ARTIFACTS_DIR: artifactsDir,
    DIAGRAMS_CWD: cwd,
    DIAGRAMS_OPEN: '1',
  };
}

/** Per-platform "open this URL" command. */
export function openCommand(platform: NodeJS.Platform): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', ''] };
  return { cmd: 'xdg-open', args: [] };
}

/** Best-effort browser launch. A headless box has no opener and that is fine —
 * the URL is already on stdout, so a failure here must never take the server
 * down with it. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const { cmd, args } = openCommand(platform);
  try {
    const child = spawn(cmd, [...args, url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* no opener available */
  }
}

/** Run the studio against `cwd`: scaffold src, watch-compile into .artifacts,
 * and serve the editor. Resolves when the server exits; Ctrl+C tears down both
 * the watcher and the server.
 *
 * Which server depends on the layout (see home.ts). From a checkout it is the
 * studio's own Vite dev server, so working on the studio keeps HMR. From an
 * installed package there is no Vite and no workspace to spawn it in, so the
 * prebuilt bundle is served directly — same API routes either way, because both
 * hosts dispatch the table in `src/api`. */
export async function runStudio(home: HomePaths, cwd: string): Promise<void> {
  const env = studioEnv(cwd);
  await mkdir(env.DIAGRAMS_DIR, { recursive: true });

  // Studio's live watch-compile loop always resolves includes locked, same as
  // the one-shot `compile`/`watch` commands default to — the studio has no
  // `--update-includes` surface, so there is no other mode to offer here.
  // The lock is found from env.DIAGRAMS_DIR (not process.cwd()'s `.diagrams`),
  // like the sources and artifacts: runStudio targets an arbitrary repo.
  const resolver = lockedResolverFor(env.DIAGRAMS_DIR);

  const watcher = startWatch(env.DIAGRAMS_DIR, env.ARTIFACTS_DIR, {
    coreEntry: home.coreEntry,
    resolver,
    onEvent: (e) => {
      // The studio surfaces the same compile log as the one-shot `compile` and
      // `watch` commands via the shared formatter (success to stdout, failure
      // to stderr).
      if (e.ok) console.log(formatCompileEvent(e));
      else console.error(formatCompileEvent(e));
    },
  });

  console.log(`Studio for ${cwd} — sources in ${env.DIAGRAMS_DIR}`);

  const session = home.layout === 'packaged' ? await servePackaged(home, env) : spawnVite(home, env);

  const shutdown = (): void => {
    void watcher.close();
    void session.stop();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await session.exited;
  await watcher.close();
}

/** A running editor server: `exited` settles when it is gone, `stop` asks it to
 * go. Both branches below produce one, so `runStudio` awaits one shape. */
interface StudioSession {
  exited: Promise<void>;
  stop: () => Promise<void>;
}

/** Installed layout: serve the prebuilt bundle over plain http. */
async function servePackaged(home: HomePaths, env: StudioEnv): Promise<StudioSession> {
  const server = await startStudioServer({
    studioDir: home.studioDir,
    diagramsDir: env.DIAGRAMS_DIR,
    artifactsDir: env.ARTIFACTS_DIR,
  });
  console.log(`Studio ready on ${server.url}`);
  if (env.DIAGRAMS_OPEN === '1') openBrowser(server.url);
  let release: () => void = () => {};
  const exited = new Promise<void>((resolve) => (release = resolve));
  return {
    exited,
    stop: async () => {
      await server.close();
      release();
    },
  };
}

/** Monorepo layout: hand off to the studio's own Vite dev server. */
function spawnVite(home: HomePaths, env: StudioEnv): StudioSession {
  const child = spawn('pnpm', ['--filter', '@diagc/studio', 'dev'], {
    cwd: home.root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  return {
    exited: new Promise<void>((resolve) => child.on('exit', () => resolve())),
    stop: async () => {
      if (!child.killed) child.kill('SIGINT');
    },
  };
}
