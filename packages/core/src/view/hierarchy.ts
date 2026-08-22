import type { DiagramModel, DiagramNode } from '../types';

export interface HierarchyIndex {
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  roots: string[];
}

/** Which plane's containment edges a view of `planeId` uses (resolves
 *  `containmentOf`, one hop — chains are a validation error). */
export function containmentPlaneOf(m: DiagramModel, planeId?: string): string | undefined {
  const planes = m.planes ?? [];
  const plane = planeId !== undefined ? planes.find((p) => p.id === planeId) : planes[0];
  return plane?.containmentOf ?? plane?.id;
}

/**
 * Containment indexes for one plane, over the plane's VISIBLE nodes only.
 * Visibility is explicit: a node is shared (`node.plane` unset) and shown unless
 * the plane hides it, or it is scoped to exactly this plane. Re-nesting via a
 * plane-tagged containment edge never changes membership. `plane` = the plane
 * being VIEWED; omitted = the model's default (first-declared) plane, or
 * all-shared for models without planes.
 *
 * A plane with `containmentOf` borrows the donor's containment edges, and
 * `node.plane` scopes are matched against the DONOR (a node pinned to the
 * borrowing plane is not in the donor's hierarchy — see the how-to). `hides` and
 * `hidesTree` are the exception: they are visibility choices, not structure, so
 * each is the borrower's own when it declares that field, and the donor's when it
 * does not (declare `hidesTree: []` to borrow a hierarchy and keep the detail the
 * donor drops).
 *
 * The two hide lists differ in what happens to the contents:
 *   - `hides` promotes them. A hidden box's children take its place, each with
 *     its own nesting intact. Composition depends on this: an umbrella hides the
 *     `include` wrapper to lift a whole service model into position.
 *   - `hidesTree` takes them with it, however deep — unless another still-visible
 *     box also contains a child, which keeps that child (containment is a DAG).
 * A node with no parent on this plane is a root and neither list can reach it
 * except by naming it.
 *
 * A node tagged with a transparent-sheet `layer` is visible only while that layer
 * is active; untagged nodes are the always-on base sheet. `activeLayers` omitted =
 * no layer filtering (every layer treated as on). Layers deliberately do NOT
 * cascade: a layer is an overlay you flip, and its children keep their own
 * visibility, so a layered box still promotes its interior when it is off.
 */
export function buildHierarchy(m: DiagramModel, plane?: string, activeLayers?: ReadonlySet<string>): HierarchyIndex {
  const planes = m.planes ?? [];
  const defaultPlane = planes[0]?.id;
  // `?? plane` keeps an unknown plane id behaving as it always did (an empty
  // view) instead of falling back to every containment edge in the model.
  const active = containmentPlaneOf(m, plane) ?? plane ?? defaultPlane;
  const viewDef = plane !== undefined ? planes.find((p) => p.id === plane) : planes[0];
  const donorDef = active !== undefined ? planes.find((p) => p.id === active) : undefined;
  const hides = new Set(viewDef?.hides ?? donorDef?.hides ?? []);
  const hidesTree = new Set(viewDef?.hidesTree ?? donorDef?.hidesTree ?? []);

  // This plane's containment BEFORE any visibility filtering: the cascade has to
  // see the edges that point into a hidden box to know what it contained.
  const planeEdges =
    active === undefined ? m.containment : m.containment.filter((e) => (e.plane ?? defaultPlane) === active);

  // The `hidesTree` closure. Only `hidesTree` ids SEED it, but a parent hidden
  // either way counts as hidden when deciding whether a child has any visible
  // parent left. Ids of plane-scoped nodes are dropped: such a node ignores
  // `hides` (validate.ts reports that as `redundant-hide`), so it must not seed
  // the closure either. Derived hiding applies to every node, scoped ones
  // included — "nothing visible contains me any more".
  const scopedIds = new Set(m.nodes.filter((n) => n.plane !== undefined).map((n) => n.id));
  const shared = (id: string): boolean => !scopedIds.has(id);
  const hidden = new Set([...hides, ...hidesTree].filter(shared));
  const parentsAll = new Map<string, string[]>();
  const childrenAll = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string): void => {
    const list = map.get(key);
    if (list === undefined) map.set(key, [value]);
    else list.push(value);
  };
  for (const e of planeEdges) {
    push(parentsAll, e.child, e.parent);
    push(childrenAll, e.parent, e.child);
  }
  const queue = [...hidesTree].filter(shared);
  for (let i = 0; i < queue.length; i++) {
    for (const child of childrenAll.get(queue[i]!) ?? []) {
      if (hidden.has(child)) continue;
      if ((parentsAll.get(child) ?? []).every((p) => hidden.has(p))) {
        hidden.add(child);
        queue.push(child);
      }
    }
  }

  const layerOn = (n: DiagramNode): boolean =>
    n.layer === undefined || activeLayers === undefined || activeLayers.has(n.layer);
  const isVisible = (n: DiagramNode): boolean =>
    (n.plane === undefined || n.plane === active) && !hidden.has(n.id) && layerOn(n);
  const visible = new Set(m.nodes.filter(isVisible).map((n) => n.id));

  const edges = planeEdges.filter((e) => visible.has(e.parent) && visible.has(e.child));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const id of visible) {
    parentsOf.set(id, []);
    childrenOf.set(id, []);
  }
  for (const e of edges) {
    childrenOf.get(e.parent)?.push(e.child);
    parentsOf.get(e.child)?.push(e.parent);
  }
  const roots = m.nodes
    .filter((n) => visible.has(n.id) && (parentsOf.get(n.id)?.length ?? 0) === 0)
    .map((n) => n.id);
  return { parentsOf, childrenOf, roots };
}
