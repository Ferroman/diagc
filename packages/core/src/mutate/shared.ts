// Helpers the mutations of more than one subject use.
import type { DiagramModel, DiagramNode, DiagramPlane } from '../types';
import { CommandError } from '../command-error';

export const requireNode = (model: DiagramModel, id: string): DiagramNode => {
  const n = model.nodes.find((x) => x.id === id);
  if (n === undefined) throw new CommandError(`Unknown node '${id}'`);
  return n;
};

export const applyNullable = <T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | null | undefined,
): T => {
  if (value === undefined) return obj;
  const next = { ...obj };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
};

type PlaneIdList = 'layers' | 'hides' | 'hidesTree';

/** Drop the ids each predicate matches from that list on every plane. An empty
 * list means the same as an absent one, so a list this pass empties is omitted
 * rather than saved as `[]`. A list it does not touch — an authored `[]`
 * included — stays as written and in its place, so the saved file's diff is
 * the deletion alone; a plane with no change keeps its reference. */
export function prunePlaneLists(
  planes: DiagramPlane[],
  drop: Partial<Record<PlaneIdList, (id: string) => boolean>>,
): DiagramPlane[] {
  const keys = Object.keys(drop) as PlaneIdList[];
  return planes.map((p) => {
    let next = p;
    for (const key of keys) {
      const list = p[key];
      const test = drop[key];
      if (list === undefined || test === undefined) continue;
      const kept = list.filter((x) => !test(x));
      if (kept.length === list.length) continue;
      if (kept.length > 0) {
        next = { ...next, [key]: kept };
      } else {
        const { [key]: _emptied, ...rest } = next;
        next = rest;
      }
    }
    return next;
  });
}

/** Drop every id satisfying `drop` from each plane's `hides`/`hidesTree`. */
export function prunePlaneHides(planes: DiagramPlane[], drop: (id: string) => boolean): DiagramPlane[] {
  return prunePlaneLists(planes, { hides: drop, hidesTree: drop });
}
