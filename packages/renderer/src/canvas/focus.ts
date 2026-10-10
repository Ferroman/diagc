import { buildHierarchy, type DiagramModel } from '@diagc/core/internal';

/**
 * Sheet-flip focus mapping: given the node ids currently on screen, return the
 * focus set that keeps those entities visible in another plane — every
 * ancestor (in the target plane's hierarchy) of every visible entity.
 * Entities that don't exist in the target plane contribute nothing.
 */
export function focusForVisible(m: DiagramModel, plane: string | undefined, visibleIds: string[]): string[] {
  const h = buildHierarchy(m, plane);
  const focus = new Set<string>();
  for (const id of visibleIds) {
    const stack = [...(h.parentsOf.get(id) ?? [])];
    while (stack.length > 0) {
      const parent = stack.pop();
      if (parent === undefined || focus.has(parent)) continue;
      focus.add(parent);
      stack.push(...(h.parentsOf.get(parent) ?? []));
    }
  }
  return [...focus];
}
