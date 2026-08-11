import { uniqueNodeId, type DiagramModel } from '@diagramming/core';

/**
 * The per-placement identity + placement-scoping decided once for an add-node
 * flow: the generated id, the resolved parent (containment target, if any), and
 * the plane a view-local node should be tagged with.
 */
export interface CreateNodePlace {
  id: string;
  /** containment parent (id + the active plane's tag); undefined = top-level */
  parent?: { id: string; plane?: string };
  /** the plane id to tag a view-local node with; undefined = shared/untagged */
  scopedPlane: string | undefined;
}

export interface CreateNodeOptions {
  /** the node-type string fed to uniqueNodeId (e.g. 'node', 'image', 'icon') */
  kind: string;
  /** the active plane's id (undefined = Default/base view) */
  plane: string | undefined;
  /** whether the active plane borrows another plane's containment. A borrowing
   * plane's membership resolves to its base plane (compileView /
   * resolveContainmentPlane), so tagging a node with the borrowing plane's own
   * id would mismatch and the node would silently vanish — new nodes are added
   * shared instead (see the per-plane-views design doc). */
  borrowsContainment: boolean;
  /** the resolved parent id (defaultParentId output), if any */
  parentId: string | undefined;
}

/**
 * Shared add-node construction, collapsing the duplicated plane-scoping +
 * parent-resolution dance that addNode / createAt / placeFromLibrary / addImages
 * all repeated. Decides:
 *   - a unique id;
 *   - whether the node is view-local: tagged with the active plane only when it
 *     does NOT borrow containment (so a borrowing plane yields a shared node);
 *   - the placement parent (id + plane tag) when one exists.
 * Callers still build the node payload and dispatch set-position/set-size, which
 * differ per flow.
 */
export function createNodeAt(model: DiagramModel, opts: CreateNodeOptions): CreateNodePlace {
  const scoped = opts.plane !== undefined && !opts.borrowsContainment;
  const id = uniqueNodeId(model, opts.kind);
  const parent =
    opts.parentId !== undefined
      ? { id: opts.parentId, ...(opts.plane !== undefined ? { plane: opts.plane } : {}) }
      : undefined;
  return { id, parent, scopedPlane: scoped ? opts.plane : undefined };
}

/**
 * The ({plane?, layer?}) tags every newly-placed node carries: the resolved
 * view-local plane membership (from `createNodeAt`) + the current pen layer.
 * Spreading this into a node object keeps the plane/pen scoping in one place.
 */
export function placeTags(place: CreateNodePlace, penLayer: string | null): { plane?: string; layer?: string } {
  return {
    ...(place.scopedPlane !== undefined ? { plane: place.scopedPlane } : {}),
    ...(penLayer !== null ? { layer: penLayer } : {}),
  };
}
