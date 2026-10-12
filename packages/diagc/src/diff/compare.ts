import { diffModels, isEmptyDiff, type DiagramModel, type ModelDiff } from '@diagc/core/internal';
import type { DiagramSet, DiagramVersion } from './load';

export type DiagramDiffStatus = DiagramDiff['status'];

/** A diagram only the later side has. Its `diff` is against an empty model, as a
 * removed diagram's is, so the marks cover the whole picture the same way. */
export interface AddedDiagram {
  name: string;
  status: 'added';
  after: DiagramVersion;
  diff: ModelDiff;
}

export interface RemovedDiagram {
  name: string;
  status: 'removed';
  before: DiagramVersion;
  diff: ModelDiff;
}

/** A diagram both sides have, changed or not. */
export interface ComparedDiagram {
  name: string;
  status: 'changed' | 'unchanged';
  before: DiagramVersion;
  after: DiagramVersion;
  diff: ModelDiff;
}

/** A diagram whose source did not compile on a side: there is nothing to compare, only
 * why. */
export interface UncomparedDiagram {
  name: string;
  status: 'error';
  error: string;
}

/** One diagram across the two sides; its status says what it carries. */
export type DiagramDiff = AddedDiagram | RemovedDiagram | ComparedDiagram | UncomparedDiagram;

const EMPTY: DiagramModel = {
  version: 1,
  id: '',
  name: '',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

/** Pair the two sets by name. `names` narrows the result to those diagrams. */
export function compareDiagramSets(
  before: DiagramSet,
  after: DiagramSet,
  names: readonly string[] = [],
): DiagramDiff[] {
  const all = new Set([
    ...before.versions.keys(),
    ...before.errors.keys(),
    ...after.versions.keys(),
    ...after.errors.keys(),
  ]);
  const wanted = names.length > 0 ? names.filter((n) => all.has(n)) : [...all].sort();
  return wanted.map((name): DiagramDiff => {
    const b = before.versions.get(name);
    const a = after.versions.get(name);
    const err = after.errors.get(name) ?? before.errors.get(name);
    if (err !== undefined) {
      const at = after.errors.has(name) ? after.label : before.label;
      return { name, status: 'error', error: `does not compile at ${at}: ${err}` };
    }
    if (b === undefined) return { name, status: 'added', after: a!, diff: diffModels(EMPTY, a!.model) };
    if (a === undefined) return { name, status: 'removed', before: b, diff: diffModels(b.model, EMPTY) };
    const diff = diffModels(b.model, a.model);
    return { name, status: isEmptyDiff(diff) ? 'unchanged' : 'changed', before: b, after: a, diff };
  });
}
