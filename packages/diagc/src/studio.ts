import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { HomePaths } from './home';
import { formatCompileEvent, startWatch } from './watch';

export interface StudioEnv {
  DIAGRAMS_DIR: string;
  ARTIFACTS_DIR: string;
  DIAGRAMS_CWD: string;
  DIAGRAMS_OPEN: string;
}

/** Env that points the monorepo's studio Vite server at the target repo. */
export function studioEnv(cwd: string): StudioEnv {
  return {
    DIAGRAMS_DIR: path.join(cwd, '.diagrams', 'src'),
    ARTIFACTS_DIR: path.join(cwd, '.diagrams', '.artifacts'),
    DIAGRAMS_CWD: cwd,
    DIAGRAMS_OPEN: '1',
  };
}

/** Run the studio against `cwd`: scaffold src, watch-compile into .artifacts,
 * and spawn the monorepo's Vite dev server. Resolves when the server exits;
 * Ctrl+C tears down both the watcher and the child. */
export async function runStudio(home: HomePaths, cwd: string): Promise<void> {
  const env = studioEnv(cwd);
  await mkdir(env.DIAGRAMS_DIR, { recursive: true });

  const watcher = startWatch(env.DIAGRAMS_DIR, env.ARTIFACTS_DIR, {
    coreEntry: home.coreEntry,
    onEvent: (e) => {
      // The studio surfaces the same compile log as the one-shot `compile` and
      // `watch` commands via the shared formatter (success to stdout, failure
      // to stderr).
      if (e.ok) console.log(formatCompileEvent(e));
      else console.error(formatCompileEvent(e));
    },
  });

  console.log(`Studio for ${cwd} — sources in ${env.DIAGRAMS_DIR}`);

  const child = spawn('pnpm', ['--filter', '@diagramming/studio', 'dev'], {
    cwd: home.root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  const shutdown = () => {
    void watcher.close();
    if (!child.killed) child.kill('SIGINT');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise<void>((resolve) => {
    child.on('exit', () => {
      void watcher.close();
      resolve();
    });
  });
}
