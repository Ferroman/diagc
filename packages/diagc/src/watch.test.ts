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

function nextEvent(events: WatchEvent[], after: number, timeoutMs = 5000): Promise<WatchEvent> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (events.length > after) return resolve(events[after]!);
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out waiting for watch event'));
      setTimeout(poll, 50);
    };
    poll();
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
    const first = await nextEvent(events, 0);
    expect(first.ok).toBe(true);

    const artifact = path.join(out, 'app.diagram.json');
    const goodContent = await readFile(artifact, 'utf8');
    expect(JSON.parse(goodContent).id).toBe('sample');

    await copyFile(path.join(fixtures, 'broken.diagram.ts'), target);
    const second = await nextEvent(events, 1);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain('cycle');

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

    // Wait for the watcher to report, then close() — which drains any in-flight
    // compile chain — to reach a deterministic quiescent state without sleeps.
    // (chokidar may coalesce the two writes into one event or emit add+change.)
    await nextEvent(events, 0);
    await w.close();
    watcher = undefined;

    const final = events[events.length - 1]!;
    expect(final.ok).toBe(true);

    const artifact = path.join(out, 'app.diagram.json');
    expect(JSON.parse(await readFile(artifact, 'utf8')).id).toBe('sample');

    await rm(dir, { recursive: true, force: true });
  });

  it('watches .diagram.json sources too', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-src-'));
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-out-'));
    const events: WatchEvent[] = [];
    watcher = startWatch(dir, out, { onEvent: (e) => events.push(e) });
    await copyFile(path.join(fixtures, 'plain.diagram.json'), path.join(dir, 'plain.diagram.json'));
    const first = await nextEvent(events, 0);
    expect(first.ok).toBe(true);
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
