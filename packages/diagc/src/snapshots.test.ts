import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeIncludes, type DiagramModel, type IncludeResolver } from '@diagramming/core';
import { snapshotSession } from './snapshots';

const CHILD: DiagramModel = {
  version: 1,
  id: 'c',
  name: 'c',
  nodes: [{ id: 'x', name: 'x' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

// Mirrors diagc's real resolver shape for remote specs: absolute URLs pass
// through, relative ones resolve against fromRef. No network involved.
const fakeBase: IncludeResolver = async (spec, fromRef) => {
  const url = /^https?:/.test(spec) ? spec : new URL(spec, fromRef).href;
  return { model: CHILD, ref: url };
};

async function tmpRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'diagc-snapshots-'));
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('snapshotSession', () => {
  it('locked mode with no lock entry refuses with the --update-includes remedy', async () => {
    const rootDir = await tmpRoot();
    const s = snapshotSession(fakeBase, rootDir, 'locked');
    await expect(s.resolver('https://x.test/c.diagram.json', '/tmp/a.ts')).rejects.toThrow(/--update-includes/);
  });

  it('a locked session re-reads the lockfile per resolve, picking up a lock written after it was created', async () => {
    const rootDir = await tmpRoot();
    // Created before anything is vendored — like watch/studio starting before
    // the first `diagc compile --update-includes` run.
    const locked = snapshotSession(fakeBase, rootDir, 'locked');
    await expect(locked.resolver('https://x.test/c.diagram.json', '/tmp/a.ts')).rejects.toThrow(/--update-includes/);

    // A separate update run (a different process, in practice) writes the lock
    // + vendored file while the locked session above stays alive.
    const up = snapshotSession(fakeBase, rootDir, 'update');
    await up.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');

    // The SAME locked session, never recreated, must see the new lock instead
    // of repeating the stale-empty-lock failure for its whole process lifetime.
    const got = await locked.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    expect(got.model).toEqual(CHILD);
  });

  it('update mode vendors the model and a locked session then resolves offline', async () => {
    const rootDir = await tmpRoot();
    const up = snapshotSession(fakeBase, rootDir, 'update');
    const got = await up.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    expect(got.ref).toBe('https://x.test/c.diagram.json'); // ref stays the URL, never the vendor path
    expect(got.model).toEqual(CHILD);

    const lock = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, { file: string; sha256: string }>;
    };
    const entry = lock.includes['https://x.test/c.diagram.json'];
    expect(entry).toBeDefined();
    expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await exists(path.join(rootDir, entry!.file))).toBe(true);

    // A locked session against a resolver that would throw on any call must
    // never reach it — the vendored snapshot satisfies the request offline.
    const never: IncludeResolver = async () => {
      throw new Error('offline');
    };
    const locked = snapshotSession(never, rootDir, 'locked');
    const off = await locked.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    expect(off.model).toEqual(CHILD);
    expect(off.ref).toBe('https://x.test/c.diagram.json');
  });

  it('a relative remote spec resolves against its fromRef before lookup', async () => {
    const rootDir = await tmpRoot();
    const fromRef = 'https://x.test/root.diagram.json';
    const up = snapshotSession(fakeBase, rootDir, 'update');
    await up.resolver('child.diagram.json', fromRef);

    const lock = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, unknown>;
    };
    // keyed by the absolute URL the relative spec resolves to, not the raw spec
    expect(lock.includes['https://x.test/child.diagram.json']).toBeDefined();
    expect(lock.includes['child.diagram.json']).toBeUndefined();

    const never: IncludeResolver = async () => {
      throw new Error('offline');
    };
    const locked = snapshotSession(never, rootDir, 'locked');
    const off = await locked.resolver('child.diagram.json', fromRef);
    expect(off.model).toEqual(CHILD);
    expect(off.ref).toBe('https://x.test/child.diagram.json');
  });

  it('hash drift refuses and names both hashes', async () => {
    const rootDir = await tmpRoot();
    const up = snapshotSession(fakeBase, rootDir, 'update');
    await up.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');

    const lock = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, { file: string; sha256: string }>;
    };
    const entry = lock.includes['https://x.test/c.diagram.json']!;
    await writeFile(path.join(rootDir, entry.file), 'corrupted-on-disk');

    const locked = snapshotSession(fakeBase, rootDir, 'locked');
    let err: Error | undefined;
    try {
      await locked.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/does not match its lock entry/);
    expect(err!.message).toContain(entry.sha256); // the lock's hash
    // the recomputed hash of the corrupted file must also be named, and differ
    const corruptedHashMatch = /file ([0-9a-f]{64})/.exec(err!.message);
    expect(corruptedHashMatch?.[1]).toBeDefined();
    expect(corruptedHashMatch?.[1]).not.toBe(entry.sha256);
  });

  it('a lock entry with its vendored file missing refuses with the --update-includes remedy', async () => {
    const rootDir = await tmpRoot();
    const up = snapshotSession(fakeBase, rootDir, 'update');
    await up.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');

    const lock = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, { file: string; sha256: string }>;
    };
    const entry = lock.includes['https://x.test/c.diagram.json']!;
    await rm(path.join(rootDir, entry.file)); // deleted on disk, but the lock entry still points at it

    const locked = snapshotSession(fakeBase, rootDir, 'locked');
    let err: Error | undefined;
    try {
      await locked.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/--update-includes/);
    expect(err!.message).toContain(entry.file); // names the missing vendor path
  });

  it('local specs pass through untouched in both modes', async () => {
    const rootDir = await tmpRoot();
    let calls = 0;
    // A resolver that only knows how to serve local (non-URL) specs; if the
    // wrapper ever routed a local spec through the vendoring path it would
    // never reach this resolver and the assertions below would fail.
    const localBase: IncludeResolver = async (spec, fromRef) => {
      calls++;
      expect(spec).toBe('./x.diagram.json');
      expect(fromRef).toBe('/tmp/a.ts');
      return { model: CHILD, ref: path.resolve(path.dirname(fromRef), spec) };
    };

    for (const mode of ['locked', 'update'] as const) {
      const s = snapshotSession(localBase, rootDir, mode);
      const got = await s.resolver('./x.diagram.json', '/tmp/a.ts');
      expect(got.model).toEqual(CHILD);
    }
    expect(calls).toBe(2);
    expect(await exists(path.join(rootDir, 'includes.lock.json'))).toBe(false);
  });

  it('prune keeps only the URLs touched this session and deletes orphans', async () => {
    const rootDir = await tmpRoot();
    const first = snapshotSession(fakeBase, rootDir, 'update');
    await first.resolver('https://x.test/a.diagram.json', '/tmp/root.ts');
    await first.resolver('https://x.test/b.diagram.json', '/tmp/root.ts');

    const before = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, { file: string; sha256: string }>;
    };
    const bEntry = before.includes['https://x.test/b.diagram.json']!;
    const bVendorPath = path.join(rootDir, bEntry.file);
    expect(await exists(bVendorPath)).toBe(true);

    const second = snapshotSession(fakeBase, rootDir, 'update');
    await second.resolver('https://x.test/a.diagram.json', '/tmp/root.ts');
    await second.prune();

    const after = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, unknown>;
    };
    expect(Object.keys(after.includes)).toEqual(['https://x.test/a.diagram.json']);
    expect(await exists(bVendorPath)).toBe(false);
  });

  it('an update run resolving nested remote includes vendors and locks both URLs', async () => {
    const rootDir = await tmpRoot();
    // root --include--> parent --include--> child, all three remote: composeIncludes
    // drives the recursion, calling the session's resolver once per hop.
    const parent: DiagramModel = {
      version: 1,
      id: 'parent',
      name: 'parent',
      nodes: [{ id: 'child', name: 'child', include: 'https://x.test/child.diagram.json' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const nestedBase: IncludeResolver = async (spec, fromRef) => {
      const url = /^https?:/.test(spec) ? spec : new URL(spec, fromRef).href;
      if (url === 'https://x.test/parent.diagram.json') return { model: parent, ref: url };
      return { model: CHILD, ref: url }; // child.diagram.json
    };
    const root: DiagramModel = {
      version: 1,
      id: 'root',
      name: 'root',
      nodes: [{ id: 'parent', name: 'parent', include: 'https://x.test/parent.diagram.json' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const up = snapshotSession(nestedBase, rootDir, 'update');
    const { model } = await composeIncludes(root, '/tmp/root.diagram.json', up.resolver);
    // sanity: the graft actually went two hops deep
    expect(model.nodes.some((n) => n.id === 'parent/child/x')).toBe(true);

    const lock = JSON.parse(await readFile(path.join(rootDir, 'includes.lock.json'), 'utf8')) as {
      includes: Record<string, { file: string; sha256: string }>;
    };
    expect(Object.keys(lock.includes).sort()).toEqual([
      'https://x.test/child.diagram.json',
      'https://x.test/parent.diagram.json',
    ]);
    for (const entry of Object.values(lock.includes)) {
      expect(await exists(path.join(rootDir, entry.file))).toBe(true);
    }
  });

  it('cycle detection still fires on a vendored cycle instead of hanging', async () => {
    const rootDir = await tmpRoot();
    // a includes b, b includes a — vendor both directly (one resolver call each,
    // no recursion) so the lock/vendor files exist before composeIncludes ever runs.
    const a: DiagramModel = {
      version: 1,
      id: 'a',
      name: 'a',
      nodes: [{ id: 'toB', name: 'toB', include: 'https://x.test/b.diagram.json' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const b: DiagramModel = {
      version: 1,
      id: 'b',
      name: 'b',
      nodes: [{ id: 'toA', name: 'toA', include: 'https://x.test/a.diagram.json' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const cyclicBase: IncludeResolver = async (spec, fromRef) => {
      const url = /^https?:/.test(spec) ? spec : new URL(spec, fromRef).href;
      if (url === 'https://x.test/a.diagram.json') return { model: a, ref: url };
      if (url === 'https://x.test/b.diagram.json') return { model: b, ref: url };
      throw new Error(`unexpected spec ${url}`);
    };
    const up = snapshotSession(cyclicBase, rootDir, 'update');
    await up.resolver('https://x.test/a.diagram.json', '/tmp/root.ts');
    await up.resolver('https://x.test/b.diagram.json', '/tmp/root.ts');

    const root: DiagramModel = {
      version: 1,
      id: 'root',
      name: 'root',
      nodes: [{ id: 'toA', name: 'toA', include: 'https://x.test/a.diagram.json' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    // Offline locked session: a resolver that would throw on any call must never
    // be reached — the whole request is satisfied from the vendored files, and
    // the cycle must surface as an IncludeError, not recurse forever.
    const never: IncludeResolver = async () => {
      throw new Error('offline');
    };
    const locked = snapshotSession(never, rootDir, 'locked');
    await expect(composeIncludes(root, '/tmp/root.diagram.json', locked.resolver)).rejects.toThrow(/cycle/i);
  });

  it('prune is a no-op outside update mode', async () => {
    const rootDir = await tmpRoot();
    const up = snapshotSession(fakeBase, rootDir, 'update');
    await up.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    const lockPath = path.join(rootDir, 'includes.lock.json');
    const before = await readFile(lockPath, 'utf8');

    const locked = snapshotSession(fakeBase, rootDir, 'locked');
    await locked.resolver('https://x.test/c.diagram.json', '/tmp/a.ts');
    await locked.prune();

    expect(await readFile(lockPath, 'utf8')).toBe(before); // untouched by a locked-mode prune
  });
});
