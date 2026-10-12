import { diffModels, isEmptyDiff, type DiagramModel, type ModelDiff } from '@diagc/core/internal';
import type { DiagramSet, DiagramVersion } from './load';

export type DiagramDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged' | 'error';

export interface DiagramDiff {
  name: string;
  status: DiagramDiffStatus;
  before?: DiagramVersion;
  after?: DiagramVersion;
  /** against an empty model for an added or removed diagram, so the marks
   * cover the whole picture the same way */
  diff?: ModelDiff;
  error?: string;
}

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
