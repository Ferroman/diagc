import { access, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { composeIncludes, errMessage, validate, type DiagramModel } from '@diagc/core/internal';
import { writeFileAtomic } from '../atomic-write';
import { EjectError, ejectDiagram } from '../eject';
import { isSafeName } from '../names';
import { lockedResolverFor } from '../snapshots';
import { walkDiagramJson } from './files';
import { refuse, type HandlerResult } from './result';

const hasIncludes = (m: DiagramModel | null): boolean =>
  m !== null && Array.isArray(m.nodes) && m.nodes.some((n) => n.include !== undefined);

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
    const { model: composed, warnings } = await composeIncludes(
      model,
      path.resolve(file),
      lockedResolverFor(diagramsDir),
    );
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
    const { model: composed, warnings } = await composeIncludes(
      model,
      path.resolve(file),
      lockedResolverFor(diagramsDir),
    );
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
