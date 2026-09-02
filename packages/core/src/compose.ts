import type { ContainmentEdge, DiagramModel, DiagramNode, DiagramPlane, DiagramRelation } from './types';
import { validate } from './validate';
import { resolveContainmentPlane } from './view/compile';
import { errMessage } from './util';

export interface IncludeSource {
  model: DiagramModel;
  /** canonical resolved ref (absolute URL/path) — cycle detection compares these */
  ref: string;
}

export type IncludeResolver = (spec: string, fromRef: string) => Promise<IncludeSource>;

export class IncludeError extends Error {
  constructor(
    readonly spec: string,
    message: string,
  ) {
    super(message);
    this.name = 'IncludeError';
  }
}

export const MAX_INCLUDE_DEPTH = 10;

/** Compile-time include expansion: nodes with `include` become containers for
 * the referenced diagram's content (namespaced), then keyed nodes unify
 * model-wide. Pure — all IO goes through the injected resolver. */
export async function composeIncludes(
  model: DiagramModel,
  ref: string,
  resolve: IncludeResolver,
): Promise<{ model: DiagramModel; warnings: string[] }> {
  const warnings: string[] = [];
  const rootIds = new Set(model.nodes.map((n) => n.id));
  const expanded = await expand(model, ref, [ref], resolve);
  const unified = unifyKeys(expanded, rootIds, warnings);
  return { model: stripIncludes(unified), warnings };
}

/** Composed output must be includable itself: strip `include` from every node so
 * that including a published composed artifact grafts its content once instead of
 * re-expanding it (which would either ENOENT resolving relative specs against the
 * artifact's new location, or double-graft into duplicate ids). Retained `key`
 * fields carry transitive identity onward across further composes. `includePlane`
 * and `includePlanes` are graft-time-only options that travel with `include` and
 * are stripped alongside it. */
function stripIncludes(model: DiagramModel): DiagramModel {
  const has = (n: DiagramNode): boolean =>
    n.include !== undefined || n.includePlane !== undefined || n.includePlanes !== undefined;
  if (!model.nodes.some(has)) return model;
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      if (!has(n)) return n;
      const { include: _i, includePlane: _p, includePlanes: _ps, ...rest } = n;
      return rest;
    }),
  };
}

async function expand(
  model: DiagramModel,
  ref: string,
  path: string[],
  resolve: IncludeResolver,
): Promise<DiagramModel> {
  if (path.length > MAX_INCLUDE_DEPTH) {
    throw new IncludeError(ref, `Include depth exceeds ${MAX_INCLUDE_DEPTH}: ${path.join(' -> ')}`);
  }
  let out: DiagramModel = {
    ...model,
    nodes: [...model.nodes],
    containment: [...model.containment],
    relations: [...model.relations],
    layers: [...model.layers],
    planes: [...model.planes],
  };
  for (const node of model.nodes) {
    if (node.include === undefined) continue;
    let src: IncludeSource;
    try {
      src = await resolve(node.include, ref);
    } catch (e) {
      throw new IncludeError(node.include, `Include '${node.include}' (from ${ref}): ${errMessage(e)}`);
    }
    if (path.includes(src.ref)) {
      throw new IncludeError(node.include, `Include cycle: ${[...path, src.ref].join(' -> ')}`);
    }
    const issues = validate(src.model);
    if (issues.length > 0) {
      throw new IncludeError(
        node.include,
        `Include '${node.include}' (from ${ref}) is invalid: ${issues.map((i) => i.message).join('; ')}`,
      );
    }
    const child = await expand(src.model, src.ref, [...path, src.ref], resolve);
    out = graft(out, node, child);
  }
  return out;
}

/** merge `child`'s content into `host` under `into`, namespaced by its id.
 * Same-id layers unify with the host's; see the note inside. */
function graft(host: DiagramModel, into: DiagramNode, child: DiagramModel): DiagramModel {
  const p = (id: string): string => `${into.id}/${id}`;
  if (into.includePlane !== undefined && !child.planes.some((pl) => pl.id === into.includePlane)) {
    throw new IncludeError(
      into.include ?? into.id,
      `Include '${into.id}': plane '${into.includePlane}' not found in the included diagram`,
    );
  }
  const defaultPlane = resolveContainmentPlane(child, undefined);
  // the structural plane: the named one (resolved through containmentOf) or the default
  const structural = resolveContainmentPlane(child, into.includePlane);

  // Layers: an included layer whose id the host already declares merges into the
  // host's layer (host name/tint win, no duplicate row); every other layer is
  // namespaced like the nodes. Node and relation `layer` refs follow the same map.
  const hostLayerIds = new Set(host.layers.map((l) => l.id));
  const layerId = (id: string): string => (hostLayerIds.has(id) ? id : p(id));

  const nodes: DiagramNode[] = child.nodes.map((n) => ({
    ...n,
    id: p(n.id),
    ...(n.layer !== undefined ? { layer: layerId(n.layer) } : {}),
  }));

  // only the selected plane's structure comes along, imported untagged (default:
  // the include's default plane, reproducing today's behavior unchanged)
  const containment: ContainmentEdge[] = child.containment
    .filter((e) => (e.plane ?? defaultPlane) === structural)
    .map((e) => ({ parent: p(e.parent), child: p(e.child) }));

  // included roots (parentless in the selected plane) hang under the include node
  const hasParent = new Set(containment.map((e) => e.child));
  for (const n of nodes) {
    if (!hasParent.has(n.id)) containment.push({ parent: into.id, child: n.id });
  }

  const layers = child.layers
    .filter((l) => !hostLayerIds.has(l.id))
    .map((l) => ({ ...l, id: p(l.id), name: `${into.name}/${l.name}` }));
  const relations: DiagramRelation[] = child.relations.map((r) => ({
    ...r,
    id: p(r.id),
    from: p(r.from),
    to: p(r.to),
    ...(r.layer !== undefined ? { layer: layerId(r.layer) } : {}),
  }));

  // Carried planes (opt-in): the include's planes come over namespaced with
  // notation intact, so switching to one shows the child's content standalone
  // in its own visual language. The child's default-plane rows land twice —
  // untagged (host structure, unchanged behavior) and tagged for the carried
  // plane — while already-tagged rows land tagged only (they were dropped
  // entirely before this feature).
  const carriedPlanes: DiagramPlane[] = [];
  const carriedContainment: ContainmentEdge[] = [];
  if (into.includePlanes === true) {
    if (child.planes.length > 0) {
      for (const pl of child.planes) {
        carriedPlanes.push({
          ...pl,
          id: p(pl.id),
          name: `${into.name}/${pl.name}`,
          ...(pl.containmentOf !== undefined ? { containmentOf: p(pl.containmentOf) } : {}),
          ...(pl.layers !== undefined ? { layers: pl.layers.map(layerId) } : {}),
          ...(pl.hides !== undefined ? { hides: pl.hides.map(p) } : {}),
          ...(pl.hidesTree !== undefined ? { hidesTree: pl.hidesTree.map(p) } : {}),
        });
      }
      for (const e of child.containment) {
        const plane = e.plane ?? defaultPlane;
        if (plane === undefined) continue;
        carriedContainment.push({ parent: p(e.parent), child: p(e.child), plane: p(plane) });
      }
    } else if (child.notation !== undefined) {
      // zero-plane child: synthesize one plane to carry the model-level notation
      carriedPlanes.push({ id: p('main'), name: into.name, notation: child.notation });
      for (const e of child.containment) {
        carriedContainment.push({ parent: p(e.parent), child: p(e.child), plane: p('main') });
      }
    }
  }

  // If carried planes are landing on a host that declares none of its own, the
  // FIRST carried plane would take `planes[0]` — the model's DEFAULT view.
  // Untagged containment resolves to `planes[0]` too (buildHierarchy/gitGraph:
  // `defaultPlane = planes[0]?.id`, matched via `(e.plane ?? defaultPlane) ===
  // active`), so an unguarded carry would both silently retarget the default
  // view onto the carried plane's content and leak the host's own untagged
  // rows into it — and corrupt a further include's structural resolution the
  // same way, since ITS `defaultPlane` would then resolve to the carried plane
  // instead of the host's real structure. Synthesizing an explicit host base
  // plane ahead of the carried ones keeps `planes[0]` a plain view of untagged
  // content, exactly like a plane-less host today; carried planes start at
  // index 1+ and see only their own tagged rows. A later sibling include's
  // graft sees `host.planes.length > 0` by then and skips this.
  const basePlane: DiagramPlane[] =
    host.planes.length === 0 && carriedPlanes.length > 0 ? [{ id: 'main', name: host.name }] : [];

  // Everything not listed below is the HOST's — `...host` carries its `legend`,
  // `typeColors` and `layerRules` and the child's are never read. Deliberate:
  // those are presentation, and the diagram being looked at owns the look.
  return {
    ...host,
    nodes: [...host.nodes, ...nodes],
    containment: [...host.containment, ...containment, ...carriedContainment],
    relations: [...host.relations, ...relations],
    layers: [...host.layers, ...layers],
    planes: [...host.planes, ...basePlane, ...carriedPlanes],
  };
}

/** Global key pass: every keyed node unifies under its key as the composed id;
 * all references are rewritten. Display attributes: an umbrella-authored
 * declaration wins over includes; among includes, first encountered wins. */
function unifyKeys(model: DiagramModel, rootIds: Set<string>, warnings: string[]): DiagramModel {
  const byKey = new Map<string, DiagramNode[]>();
  for (const n of model.nodes) {
    if (n.key === undefined) continue;
    byKey.set(n.key, [...(byKey.get(n.key) ?? []), n]);
  }
  if (byKey.size === 0) return model;

  const rename = new Map<string, string>(); // old id -> key
  const winners = new Map<string, DiagramNode>(); // key -> display-attribute source
  for (const [key, members] of byKey) {
    const occupant = model.nodes.find((n) => n.id === key && n.key === undefined);
    if (occupant !== undefined) {
      throw new IncludeError(key, `Key '${key}' collides with unrelated node id '${occupant.id}'`);
    }
    const winner = members.find((m) => rootIds.has(m.id)) ?? members[0];
    if (winner === undefined) continue; // unreachable: members is non-empty
    winners.set(key, winner);
    const shownType = (t: string | undefined) => (t === undefined ? 'no type' : `type '${t}'`);
    for (const m of members) {
      rename.set(m.id, key);
      if (m.type !== winner.type) {
        warnings.push(
          `Key '${key}': ${shownType(m.type)} (node '${m.id}') differs from ${shownType(winner.type)} (node '${winner.id}') — using ${shownType(winner.type)}`,
        );
      }
    }
  }

  const mapId = (id: string): string => rename.get(id) ?? id;
  const emitted = new Set<string>();
  const nodes: DiagramNode[] = [];
  for (const n of model.nodes) {
    if (n.key === undefined) {
      nodes.push(n);
      continue;
    }
    if (emitted.has(n.key)) continue; // one composed node per key, at first position
    emitted.add(n.key);
    const w = winners.get(n.key);
    if (w !== undefined) nodes.push({ ...w, id: n.key });
  }

  const seenEdges = new Set<string>();
  const containment = model.containment
    .map((e) => ({ ...e, parent: mapId(e.parent), child: mapId(e.child) }))
    .filter((e) => {
      if (e.parent === e.child) return false; // a keyed container including itself flattens out
      const sig = `${e.parent}>${e.child}@${e.plane ?? ''}`;
      if (seenEdges.has(sig)) return false;
      seenEdges.add(sig);
      return true;
    });

  const relations = model.relations.map((r) => ({ ...r, from: mapId(r.from), to: mapId(r.to) }));

  const planes = model.planes.map((pl) => ({
    ...pl,
    ...(pl.hides !== undefined ? { hides: pl.hides.map(mapId) } : {}),
    ...(pl.hidesTree !== undefined ? { hidesTree: pl.hidesTree.map(mapId) } : {}),
  }));

  return { ...model, nodes, containment, relations, planes };
}
