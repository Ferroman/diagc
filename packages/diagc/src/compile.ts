import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createJiti } from 'jiti';
import {
  composeIncludes,
  DiagramValidationError,
  diagramWarnings,
  errMessage,
  validate,
  type DiagramModel,
  type IncludeResolver,
} from '@diagc/core';
import { resolveInclude } from './includes';
import { snapshotSession } from './snapshots';

/**
 * Shape guard: with `{ default: true }` jiti returns the module NAMESPACE when
 * there is no default export, so a default-less file would otherwise be written
 * verbatim. Reject anything that is not a diagram model before we validate it.
 */
function assertDiagramShape(model: unknown, file: string): asserts model is DiagramModel {
  if (
    typeof model !== 'object' ||
    model === null ||
    (model as { version?: unknown }).version !== 1 ||
    !Array.isArray((model as { nodes?: unknown }).nodes)
  ) {
    throw new Error(`${file}: no default export or not a diagram model`);
  }
}

/**
 * A source that threw while running — a misspelled method, a builder call that
 * refused — placed at the first stack frame inside that file. V8 writes the file
 * into every frame and jiti keeps the author's lines, so no source map is needed;
 * taking the first frame *in the user's file* also puts a refusal the builder
 * throws at the call that caused it. A transform error has no such frame: then
 * there is no position and the message is left as it was.
 */
export class LoadError extends Error {
  readonly line: number | undefined;
  readonly column: number | undefined;
  constructor(
    readonly file: string,
    readonly reason: string,
    position?: { line: number; column: number },
  ) {
    super(position !== undefined ? `${file}:${position.line}:${position.column}: ${reason}` : reason);
    this.name = 'LoadError';
    this.line = position?.line;
    this.column = position?.column;
  }
}

/** The line and column of the first `at` frame inside `file`. Matched on the
 * basename after a path separator: a frame spells the path as it was imported,
 * which a symlinked temp dir would not equal; the message line is skipped because
 * a transform error quotes `file:line:col` there and that is not a frame. */
export function positionIn(stack: string | undefined, file: string): { line: number; column: number } | undefined {
  const base = path.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frame = new RegExp(`[\\\\/]${base}:(\\d+):(\\d+)`);
  for (const line of (stack ?? '').split('\n')) {
    if (!line.trimStart().startsWith('at ')) continue;
    const m = frame.exec(line);
    if (m !== null) return { line: Number(m[1]), column: Number(m[2]) };
  }
  return undefined;
}

/**
 * Execute a `.diagram.ts` through jiti (core pinned to `coreEntry`) and return
 * its model — shape-guarded but not validated; callers own validation.
 */
export async function executeDiagramTs(file: string, coreEntry?: string): Promise<DiagramModel> {
  // Always pin @diagc/core to the copy visible from this file. Bare
  // resolution from the diagram's own location only works when the diagram
  // lives under a node_modules-covered tree (it fails for e.g. /tmp), so
  // `coreEntry` is not just a safeguard — without a default, compilation is
  // at the mercy of the install layout.
  const resolvedCoreEntry = coreEntry ?? createRequire(import.meta.url).resolve('@diagc/core');
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    alias: { '@diagc/core': resolvedCoreEntry },
  });
  let def: unknown;
  try {
    def = await jiti.import<unknown>(path.resolve(file), { default: true });
  } catch (e) {
    // A validation error thrown inside the module keeps its shape: lint reads its
    // `issues` by name. Everything else is the source failing to run.
    if (e instanceof Error && e.name === 'DiagramValidationError') throw e;
    throw new LoadError(file, errMessage(e), positionIn(e instanceof Error ? e.stack : undefined, file));
  }

  const hasToJSON = typeof (def as { toJSON?: unknown } | null)?.toJSON === 'function';
  const model = (hasToJSON ? (def as { toJSON(): DiagramModel }).toJSON() : def) as DiagramModel;

  assertDiagramShape(model, file);
  return model;
}

/**
 * Resolve the subdirectory of `file` relative to `rootDir` so nested diagram
 * files map to nested artifacts instead of clobbering each other by basename.
 * Returns '' (flat) when there is no rootDir, the file is a top-level child of
 * rootDir, or the file lives outside rootDir.
 */
function relativeSubdir(file: string, rootDir?: string): string {
  if (!rootDir) return '';
  const rel = path.relative(path.resolve(rootDir), path.resolve(file));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  const dir = path.dirname(rel);
  return dir === '.' ? '' : dir;
}

export interface LoadOptions {
  rootDir?: string;
  coreEntry?: string;
  resolver?: IncludeResolver;
}

/**
 * Read a source, validate it, expand its includes and validate the result: the
 * model `compile` writes and `lint` inspects. Throws on anything invalid.
 */
export async function loadModel(file: string, opts?: LoadOptions): Promise<DiagramModel> {
  const isJsonSource = file.endsWith('.diagram.json');
  let model: DiagramModel;
  if (isJsonSource) {
    const def = JSON.parse(await readFile(path.resolve(file), 'utf8'));
    const hasToJSON = typeof (def as { toJSON?: unknown } | null)?.toJSON === 'function';
    model = (hasToJSON ? (def as { toJSON(): DiagramModel }).toJSON() : def) as DiagramModel;
    assertDiagramShape(model, file);
  } else {
    model = await executeDiagramTs(file, opts?.coreEntry);
  }

  // Validate unconditionally. The builder path already validated inside toJSON,
  // but plain-object default exports never touched validate() — and re-validating
  // the builder's output here is harmless and keeps a single code path. `validate`
  // is a pure function, so there is no jiti class-identity problem, and the
  // DiagramValidationError is constructed in this module world (instanceof works).
  //
  // Validate the authored source first (its own duplicate keys etc. must fail
  // before composition would silently merge them), then expand includes and
  // validate the composed result too.
  const sourceIssues = validate(model);
  if (sourceIssues.length > 0) throw new DiagramValidationError(sourceIssues);

  if (model.nodes.some((n) => n.include !== undefined)) {
    // Default to a locked snapshot resolver rooted at rootDir's parent (the
    // .diagrams root, same derivation as eject.ts): a call site that forgets
    // to pass `resolver` must fail on an unsnapshotted remote include, not
    // silently reintroduce live fetching. Local includes pass through either
    // way; only without a rootDir to anchor the vendor dir does the raw
    // resolver remain the fallback.
    const resolver =
      opts?.resolver ??
      (opts?.rootDir !== undefined
        ? snapshotSession(resolveInclude, path.dirname(path.resolve(opts.rootDir)), 'locked').resolver
        : resolveInclude);
    const { model: composed, warnings } = await composeIncludes(model, path.resolve(file), resolver);
    for (const w of warnings) console.warn(`${file}: ${w}`);
    model = composed;
    const issues = validate(model);
    if (issues.length > 0) throw new DiagramValidationError(issues);
  }
  return model;
}

export async function compileFile(file: string, outDir: string, opts?: LoadOptions): Promise<string> {
  const model = await loadModel(file, opts);
  // Sound but probably not what was meant (a fishbone cause on no bone, a typo'd
  // type): say so, and compile anyway — the studio saves the same model without
  // complaint. `diagc lint` is the strict reading of the same list.
  for (const w of diagramWarnings(model)) console.warn(`${file}: ${w.message}`);

  const base = path.basename(file).replace(/\.diagram\.(ts|json)$/, '');
  const artifactDir = path.join(outDir, relativeSubdir(file, opts?.rootDir));
  await mkdir(artifactDir, { recursive: true });
  const artifact = path.join(artifactDir, `${base}.diagram.json`);
  await writeFile(artifact, `${JSON.stringify(model, null, 2)}\n`);
  return artifact;
}
