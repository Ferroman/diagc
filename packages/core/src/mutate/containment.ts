import type { ContainmentEdge, DiagramModel, DiagramNode } from '../types';
import { childrenOf } from '../children';
import { CommandError } from '../command-error';
import { canonicalPlane, containmentOn, defaultPlaneOf, isOnPlane } from '../planes';
import { defined } from '../util';
import { addNode } from './nodes';
import { requireNode } from './shared';

function wouldCycle(m: DiagramModel, parent: string, child: string, plane?: string): boolean {
  // Children index over this plane's edges, plus the candidate edge being added.
  const children = childrenOf(containmentOn(m, plane ?? defaultPlaneOf(m)));
  children.set(parent, [...(children.get(parent) ?? []), child]);
  // child must not reach parent
  const stack = [child];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined || seen.has(cur)) continue;
    if (cur === parent && seen.size > 0) return true;
    seen.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return false;
}

/**
 * Nest `edge.child` under `edge.parent`. `edge.plane` names the plane as a view
 * does: a borrowing plane writes to its donor, and the default plane is written
 * untagged (canonicalPlane). `beside` slots the new membership next to a sibling,
 * since child order is containment order.
 */
export function addContainment(
  m: DiagramModel,
  edge: ContainmentEdge,
  beside?: { sibling: string; side: 'before' | 'after' },
): DiagramModel {
  const { parent, child, plane } = edge;
  requireNode(m, parent);
  requireNode(m, child);
  if (parent === child) throw new CommandError(`Node '${parent}' cannot contain itself`);
  const canon = canonicalPlane(m, plane);
  const key = canon ?? defaultPlaneOf(m);
  if (m.containment.some((e) => e.parent === parent && e.child === child && isOnPlane(e, key, m))) return m;
  if (wouldCycle(m, parent, child, canon)) {
    throw new CommandError(`'${parent}' > '${child}' would create a containment cycle`);
  }
  const added = { parent, child, ...defined({ plane: canon }) };
  if (beside === undefined) return { ...m, containment: [...m.containment, added] };
  // Children read in declaration order, so the slot in the flat array IS the
  // sibling order — insert next to the sibling's own membership.
  const at = m.containment.findIndex((e) => e.parent === parent && e.child === beside.sibling && isOnPlane(e, key, m));
  if (at === -1) throw new CommandError(`'${beside.sibling}' is not a child of '${parent}'`);
  const i = beside.side === 'before' ? at : at + 1;
  return { ...m, containment: [...m.containment.slice(0, i), added, ...m.containment.slice(i)] };
}

/**
 * Group existing nodes under a new abstract parent: add `node`, then nest each
 * member under it. `plane` scopes both the containment edges and (via the
 * caller setting `node.plane`) the abstract node, so the grouping can live in a
 * single plane's view. Atomic: a bad member id throws before any partial model
 * escapes (the intermediate is a local value, never returned).
 */
export function groupNodes(
  m: DiagramModel,
  node: DiagramNode,
  memberIds: readonly string[],
  plane?: string,
): DiagramModel {
  let next = addNode(m, node);
  for (const child of memberIds) {
    next = addContainment(next, { parent: node.id, child, plane });
  }
  return next;
}

/** Remove `edge` from the plane it names (resolved as addContainment resolves it). */
export function removeContainment(m: DiagramModel, edge: ContainmentEdge): DiagramModel {
  const { parent, child, plane } = edge;
  const key = canonicalPlane(m, plane) ?? defaultPlaneOf(m);
  return {
    ...m,
    containment: m.containment.filter((e) => !(e.parent === parent && e.child === child && isOnPlane(e, key, m))),
  };
}

/**
 * Swap the containment entry `edge` names with the previous (`offset` -1) or next
 * (+1) entry under the same parent in the same plane. Sibling order IS containment
 * array order (buildHierarchy reads it as-is), so this is how an activity
 * frame's lanes are restacked. Entries under other parents keep their places.
 * At either end the model comes back unchanged (same reference).
 */
export function moveChild(m: DiagramModel, edge: ContainmentEdge, offset: -1 | 1): DiagramModel {
  const { parent, child, plane } = edge;
  const key = canonicalPlane(m, plane) ?? defaultPlaneOf(m);
  const siblings = m.containment.flatMap((e, i) => (e.parent === parent && isOnPlane(e, key, m) ? [i] : []));
  const at = siblings.findIndex((i) => m.containment[i]!.child === child);
  if (at === -1) throw new CommandError(`'${parent}' does not contain '${child}'`);
  const other = siblings[at + offset];
  if (other === undefined) return m;
  const containment = [...m.containment];
  [containment[siblings[at]!], containment[other]] = [containment[other]!, containment[siblings[at]!]!];
  return { ...m, containment };
}
