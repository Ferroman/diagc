import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { IMAGE_REF, isDrawings, isLayoutOverlay, validate, type DiagramModel } from '@diagramming/core';
import { EjectError, ejectDiagram } from '../eject';

export interface HandlerResult {
  status: number;
  body: unknown;
}

export function isSafeName(name: string): boolean {
  return /^[a-z0-9][a-z0-9/-]*$/.test(name) && !name.includes('..') && !name.includes('//');
}

/** Recursively collect every file under `dir` whose name ends in `suffix`,
 * posix-joined relative to `dir` with the suffix stripped. Missing dir → [].
 * Shared by the diagram-source and layout-overlay walks. */
export async function walkFiles(dir: string, suffix: string): Promise<string[]> {
  const names: string[] = [];
  const walk = async (d: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(d, e.name), `${prefix}${e.name}/`);
      else if (e.name.endsWith(suffix)) names.push(`${prefix}${e.name.slice(0, -suffix.length)}`);
    }
  };
  await walk(dir, '');
  return names;
}

/** Recursively collect `<name>` for every `*.diagram.json` under `dir`
 * (posix-joined, suffix stripped). Missing dir → []. */
export async function walkDiagramJson(dir: string): Promise<string[]> {
  return walkFiles(dir, '.diagram.json');
}

export interface DiagramEntry {
  name: string;
  model: DiagramModel | null;
  issues: { message: string }[];
  editable: boolean;
}

/** Render-ready models for the studio boot: JSON sources (editable) served from
 * `diagramsDir`, compiled TS artifacts from `artifactsDir`. A source shadows its
 * artifact so unsaved-compile staleness never shows. */
export async function listDiagramModels(diagramsDir: string, artifactsDir: string): Promise<HandlerResult> {
  const sourceNames = new Set(await walkDiagramJson(diagramsDir));
  const artifactNames = await walkDiagramJson(artifactsDir);
  const all = [...new Set([...sourceNames, ...artifactNames])].sort();
  const diagrams: DiagramEntry[] = [];
  for (const name of all) {
    const editable = sourceNames.has(name);
    const file = editable
      ? path.join(diagramsDir, `${name}.diagram.json`)
      : path.join(artifactsDir, `${name}.diagram.json`);
    let model: DiagramModel | null = null;
    const issues: { message: string }[] = [];
    try {
      model = JSON.parse(await readFile(file, 'utf8')) as DiagramModel;
    } catch {
      issues.push({ message: `Could not read model for '${name}'` });
    }
    diagrams.push({ name, model, issues, editable });
  }
  return { status: 200, body: { diagrams } };
}

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

/** the JSON source (+ sibling layout and drawings) of a designer-owned diagram — the studio
 * reads these directly so it never depends on a compile watcher for its own files */
export async function readDiagram(diagramsDir: string, name: string): Promise<HandlerResult> {
  if (!isSafeName(name)) return { status: 400, body: { issues: [{ message: `Unsafe name '${name}'` }] } };
  let model: unknown;
  try {
    model = JSON.parse(await readFile(path.join(diagramsDir, `${name}.diagram.json`), 'utf8'));
  } catch {
    return { status: 404, body: { issues: [{ message: `No diagram source '${name}'` }] } };
  }
  let layout: unknown;
  try {
    layout = JSON.parse(await readFile(path.join(diagramsDir, `${name}.layout.json`), 'utf8'));
  } catch {
    layout = undefined;
  }
  let drawings: unknown;
  try {
    drawings = JSON.parse(await readFile(path.join(diagramsDir, `${name}.drawings.json`), 'utf8'));
  } catch {
    drawings = undefined;
  }
  return {
    status: 200,
    body: {
      model,
      ...(layout !== undefined ? { layout } : {}),
      ...(drawings !== undefined ? { drawings } : {}),
    },
  };
}

export async function saveDiagram(diagramsDir: string, name: string, payload: unknown): Promise<HandlerResult> {
  if (!isSafeName(name)) return { status: 400, body: { issues: [{ message: `Unsafe name '${name}'` }] } };
  const p = payload as Record<string, unknown> | null;
  const arraysOk =
    p !== null &&
    p.version === 1 &&
    Array.isArray(p.nodes) &&
    Array.isArray(p.containment) &&
    Array.isArray(p.relations) &&
    Array.isArray(p.layers) &&
    Array.isArray(p.planes);
  if (!arraysOk) {
    return { status: 400, body: { issues: [{ message: 'Not a version-1 diagram model' }] } };
  }
  const issues = validate(payload as DiagramModel);
  if (issues.length > 0) return { status: 400, body: { issues } };
  const target = path.join(diagramsDir, `${name}.diagram.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

/** Move a designer-owned diagram (and its sibling layout, if any) to a new name,
 * rewriting the model's internal id/name to match so the file stays self-consistent. */
export async function renameDiagram(diagramsDir: string, from: string, to: string): Promise<HandlerResult> {
  if (!isSafeName(from) || !isSafeName(to)) {
    return { status: 400, body: { issues: [{ message: `Unsafe name '${isSafeName(from) ? to : from}'` }] } };
  }
  if (from === to) return { status: 400, body: { issues: [{ message: 'New name is the same as the old' }] } };
  const fromDiagram = path.join(diagramsDir, `${from}.diagram.json`);
  const toDiagram = path.join(diagramsDir, `${to}.diagram.json`);
  let raw: string;
  try {
    raw = await readFile(fromDiagram, 'utf8');
  } catch {
    return { status: 404, body: { issues: [{ message: `No diagram source '${from}'` }] } };
  }
  try {
    await access(toDiagram);
    return { status: 409, body: { issues: [{ message: `A diagram named '${to}' already exists` }] } };
  } catch {
    /* target free — proceed */
  }
  let model: Record<string, unknown>;
  try {
    model = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { issues: [{ message: `Corrupt diagram source '${from}'` }] } };
  }
  model['id'] = to;
  model['name'] = to;
  await mkdir(path.dirname(toDiagram), { recursive: true });
  await writeFile(toDiagram, `${JSON.stringify(model, null, 2)}\n`);
  await unlink(fromDiagram);
  // Carry the layout over when it exists; its absence is not an error.
  try {
    await rename(path.join(diagramsDir, `${from}.layout.json`), path.join(diagramsDir, `${to}.layout.json`));
  } catch {
    /* no layout to move */
  }
  try {
    await rename(path.join(diagramsDir, `${from}.drawings.json`), path.join(diagramsDir, `${to}.drawings.json`));
  } catch {
    /* no drawings to move */
  }
  return { status: 200, body: { ok: true } };
}

/** Promote a JSON-owned diagram to a generated `.diagram.ts`. See `ejectDiagram`
 * for the round-trip guarantee; this just maps its failure codes to statuses. */
export async function ejectDiagramSource(diagramsDir: string, artifactsDir: string, name: string): Promise<HandlerResult> {
  if (!isSafeName(name)) return { status: 400, body: { issues: [{ message: `Unsafe name '${name}'` }] } };
  try {
    await ejectDiagram(diagramsDir, artifactsDir, name);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    if (e instanceof EjectError) {
      const status = e.code === 'not-found' ? 404 : e.code === 'invalid' ? 400 : 409;
      return { status, body: { issues: [{ message: e.message }] } };
    }
    throw e;
  }
}

export async function saveLayout(diagramsDir: string, name: string, payload: unknown): Promise<HandlerResult> {
  if (!isSafeName(name)) return { status: 400, body: { issues: [{ message: `Unsafe name '${name}'` }] } };
  // Core's structural guard mirrors the old inline checks (version 1, nested
  // numeric x/y planes, optional positive-finite sizes) — one source of truth
  // shared with the client-side artifact loader.
  if (!isLayoutOverlay(payload)) return { status: 400, body: { issues: [{ message: 'Not a version-1 layout overlay' }] } };
  const target = path.join(diagramsDir, `${name}.layout.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

/** Persist the drawings sidecar. An overlay in which no bucket holds a stroke
 * DELETES the file instead of writing it: a diagram that never had drawings
 * must never grow an empty `<name>.drawings.json`, and erasing the last stroke
 * should leave the tree as it was. */
export async function saveDrawings(diagramsDir: string, name: string, payload: unknown): Promise<HandlerResult> {
  if (!isSafeName(name)) return { status: 400, body: { issues: [{ message: `Unsafe name '${name}'` }] } };
  if (!isDrawings(payload)) return { status: 400, body: { issues: [{ message: 'Not a version-1 drawings overlay' }] } };
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
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

export async function readLibrary(diagramsDir: string): Promise<HandlerResult> {
  try {
    const raw = await readFile(path.join(diagramsDir, 'library.json'), 'utf8');
    return { status: 200, body: JSON.parse(raw) };
  } catch {
    return { status: 200, body: { categories: [], entries: [] } };
  }
}

// Must cover every NodeTemplate presentation channel — 'shape' included, or a
// user library holding an imported silhouette is rejected on save.
const TEMPLATE_STRING_KEYS = new Set(['type', 'color', 'image', 'shape']);
const TEMPLATE_NUMBER_KEYS = new Set(['width', 'height']);

/** Persist the whole user library. Validates internal consistency only — bundled
 * packs are merged client-side and never written here. */
export async function saveLibrary(diagramsDir: string, payload: unknown): Promise<HandlerResult> {
  const p = payload as { categories?: unknown; entries?: unknown } | null;
  if (p === null || !Array.isArray(p.categories) || !Array.isArray(p.entries)) {
    return { status: 400, body: { issues: [{ message: 'Not a library { categories, entries }' }] } };
  }
  const catIds = new Set<string>();
  for (const c of p.categories) {
    const cat = c as { id?: unknown; name?: unknown };
    if (typeof cat.id !== 'string' || typeof cat.name !== 'string') {
      return { status: 400, body: { issues: [{ message: 'Category needs string id and name' }] } };
    }
    if (catIds.has(cat.id)) return { status: 400, body: { issues: [{ message: `Duplicate category '${cat.id}'` }] } };
    catIds.add(cat.id);
  }
  const entryIds = new Set<string>();
  for (const e of p.entries) {
    const entry = e as { id?: unknown; category?: unknown; name?: unknown; template?: unknown };
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.category !== 'string') {
      return { status: 400, body: { issues: [{ message: 'Entry needs string id, name, category' }] } };
    }
    if (!catIds.has(entry.category)) {
      return { status: 400, body: { issues: [{ message: `Entry '${entry.id}' references unknown category '${entry.category}'` }] } };
    }
    if (entryIds.has(entry.id)) return { status: 400, body: { issues: [{ message: `Duplicate entry '${entry.id}'` }] } };
    entryIds.add(entry.id);
    const t = entry.template as Record<string, unknown> | null;
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      return { status: 400, body: { issues: [{ message: `Entry '${entry.id}' missing template` }] } };
    }
    for (const [k, v] of Object.entries(t)) {
      const ok = TEMPLATE_STRING_KEYS.has(k) ? typeof v === 'string' : TEMPLATE_NUMBER_KEYS.has(k) ? typeof v === 'number' : false;
      if (!ok) return { status: 400, body: { issues: [{ message: `Entry '${entry.id}' has invalid template field '${k}'` }] } };
    }
  }
  const target = path.join(diagramsDir, 'library.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

// Keys here must stay in sync with IMAGE_REF's extension group (@diagramming/core) —
// an extension accepted by the regex but missing here would 404 on read.
const ASSET_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const ASSET_TYPE: Record<string, string> = Object.fromEntries(Object.entries(ASSET_EXT).map(([t, e]) => [e, t]));
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** store image bytes under their content hash; identical drops dedupe to one file */
export async function saveAsset(diagramsDir: string, contentType: string, bytes: Buffer): Promise<HandlerResult> {
  const ext = ASSET_EXT[contentType.split(';')[0]?.trim() ?? ''];
  if (ext === undefined) {
    return { status: 400, body: { issues: [{ message: `Unsupported image type '${contentType}'` }] } };
  }
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) {
    return { status: 400, body: { issues: [{ message: `Image must be 1 byte to ${MAX_ASSET_BYTES / 1024 / 1024} MB` }] } };
  }
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${ext}`;
  const target = path.join(diagramsDir, 'assets', name);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await access(target); // already stored — content hash guarantees same bytes
  } catch {
    await writeFile(target, bytes);
  }
  return { status: 200, body: { name } };
}

export async function readAsset(
  diagramsDir: string,
  name: string,
): Promise<HandlerResult & { bytes?: Buffer; contentType?: string }> {
  if (!IMAGE_REF.test(name)) return { status: 400, body: { issues: [{ message: `Unsafe asset name '${name}'` }] } };
  try {
    const bytes = await readFile(path.join(diagramsDir, 'assets', name));
    const ext = name.split('.').at(-1) ?? '';
    return { status: 200, body: null, bytes, contentType: ASSET_TYPE[ext === 'jpeg' ? 'jpg' : ext] ?? 'application/octet-stream' };
  } catch {
    return { status: 404, body: { issues: [{ message: `No asset '${name}'` }] } };
  }
}
