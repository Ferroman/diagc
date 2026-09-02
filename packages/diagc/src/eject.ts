import { access, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ejectSource, errMessage, validate, type DiagramModel } from '@diagramming/core';
import { compileFile, executeDiagramTs } from './compile';
import { resolveInclude } from './includes';
import { snapshotSession } from './snapshots';

export type EjectFailure = 'not-found' | 'already-ts' | 'invalid' | 'mismatch';

export class EjectError extends Error {
  constructor(message: string, readonly code: EjectFailure) {
    super(message);
    this.name = 'EjectError';
  }
}

export interface EjectOptions {
  coreEntry?: string;
  /** test seam: replaces the emitter, so a mismatch is constructible */
  emit?: (model: DiagramModel) => string;
}

/** Paths (dot-joined) where two models first differ, capped for readability. */
export function diffPaths(a: unknown, b: unknown, limit = 10): string[] {
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, at: string): void => {
    if (out.length >= limit || isDeepStrictEqual(x, y)) return;
    const xo = typeof x === 'object' && x !== null;
    const yo = typeof y === 'object' && y !== null;
    if (!xo || !yo) {
      out.push(at === '' ? '(root)' : at);
      return;
    }
    const keys = new Set([...Object.keys(x as object), ...Object.keys(y as object)]);
    for (const k of keys) {
      if (out.length >= limit) return;
      walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], at === '' ? k : `${at}.${k}`);
    }
  };
  walk(a, b, '');
  return out;
}

/**
 * Promote `<name>.diagram.json` to a generated `<name>.diagram.ts` — but only
 * after executing the generated source and proving it rebuilds the identical
 * model. Every failure path leaves the source directory exactly as found; the
 * TS is written before the JSON is deleted, so a crash between the two steps
 * leaves both — they then compile to the same artifact (last write wins), and
 * recovery is deleting whichever source is unwanted.
 */
export async function ejectDiagram(
  diagramsDir: string,
  artifactsDir: string,
  name: string,
  opts?: EjectOptions,
): Promise<{ tsPath: string }> {
  const jsonPath = path.join(diagramsDir, `${name}.diagram.json`);
  const tsPath = path.join(diagramsDir, `${name}.diagram.ts`);

  try {
    await access(tsPath);
    throw new EjectError(`'${name}' is already TypeScript-owned (${tsPath})`, 'already-ts');
  } catch (e) {
    if (e instanceof EjectError) throw e;
    /* no TS source — proceed */
  }

  let raw: string;
  try {
    raw = await readFile(jsonPath, 'utf8');
  } catch {
    throw new EjectError(`no diagram '${name}' (${jsonPath})`, 'not-found');
  }

  let parsed: DiagramModel;
  try {
    parsed = JSON.parse(raw) as DiagramModel;
  } catch (e) {
    throw new EjectError(`'${name}' is not valid JSON: ${errMessage(e)}`, 'invalid');
  }
  const issues = validate(parsed);
  if (issues.length > 0) {
    throw new EjectError(
      `'${name}' fails validation; fix it before ejecting:\n${issues.map((i) => `  ${i.message}`).join('\n')}`,
      'invalid',
    );
  }

  // A validate-clean model can still hold a value the emitter genuinely
  // cannot express (e.g. `undefined` reaching tsLiteral); classify that as a
  // refusal instead of letting a plain Error escape the taxonomy — otherwise
  // the API 500s and the CLI prints a bare, uncontextualized message.
  let source: string;
  try {
    source = (opts?.emit ?? ejectSource)(parsed);
  } catch (e) {
    throw new EjectError(`cannot eject '${name}': ${errMessage(e)}`, 'invalid');
  }

  // Execute from a temp dir outside the source glob, so a running compile
  // watcher never sees the candidate file. coreEntry makes /tmp resolvable.
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'diagc-eject-'));
  let rebuilt: DiagramModel;
  try {
    const tmpFile = path.join(tmpDir, `${path.basename(name)}.diagram.ts`);
    await writeFile(tmpFile, source);
    try {
      rebuilt = await executeDiagramTs(tmpFile, opts?.coreEntry);
    } catch (e) {
      throw new EjectError(`generated source failed to execute: ${errMessage(e)}`, 'mismatch');
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  if (!isDeepStrictEqual(rebuilt, parsed)) {
    throw new EjectError(
      `generated source does not reproduce the model — refusing to replace. Differs at:\n${diffPaths(rebuilt, parsed)
        .map((p) => `  ${p}`)
        .join('\n')}`,
      'mismatch',
    );
  }

  await writeFile(tsPath, source);
  await unlink(jsonPath);
  // path.dirname(diagramsDir) is the .diagrams root when diagramsDir is
  // .diagrams/src — the same rootDir a locked session uses elsewhere.
  const snap = snapshotSession(resolveInclude, path.dirname(diagramsDir), 'locked');
  await compileFile(tsPath, artifactsDir, {
    rootDir: diagramsDir,
    resolver: snap.resolver,
    ...(opts?.coreEntry !== undefined ? { coreEntry: opts.coreEntry } : {}),
  });
  return { tsPath };
}
