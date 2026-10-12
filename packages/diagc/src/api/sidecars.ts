import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDrawings, isLayoutOverlay } from '@diagc/core/internal';
import { writeFileAtomic } from '../atomic-write';
import { isSafeName } from '../names';
import { walkFiles } from './files';
import { refuse, type HandlerResult } from './result';

/** All layout overlays under `diagramsDir`, keyed by diagram name. Corrupt
 * overlays are skipped, never fatal. */
export async function listLayouts(diagramsDir: string): Promise<HandlerResult> {
  const layouts: Record<string, unknown> = {};
  for (const name of await walkFiles(diagramsDir, '.layout.json')) {
    try {
      layouts[name] = JSON.parse(await readFile(path.join(diagramsDir, `${name}.layout.json`), 'utf8'));
    } catch {
      /* skip corrupt overlay */
    }
  }
  return { status: 200, body: { layouts } };
}

/** All drawings sidecars under `diagramsDir`, keyed by diagram name. Corrupt
 * files are skipped, never fatal — same contract as listLayouts. */
export async function listDrawings(diagramsDir: string): Promise<HandlerResult> {
  const drawings: Record<string, unknown> = {};
  for (const name of await walkFiles(diagramsDir, '.drawings.json')) {
    try {
      drawings[name] = JSON.parse(await readFile(path.join(diagramsDir, `${name}.drawings.json`), 'utf8'));
    } catch {
      /* skip corrupt sidecar */
    }
  }
  return { status: 200, body: { drawings } };
}

export async function saveLayout(diagramsDir: string, name: string, payload: unknown): Promise<HandlerResult> {
  if (!isSafeName(name)) return refuse(400, `Unsafe name '${name}'`);
  // Core's structural guard mirrors the old inline checks (version 1, nested
  // numeric x/y planes, optional positive-finite sizes) — one source of truth
  // shared with the client-side artifact loader.
  if (!isLayoutOverlay(payload)) return refuse(400, 'Not a version-1 layout overlay');
  const target = path.join(diagramsDir, `${name}.layout.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

/** Persist the drawings sidecar. An overlay in which no bucket holds a stroke
 * DELETES the file instead of writing it: a diagram that never had drawings
 * must never grow an empty `<name>.drawings.json`, and erasing the last stroke
 * should leave the tree as it was. */
export async function saveDrawings(diagramsDir: string, name: string, payload: unknown): Promise<HandlerResult> {
  if (!isSafeName(name)) return refuse(400, `Unsafe name '${name}'`);
  if (!isDrawings(payload)) return refuse(400, 'Not a version-1 drawings overlay');
  const target = path.join(diagramsDir, `${name}.drawings.json`);
  const hasStrokes = Object.values(payload.planes).some((bucket) => bucket.length > 0);
  if (!hasStrokes) {
    try {
      await unlink(target);
    } catch (e) {
      // ENOENT only: there was nothing to delete, which is the ordinary case for
      // a diagram that never had ink. Anything else (EACCES, EPERM, EISDIR) means
      // the strokes are still on disk — rethrow so dispatch turns it into a 500
      // and useEditor.save surfaces it, instead of answering `{ ok: true }` and
      // letting the erased strokes resurrect on the next boot.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return { status: 200, body: { ok: true } };
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}
