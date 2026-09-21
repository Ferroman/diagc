import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSerialRunner, startWatch, type WatchEvent } from './watch';

const fixtures = path.resolve(import.meta.dirname, '../test-fixtures');
let watcher: { close(): Promise<void> } | undefined;

afterEach(async () => {
  await watcher?.close();
  watcher = undefined;
});

// Each step waits for the event it is about, never for a position in the list: a file that
// appears before the watcher is ready is compiled on its first fs event, and under load that
// compile can catch a copy between its truncate and its data and report a transient error
// ahead of the real result. The timeout sits under vitest's own 5 s so that a miss fails
// with the events that did arrive.
function eventWhere(events: WatchEvent[], match: (e: WatchEvent) => boolean, timeoutMs = 4000): Promise<WatchEvent> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const hit = events.find(match);
      if (hit) return resolve(hit);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error(`timed out waiting for watch event; saw ${JSON.stringify(events)}`));
      }
      setTimeout(poll, 50);
    };
    poll();
  });
}

// A save as a loaded machine performs it: truncate, stall, then the data. From another
// process, so the stall is real time on the file rather than a turn of the event loop the
// watcher shares with this test.
function stalledSave(target: string, source: string, stallMs = 2): Promise<void> {
  const script = `
    const fs = require('node:fs');
    const [target, source, stallMs] = process.argv.slice(1);
    const data = fs.readFileSync(source);
    const fd = fs.openSync(target, 'w');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(stallMs));
    fs.writeSync(fd, data);
    fs.closeSync(fd);
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['-e', script, target, source, String(stallMs)], (err) => (err ? reject(err) : resolve()));
  });
}

describe('startWatch', () => {
  it('compiles new diagram files and keeps last good artifact on failure', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-src-'));
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-out-'));
    const events: WatchEvent[] = [];
    watcher = startWatch(dir, out, { onEvent: (e) => events.push(e) });

    const target = path.join(dir, 'app.diagram.ts');
    await copyFile(path.join(fixtures, 'sample.diagram.ts'), target);
    await eventWhere(events, (e) => e.ok);

    const artifact = path.join(out, 'app.diagram.json');
    const goodContent = await readFile(artifact, 'utf8');
    expect(JSON.parse(goodContent).id).toBe('sample');

    await copyFile(path.join(fixtures, 'broken.diagram.ts'), target);
    await eventWhere(events, (e) => !e.ok && e.error.includes('cycle'));

    // last good artifact untouched
    expect(await readFile(artifact, 'utf8')).toBe(goodContent);

    await rm(dir, { recursive: true, force: true });
  });

  it('serializes rapid successive writes to one path so the final result wins', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-src-'));
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-out-'));
    const events: WatchEvent[] = [];
    const w = startWatch(dir, out, { onEvent: (e) => events.push(e) });
    watcher = w;

    const target = path.join(dir, 'app.diagram.ts');
    // Two quick successive writes to the same watched path (broken then valid),
    // without waiting for the first compile. With per-path serialization the
    // events for this path are compiled sequentially in trigger order, so a
    // slower earlier compile can never report or write a stale result after a
    // newer one — the FINAL result must always reflect the final content.
    await copyFile(path.join(fixtures, 'broken.diagram.ts'), target);
    await copyFile(path.join(fixtures, 'sample.diagram.ts'), target);

    // Wait for a compile of the final content, then close() — which drains any in-flight
    // compile chain — to reach a deterministic quiescent state without sleeps.
    // The first event alone is not that: the `add` from the first write can start a
    // compile while the second write has the file truncated, and that compile reports
    // its error before chokidar has delivered the `change` for the finished write.
    // close() at that point drops the pending `change` and leaves the stale error as
    // the last word. (chokidar may also coalesce the two writes into one event.)
    await eventWhere(events, (e) => e.ok);
    await w.close();
    watcher = undefined;

    const final = events[events.length - 1]!;
    expect(final.ok).toBe(true);

    const artifact = path.join(out, 'app.diagram.json');
    expect(JSON.parse(await readFile(artifact, 'utf8')).id).toBe('sample');

    await rm(dir, { recursive: true, force: true });
  });

  // Compiling on the truncate's event reads an empty file, and the data's event never
  // arrives to correct it: chokidar drops a second `change` within 5 ms of the first. The
  // stale error then stands until the next save.
  it('compiles a save only once its data has landed', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-src-'));
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-out-'));
    const events: WatchEvent[] = [];
    watcher = startWatch(dir, out, { onEvent: (e) => events.push(e) });

    const target = path.join(dir, 'app.diagram.ts');
    await copyFile(path.join(fixtures, 'broken.diagram.ts'), target);
    await eventWhere(events, (e) => !e.ok && e.error.includes('cycle'));

    await stalledSave(target, path.join(fixtures, 'sample.diagram.ts'));
    await eventWhere(events, (e) => e.ok);
    expect(JSON.parse(await readFile(path.join(out, 'app.diagram.json'), 'utf8')).id).toBe('sample');

    await rm(dir, { recursive: true, force: true });
  });

  it('watches .diagram.json sources too', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-src-'));
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-out-'));
    const events: WatchEvent[] = [];
    watcher = startWatch(dir, out, { onEvent: (e) => events.push(e) });
    await copyFile(path.join(fixtures, 'plain.diagram.json'), path.join(dir, 'plain.diagram.json'));
    await eventWhere(events, (e) => e.ok);
    expect(JSON.parse(await readFile(path.join(out, 'plain.diagram.json'), 'utf8')).id).toBe('plain');
    await rm(dir, { recursive: true, force: true });
  });
});

// A full event-loop turn: flushes the microtask queue and pending timers, so
// any work that *could* have started has started. Deterministic here because
// the tasks under test are held on manually-resolved gates, not on timing.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// These drive the per-path serialization directly, with no chokidar/FS timing:
// determinism comes entirely from a controlled task function whose first call
// per key is held on a manual gate. This is the actual regression guard for the
// serialization logic — the end-to-end tests above exercise it only when the
// platform happens not to coalesce the two rapid writes.
describe('createSerialRunner', () => {
  it('serializes same-key work in call order and never overlaps', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const firstGate = deferred();
    let calls = 0;

    // First call for the key is slow (blocks on firstGate); the second is fast
    // (no await) and would finish first if the two ran concurrently.
    const task = async (key: string) => {
      const id = calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (id === 0) await firstGate.promise;
      order.push(`${key}#${id}`);
      active--;
    };

    const runner = createSerialRunner(task);
    runner.run('a'); // slow first call
    runner.run('a'); // fast second call, chained behind the first

    // With the first call gated and nothing resolving it, no work can progress
    // past the gate — the second call must not have started or emitted.
    await settle();
    expect(order).toEqual([]);
    expect(active).toBe(1);

    firstGate.resolve();
    await runner.drain();

    // Trigger order preserved (slow first, then fast) despite the fast call
    // being the one that would settle first if they ran concurrently.
    expect(order).toEqual(['a#0', 'a#1']);
    // Two calls for the same key never ran at the same time.
    expect(maxActive).toBe(1);
  });

  it('runs different-key work concurrently', async () => {
    const activeKeys = new Set<string>();
    let sawBothActive = false;
    const gateA = deferred();
    const gateB = deferred();
    const gateFor = (key: string) => (key === 'a' ? gateA : gateB);

    const task = async (key: string) => {
      activeKeys.add(key);
      if (activeKeys.has('a') && activeKeys.has('b')) sawBothActive = true;
      await gateFor(key).promise;
      activeKeys.delete(key);
    };

    const runner = createSerialRunner(task);
    runner.run('a');
    runner.run('b');

    // Both tasks reach their gate and sit there together: cross-key concurrency.
    await settle();
    expect(activeKeys.has('a')).toBe(true);
    expect(activeKeys.has('b')).toBe(true);
    expect(sawBothActive).toBe(true);

    gateA.resolve();
    gateB.resolve();
    await runner.drain();
    expect(activeKeys.size).toBe(0);
  });
});
