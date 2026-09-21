import { watch as chokidarWatch } from 'chokidar';
import { errMessage, type IncludeResolver } from '@diagc/core';
import { compileFile } from './compile';

export type WatchEvent =
  | { file: string; ok: true; artifact: string }
  | { file: string; ok: false; error: string };

/** Human-readable rendering of a compile event, shared by the one-shot
 * `compile` command, the `watch` command's live log, and the `studio` watcher
 * so all three surface success/failure identically. `ok:false` events are
 * reported with the '(keeping last good artifact)' cue because those commands
 * only overwrite artifacts on success. */
export function formatCompileEvent(e: WatchEvent): string {
  if (e.ok) return `✓ ${e.file} -> ${e.artifact}`;
  return `✗ ${e.file}\n${e.error}\n(keeping last good artifact)`;
}

/**
 * Serializes async work per key. Each `run(key)` chains its task onto the
 * previous in-flight task for the same key, so tasks for one key execute
 * sequentially in call order (a slower earlier task can no longer settle after
 * a newer one); tasks for different keys still run concurrently. When a key's
 * chain tail settles and is still the current tail, its map entry is dropped so
 * the map does not grow without bound — a newer task queued behind the tail is
 * never dropped. `task` is expected to handle its own errors (never reject),
 * like the compile wrapper in `startWatch`.
 */
export function createSerialRunner(task: (key: string) => Promise<void>): {
  run(key: string): void;
  drain(): Promise<void>;
} {
  // One tail promise per key; awaiting a tail awaits the whole chain for it.
  const chains = new Map<string, Promise<void>>();

  const run = (key: string) => {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(() => task(key));
    chains.set(key, next);
    // When this tail settles, drop the entry — but only if it is still the
    // current tail, so a newer task chained behind it is never dropped.
    const cleanup = () => {
      if (chains.get(key) === next) chains.delete(key);
    };
    next.then(cleanup, cleanup);
  };

  const drain = async () => {
    await Promise.all([...chains.values()]);
  };

  return { run, drain };
}

export function startWatch(
  dir: string,
  outDir: string,
  opts: { onEvent?: (e: WatchEvent) => void; coreEntry?: string; resolver?: IncludeResolver } = {},
): { close(): Promise<void> } {
  // A save is a truncate followed by the data. Compiling on the first of those events can
  // read an empty file, and the second is no rescue: chokidar drops a `change` that comes
  // within 5 ms of the previous one, so the stale error would stand until the next save.
  // Wait for the size to hold still instead. It costs ~100 ms per save and nothing at
  // startup — chokidar does not apply it to the initial scan.
  const watcher = chokidarWatch(dir, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
  });

  const compile = async (file: string) => {
    try {
      const artifact = await compileFile(file, outDir, {
        rootDir: dir,
        ...(opts.coreEntry !== undefined ? { coreEntry: opts.coreEntry } : {}),
        ...(opts.resolver !== undefined ? { resolver: opts.resolver } : {}),
      });
      opts.onEvent?.({ file, ok: true, artifact });
    } catch (e) {
      opts.onEvent?.({ file, ok: false, error: errMessage(e) });
    }
  };

  // Serialize compiles per file path: each event chains onto the previous
  // in-flight compile for the same path, so events for one file are processed
  // sequentially in trigger order (a slow earlier compile can no longer report
  // or write a stale result after a newer one). Different files still compile
  // concurrently.
  const runner = createSerialRunner(compile);

  const onFsEvent = (file: string) => {
    if (!file.endsWith('.diagram.ts') && !file.endsWith('.diagram.json')) return;
    runner.run(file);
  };

  watcher.on('add', onFsEvent);
  watcher.on('change', onFsEvent);

  return {
    async close() {
      await watcher.close();
      // Let any in-flight compile chains finish so no work leaks past teardown.
      await runner.drain();
    },
  };
}
