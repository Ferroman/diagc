import type { DiagramModel, DiffMarks, DiffStatus } from '@diagc/core';

/** A box's diff class: its own status, or `inside` for a container holding a
 * change somewhere below it — at rest a diagram is folded, and a change three
 * levels down would otherwise leave no trace on the picture. */
export type DiffNodeClass = DiffStatus | 'inside';

/** Every marked node, plus its containers (any plane) as `inside`. */
export function diffNodeClasses(model: DiagramModel, marks: DiffMarks): Map<string, DiffNodeClass> {
  const out = new Map<string, DiffNodeClass>(Object.entries(marks.nodes));
  const parents = new Map<string, string[]>();
  for (const e of model.containment) parents.set(e.child, [...(parents.get(e.child) ?? []), e.parent]);
  const climb = (id: string, seen: Set<string>) => {
    for (const p of parents.get(id) ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (!out.has(p)) out.set(p, 'inside');
      climb(p, seen);
    }
  };
  for (const id of Object.keys(marks.nodes)) climb(id, new Set([id]));
  // A relation's change belongs to its endpoints' containers too.
  for (const r of model.relations) {
    if (marks.relations[r.id] === undefined) continue;
    for (const end of [r.from, r.to]) climb(end, new Set([end]));
  }
  return out;
}

/** A drawn edge's diff status from the relations folded into it: one removed
 * or added relation names the whole edge only when nothing else is in it
 * unchanged; a mix reads as `changed`. */
export function diffEdgeStatus(constituents: readonly { id: string }[], marks: DiffMarks): DiffStatus | undefined {
  const statuses = constituents.map((c) => marks.relations[c.id]);
  if (statuses.every((s) => s === undefined)) return undefined;
  const first = statuses[0];
  return statuses.every((s) => s === first) ? first : 'changed';
}

/** React Flow wrapper class for a status, merged onto any it already has. */
export function withDiffClass(className: string | undefined, status: DiffNodeClass | undefined): string | undefined {
  if (status === undefined) return className;
  return className === undefined ? `dg-diff-${status}` : `${className} dg-diff-${status}`;
}
