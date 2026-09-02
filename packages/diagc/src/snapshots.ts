import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IncludeError, type DiagramModel, type IncludeResolver, type IncludeSource } from '@diagramming/core';

export type SnapshotMode = 'locked' | 'update';

const LOCK_NAME = 'includes.lock.json';
const VENDOR_DIR = 'includes';

interface LockEntry { file: string; sha256: string; }
interface Lock { version: 1; includes: Record<string, LockEntry>; }

const isHttp = (s: string): boolean => /^https?:\/\//.test(s);
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** vendor file name: url basename (sanitized) + hash prefix, collision-proof by content */
function vendorName(url: string, hash: string): string {
  const base = (new URL(url).pathname.split('/').pop() ?? '')
    .replace(/\.diagram\.json$/, '')
    .replace(/[^A-Za-z0-9_-]/g, '-');
  return `${base === '' ? 'include' : base}-${hash.slice(0, 8)}.diagram.json`;
}

export interface SnapshotSession {
  resolver: IncludeResolver;
  prune(): Promise<void>;
}

/**
 * Wrap an include resolver with lockfile-pinned vendoring for remote specs.
 * Local specs pass straight through — they are already in-repo and reviewable.
 * The wrapper always returns the ORIGINAL absolute URL as the ref, so cycle
 * detection and nested relative resolution behave exactly as unlocked fetches.
 */
export function snapshotSession(base: IncludeResolver, rootDir: string, mode: SnapshotMode): SnapshotSession {
  const lockPath = path.join(rootDir, LOCK_NAME);
  const vendorDir = path.join(rootDir, VENDOR_DIR);
  let lock: Lock | undefined;
  const touched = new Set<string>();

  const readLock = async (): Promise<Lock> => {
    try {
      return JSON.parse(await readFile(lockPath, 'utf8')) as Lock;
    } catch {
      return { version: 1, includes: {} };
    }
  };

  // Update mode keeps ONE in-memory lock for the whole session: every resolve
  // mutates the same object in place before persisting it, and prune() needs to
  // see everything touched across the run. Locked mode must NOT memoize —
  // watch/studio hold one session open for as long as the process runs, and the
  // whole point of the lockfile error's own remedy ("run `diagc compile
  // --update-includes`") is that a *separate* process can write a new lock
  // while this one keeps resolving. Caching a possibly-empty/stale read for the
  // process lifetime would make that remedy silently ineffective, so a locked
  // resolve re-reads the lockfile from disk every time instead.
  const loadLock = async (): Promise<Lock> => {
    if (mode === 'locked') return readLock();
    if (lock === undefined) lock = await readLock();
    return lock;
  };

  const resolver: IncludeResolver = async (spec, fromRef): Promise<IncludeSource> => {
    if (!isHttp(spec) && !isHttp(fromRef)) return base(spec, fromRef);
    const url = isHttp(spec) ? spec : new URL(spec, fromRef).href;
    const l = await loadLock();

    if (mode === 'locked') {
      const entry = l.includes[url];
      if (entry === undefined) {
        throw new IncludeError(spec, `Include '${url}' is not snapshotted — run 'diagc compile --update-includes' and commit .diagrams/${VENDOR_DIR}/ + .diagrams/${LOCK_NAME}`);
      }
      let text: string;
      try {
        text = await readFile(path.join(rootDir, entry.file), 'utf8');
      } catch {
        throw new IncludeError(spec, `Snapshot for '${url}' is missing its vendored file (${entry.file}) — run 'diagc compile --update-includes'`);
      }
      const hash = digest(text);
      if (hash !== entry.sha256) {
        throw new IncludeError(spec, `Snapshot for '${url}' does not match its lock entry (lock ${entry.sha256}, file ${hash}) — run 'diagc compile --update-includes'`);
      }
      return { model: JSON.parse(text) as DiagramModel, ref: url };
    }

    const got = await base(spec, fromRef);
    const text = `${JSON.stringify(got.model, null, 2)}\n`;
    const hash = digest(text);
    const file = path.posix.join(VENDOR_DIR, vendorName(url, hash));
    await mkdir(vendorDir, { recursive: true });
    await writeFile(path.join(rootDir, file), text);
    l.includes[url] = { file, sha256: hash };
    touched.add(url);
    await writeFile(lockPath, `${JSON.stringify(l, null, 2)}\n`);
    return { model: got.model, ref: url };
  };

  const prune = async (): Promise<void> => {
    if (mode !== 'update') return;
    const l = await loadLock();
    const kept: Record<string, LockEntry> = {};
    for (const url of touched) {
      const e = l.includes[url];
      if (e !== undefined) kept[url] = e;
    }
    l.includes = kept;
    const referenced = new Set(Object.values(kept).map((e) => path.basename(e.file)));
    let files: string[] = [];
    try {
      files = await readdir(vendorDir);
    } catch {
      /* nothing vendored — nothing to prune */
    }
    for (const f of files) {
      if (!referenced.has(f)) await rm(path.join(vendorDir, f), { force: true });
    }
    if (touched.size > 0 || files.length > 0) {
      await writeFile(lockPath, `${JSON.stringify(l, null, 2)}\n`);
    }
  };

  return { resolver, prune };
}
