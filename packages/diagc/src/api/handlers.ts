import { access, mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  IMAGE_REF,
  composeIncludes,
  errMessage,
  isDrawings,
  isLayoutOverlay,
  validate,
  type DiagramModel,
} from '@diagc/core/internal';
import { writeFileAtomic } from '../atomic-write';
import { EjectError, ejectDiagram } from '../eject';
import { resolveInclude } from '../includes';
import { isSafeName } from '../names';
import { snapshotSession } from '../snapshots';
import { refuse, type HandlerResult } from './result';

export type { HandlerResult };

// The name rule every route checks, for the hosts and tests that reach it here.
export { isSafeName };

// path.dirname(diagramsDir) is the .diagrams root when diagramsDir is
// .diagrams/src — the same rootDir a locked session uses elsewhere (eject.ts).
// 'locked' because the boot/refresh path must never fetch or vendor a remote
// include on a viewer's behalf — that only happens at `diagc compile`.
const lockedResolver = (diagramsDir: string) =>
  snapshotSession(resolveInclude, path.dirname(diagramsDir), 'locked').resolver;

const hasIncludes = (m: DiagramModel | null): boolean =>
  m !== null && Array.isArray(m.nodes) && m.nodes.some((n) => n.include !== undefined);

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
    const isSource = sourceNames.has(name);
    // Every read and save refuses a name isSafeName refuses, so such a source is shown but not offered for editing.
    const editable = isSource && isSafeName(name);
    const file = isSource
      ? path.join(diagramsDir, `${name}.diagram.json`)
      : path.join(artifactsDir, `${name}.diagram.json`);
    let model: DiagramModel | null = null;
    const issues: { message: string }[] = [];
    if (isSource && !editable) {
      issues.push({
        message: `'${name}' is read-only here: the studio saves names of lowercase letters, digits, '-' and '/', none ending in /rename, /eject or /composed. Rename the file to edit it.`,
      });
    }
    try {
      model = JSON.parse(await readFile(file, 'utf8')) as DiagramModel;
    } catch {
      issues.push({ message: `Could not read model for '${name}'` });
    }
    if (isSource && hasIncludes(model)) model = await composedForList(model as DiagramModel, file, diagramsDir, issues);
    diagrams.push({ name, model, issues, editable });
  }
  return { status: 200, body: { diagrams } };
}

/** `model` with its includes expanded for the list, or `model` itself when they
 * cannot be, with what went wrong added to `issues`. */
async function composedForList(
  model: DiagramModel,
  file: string,
  diagramsDir: string,
  issues: { message: string }[],
): Promise<DiagramModel> {
  try {
    const { model: composed, warnings } = await composeIncludes(model, path.resolve(file), lockedResolver(diagramsDir));
    // compileFile refuses an invalid composed result outright, because the
    // renderer assumes a validated model — an id collision
    // between an umbrella-declared node and a namespaced include can pass
    // composeIncludes (which only grafts) while still being invalid, so
    // this must be checked here too, not just on compile.
    const validationIssues = validate(composed);
    if (validationIssues.length > 0) {
      // fall back to the raw model (include nodes as placeholders); it
      // still renders, unlike the unsound composed result
      issues.push(...validationIssues);
      return model;
    }
    for (const w of warnings) issues.push({ message: w });
    return composed;
  } catch (e) {
    // the raw model still renders (include nodes as placeholders); say why
    issues.push({ message: `Includes not expanded: ${errMessage(e)}` });
    return model;
  }
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
  if (!isSafeName(name)) return refuse(400, `Unsafe name '${name}'`);
  let model: unknown;
  try {
    model = JSON.parse(await readFile(path.join(diagramsDir, `${name}.diagram.json`), 'utf8'));
  } catch {
    return refuse(404, `No diagram source '${name}'`);
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

/** Composed read of an editable source — the studio's view-refresh after a
 * save. Sources without includes pass through untouched. */
export async function readComposedDiagram(diagramsDir: string, name: string): Promise<HandlerResult> {
  if (!isSafeName(name)) return refuse(400, `Unsafe name '${name}'`);
  const file = path.join(diagramsDir, `${name}.diagram.json`);
  let model: DiagramModel;
  try {
    model = JSON.parse(await readFile(file, 'utf8')) as DiagramModel;
  } catch {
    return refuse(404, `No diagram source '${name}'`);
  }
  if (!hasIncludes(model)) return { status: 200, body: { model } };
  try {
    const { model: composed, warnings } = await composeIncludes(model, path.resolve(file), lockedResolver(diagramsDir));
    // Same soundness check as composedForList: a composed model that fails
    // validation must never reach the renderer, so refuse it like a failed
    // compose instead of returning 200 with an unsound model.
    const issues = validate(composed);
    if (issues.length > 0) return { status: 409, body: { issues } };
    return { status: 200, body: { model: composed, ...(warnings.length > 0 ? { warnings } : {}) } };
  } catch (e) {
    return refuse(409, errMessage(e));
  }
}

/** A 409 when `<name>.diagram.ts` exists: that diagram is TypeScript's, and a JSON
 * twin beside it would compile to the same artifact, the last compile winning. */
async function ownedByTs(diagramsDir: string, name: string): Promise<HandlerResult | undefined> {
  const tsPath = path.join(diagramsDir, `${name}.diagram.ts`);
  try {
    await access(tsPath);
  } catch {
    return undefined;
  }
  return refuse(409, `'${name}' is already TypeScript-owned (${tsPath})`);
}

export async function saveDiagram(diagramsDir: string, name: string, payload: unknown): Promise<HandlerResult> {
  if (!isSafeName(name)) return refuse(400, `Unsafe name '${name}'`);
  const owned = await ownedByTs(diagramsDir, name);
  if (owned !== undefined) return owned;
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
    return refuse(400, 'Not a version-1 diagram model');
  }
  const issues = validate(payload as DiagramModel);
  if (issues.length > 0) return { status: 400, body: { issues } };
  const target = path.join(diagramsDir, `${name}.diagram.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

/** Move a designer-owned diagram (and its sibling layout, if any) to a new name,
 * rewriting the model's id to match so the file stays self-consistent. */
export async function renameDiagram(diagramsDir: string, from: string, to: string): Promise<HandlerResult> {
  if (!isSafeName(from) || !isSafeName(to)) {
    return refuse(400, `Unsafe name '${isSafeName(from) ? to : from}'`);
  }
  if (from === to) return refuse(400, 'New name is the same as the old');
  const fromDiagram = path.join(diagramsDir, `${from}.diagram.json`);
  const toDiagram = path.join(diagramsDir, `${to}.diagram.json`);
  let raw: string;
  try {
    raw = await readFile(fromDiagram, 'utf8');
  } catch {
    return refuse(404, `No diagram source '${from}'`);
  }
  try {
    await access(toDiagram);
    return refuse(409, `A diagram named '${to}' already exists`);
  } catch {
    /* target free — proceed */
  }
  const owned = await ownedByTs(diagramsDir, to);
  if (owned !== undefined) return owned;
  let model: Record<string, unknown>;
  try {
    model = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return refuse(400, `Corrupt diagram source '${from}'`);
  }
  // The id follows the file. The name is the diagram's title, so it follows only
  // when it was the id, a title nobody set.
  if (model['name'] === model['id']) model['name'] = to;
  model['id'] = to;
  await mkdir(path.dirname(toDiagram), { recursive: true });
  // Sidecars first, the source last, so the old name keeps its source until every
  // other step has worked. A failure undoes the steps before it, in reverse, and
  // the error answers 500.
  const moved: [string, string][] = [];
  let written = false;
  try {
    for (const sidecar of ['layout', 'drawings']) {
      const move: [string, string] = [
        path.join(diagramsDir, `${from}.${sidecar}.json`),
        path.join(diagramsDir, `${to}.${sidecar}.json`),
      ];
      if (await moveIfPresent(...move)) moved.push(move);
    }
    await writeFileAtomic(toDiagram, `${JSON.stringify(model, null, 2)}\n`);
    written = true;
    await unlink(fromDiagram);
  } catch (e) {
    if (written) await unlink(toDiagram).catch(() => {});
    for (const [src, dst] of moved.reverse()) await rename(dst, src).catch(() => {});
    throw e;
  }
  return { status: 200, body: { ok: true } };
}

/** `rename(src, dst)`, false when there is no `src` to move: a diagram need not have
 * a sidecar. Any other failure throws. */
async function moveIfPresent(src: string, dst: string): Promise<boolean> {
  try {
    await rename(src, dst);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

/** Promote a JSON-owned diagram to a generated `.diagram.ts`. See `ejectDiagram`
 * for the round-trip guarantee; this just maps its failure codes to statuses. */
export async function ejectDiagramSource(
  diagramsDir: string,
  artifactsDir: string,
  name: string,
): Promise<HandlerResult> {
  if (!isSafeName(name)) return refuse(400, `Unsafe name '${name}'`);
  try {
    await ejectDiagram(diagramsDir, artifactsDir, name);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    if (e instanceof EjectError) {
      const status = e.code === 'not-found' ? 404 : e.code === 'invalid' ? 400 : 409;
      return refuse(status, e.message);
    }
    throw e;
  }
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

/** The categories' ids, or why they cannot be saved: each needs a string id and
 * name, and no id may come twice. */
function checkCategories(categories: unknown[]): { ids: Set<string> } | { problem: string } {
  const ids = new Set<string>();
  for (const c of categories) {
    const cat = c as { id?: unknown; name?: unknown };
    if (typeof cat.id !== 'string' || typeof cat.name !== 'string') {
      return { problem: 'Category needs string id and name' };
    }
    if (ids.has(cat.id)) return { problem: `Duplicate category '${cat.id}'` };
    ids.add(cat.id);
  }
  return { ids };
}

/** Why the entries cannot be saved, or undefined. Each entry is checked whole before
 * the next: its fields, its category, its id, then its template. */
function checkEntries(entries: unknown[], categoryIds: ReadonlySet<string>): string | undefined {
  const ids = new Set<string>();
  for (const e of entries) {
    const entry = e as { id?: unknown; category?: unknown; name?: unknown; template?: unknown };
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.category !== 'string') {
      return 'Entry needs string id, name, category';
    }
    if (!categoryIds.has(entry.category)) {
      return `Entry '${entry.id}' references unknown category '${entry.category}'`;
    }
    if (ids.has(entry.id)) return `Duplicate entry '${entry.id}'`;
    ids.add(entry.id);
    const problem = checkTemplate(entry.id, entry.template);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/** Why entry `id`'s template cannot be saved, or undefined: it is an object whose
 * every field is a presentation channel of the right type. */
function checkTemplate(id: string, template: unknown): string | undefined {
  const t = template as Record<string, unknown> | null;
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return `Entry '${id}' missing template`;
  for (const [k, v] of Object.entries(t)) {
    const ok = TEMPLATE_STRING_KEYS.has(k)
      ? typeof v === 'string'
      : TEMPLATE_NUMBER_KEYS.has(k)
        ? typeof v === 'number'
        : false;
    if (!ok) return `Entry '${id}' has invalid template field '${k}'`;
  }
  return undefined;
}

/** Persist the whole user library. Validates internal consistency only — bundled
 * packs are merged client-side and never written here. */
export async function saveLibrary(diagramsDir: string, payload: unknown): Promise<HandlerResult> {
  const p = payload as { categories?: unknown; entries?: unknown } | null;
  if (p === null || !Array.isArray(p.categories) || !Array.isArray(p.entries)) {
    return refuse(400, 'Not a library { categories, entries }');
  }
  const categories = checkCategories(p.categories);
  if ('problem' in categories) return refuse(400, categories.problem);
  const problem = checkEntries(p.entries, categories.ids);
  if (problem !== undefined) return refuse(400, problem);
  const target = path.join(diagramsDir, 'library.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}

// Keys here must stay in sync with IMAGE_REF's extension group (@diagc/core) —
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
    return refuse(400, `Unsupported image type '${contentType}'`);
  }
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) {
    return refuse(400, `Image must be 1 byte to ${MAX_ASSET_BYTES / 1024 / 1024} MB`);
  }
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${ext}`;
  const target = path.join(diagramsDir, 'assets', name);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await access(target); // already stored — content hash guarantees same bytes
  } catch {
    await writeFileAtomic(target, bytes);
  }
  return { status: 200, body: { name } };
}

export async function readAsset(
  diagramsDir: string,
  name: string,
): Promise<HandlerResult & { bytes?: Buffer; contentType?: string }> {
  if (!IMAGE_REF.test(name)) return refuse(400, `Unsafe asset name '${name}'`);
  try {
    const bytes = await readFile(path.join(diagramsDir, 'assets', name));
    const ext = name.split('.').at(-1) ?? '';
    return {
      status: 200,
      body: null,
      bytes,
      contentType: ASSET_TYPE[ext === 'jpeg' ? 'jpg' : ext] ?? 'application/octet-stream',
    };
  } catch {
    return refuse(404, `No asset '${name}'`);
  }
}
