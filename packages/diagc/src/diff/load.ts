import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { errMessage, isDrawings, type DiagramModel, type Drawings, type LayoutOverlay } from '@diagc/core/internal';
import { loadModel } from '../compile';

/** One diagram as a version of the repo had it: the compiled model plus the
 * sidecars a picture of it needs. */
export interface DiagramVersion {
  model: DiagramModel;
  layout?: LayoutOverlay;
  drawings?: Drawings;
}

/** Every diagram under one `.diagrams/` directory, by name (its path under
 * `src/` without the extension — the names `publish` uses). */
export interface DiagramSet {
  /** shown in the summary and on the pictures: a ref, or "working tree" */
  label: string;
  diagramsDir: string;
  versions: Map<string, DiagramVersion>;
  /** diagrams whose source did not compile at this version, with why */
  errors: Map<string, string>;
  /** sidecars left out of the pictures because they could not be read, each named */
  warnings: string[];
}

/** A sidecar's JSON, nothing when there is no file, or why it is left out: it does
 * not parse, or `shape` refuses it. */
async function readSidecar(
  file: string,
  shape?: { fits: (v: unknown) => boolean; what: string },
): Promise<{ value?: unknown; why?: string }> {
  if (!existsSync(file)) return {};
  let value: unknown;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    return { why: `does not parse (${errMessage(e)})` };
  }
  return shape === undefined || shape.fits(value) ? { value } : { why: `not ${shape.what}` };
}

/** Compile every source under `diagramsDir/src` in memory — nothing is written. */
export async function loadDiagramSet(label: string, diagramsDir: string, coreEntry?: string): Promise<DiagramSet> {
  const srcDir = path.join(diagramsDir, 'src');
  const versions = new Map<string, DiagramVersion>();
  const errors = new Map<string, string>();
  const warnings: string[] = [];
  const files = existsSync(srcDir) ? await fg('**/*.diagram.{ts,json}', { cwd: srcDir }) : [];
  for (const rel of files.sort()) {
    const name = rel.replace(/\.diagram\.(ts|json)$/, '');
    let model: DiagramModel;
    try {
      model = await loadModel(path.join(srcDir, rel), {
        rootDir: srcDir,
        ...(coreEntry !== undefined ? { coreEntry } : {}),
      });
    } catch (e) {
      errors.set(name, errMessage(e));
      continue;
    }
    // A sidecar that cannot be read is left out of the picture and named, as publish
    // does with malformed drawings: the model is still compared.
    const layout = await readSidecar(path.join(srcDir, `${name}.layout.json`));
    const drawings = await readSidecar(path.join(srcDir, `${name}.drawings.json`), {
      fits: isDrawings,
      what: 'a drawings overlay',
    });
    for (const [file, read] of [
      [`${name}.layout.json`, layout],
      [`${name}.drawings.json`, drawings],
    ] as const) {
      if (read.why !== undefined) warnings.push(`${file} at ${label}: ${read.why} — compared and drawn without it`);
    }
    versions.set(name, {
      model,
      ...(layout.value !== undefined ? { layout: layout.value as LayoutOverlay } : {}),
      ...(drawings.value !== undefined ? { drawings: drawings.value as Drawings } : {}),
    });
  }
  return { label, diagramsDir, versions, errors, warnings };
}
