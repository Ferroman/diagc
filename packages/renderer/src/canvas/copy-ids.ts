import type { Node } from '@xyflow/react';
import type { CompiledView, Point } from '@diagc/core/internal';

// A grouped plan draws one zone as several boxes, a copy per team lane, each
// under its own canvas id (CompiledView.copies maps it back). The host only
// ever hears model ids, so every path that reads a canvas id and reports it
// goes through here; ungrouped there is no map and each is the identity.
// Copy ids are looked up, never parsed.

type Copies = ReadonlyMap<string, string> | undefined;

/** The model id a canvas id draws: the zone a copy copies, else the id itself. */
export const modelIdOf = (copies: Copies, id: string): string => copies?.get(id) ?? id;

// Each map's inverse, built once: the map is the compiled view's, so it lives
// exactly as long as the view that drew the copies.
const inverses = new WeakMap<ReadonlyMap<string, string>, ReadonlyMap<string, readonly string[]>>();

function inverseOf(copies: ReadonlyMap<string, string>): ReadonlyMap<string, readonly string[]> {
  const hit = inverses.get(copies);
  if (hit !== undefined) return hit;
  const out = new Map<string, string[]>();
  for (const [copy, id] of copies) out.set(id, [...(out.get(id) ?? []), copy]);
  inverses.set(copies, out);
  return out;
}

/** Every canvas id drawing `modelId`, in lane order; the id itself when it has
 * no copies (an actor, an ungrouped view). */
export function copiesOf(copies: Copies, modelId: string): string[] {
  const all = copies === undefined ? undefined : inverseOf(copies).get(modelId);
  return all === undefined ? [modelId] : [...all];
}

/** `ids` with every copy of each beside it: a highlight lit for a zone lights
 * each box that draws it. */
export function widenToCopies(copies: Copies, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    if (copies !== undefined) for (const c of copiesOf(copies, id)) out.add(c);
  }
  return out;
}

/** The box that answers a host's request for `id` (a rename, a selection
 * claim): the node of that id, else the first lane copy drawing it — a zone
 * just added to a grouped plan lands as a copy. Undefined while neither is
 * laid out. */
export function boxOf(nodes: readonly Node[], id: string): string | undefined {
  return nodes.find((n) => n.id === id)?.id ?? nodes.find((n) => (n.data as { modelId?: string }).modelId === id)?.id;
}

const NO_ROWS: ReadonlySet<string> = new Set();

/** The lanes' top-level copies: the rows a grouped chart stacks for itself.
 * One zone has one saved y and several such rows, so none of them moves up or
 * down, and none reports a position. Empty ungrouped. */
export function laneRows(view: Pick<CompiledView, 'lanes'>): ReadonlySet<string> {
  return view.lanes === undefined ? NO_ROWS : new Set(view.lanes.flatMap((l) => l.zones));
}

type Delta = { dx: number; dy: number };

/**
 * A move report in model ids. A row keeps its displacement on x — a zone's
 * days — and loses its position: its y is the lane's, and writing it would
 * move the zone's own saved row (or give it one it never had). What is inside
 * a row reports its parent-relative place as it would ungrouped. Several
 * copies of one zone in one gesture are one move, the first copy's.
 */
export function modelMoves(
  copies: Copies,
  rows: ReadonlySet<string>,
  positions: Record<string, Point>,
  deltas: Record<string, Delta>,
): { positions: Record<string, Point>; deltas: Record<string, Delta> } {
  if (copies === undefined) return { positions, deltas };
  const outPositions: Record<string, Point> = {};
  const outDeltas: Record<string, Delta> = {};
  for (const [id, d] of Object.entries(deltas)) {
    const real = modelIdOf(copies, id);
    if (real in outDeltas) continue;
    const row = rows.has(id);
    outDeltas[real] = row ? { dx: d.dx, dy: 0 } : d;
    const p = positions[id];
    if (!row && p !== undefined) outPositions[real] = p;
  }
  return { positions: outPositions, deltas: outDeltas };
}

/** On-screen moves with every row held at its own y (see laneRows): a drag, a
 * nudge or an align on a row moves its days only. The same object back when
 * nothing is a row. */
export function pinRows(
  moves: Record<string, Point>,
  nodes: readonly Node[],
  rows: ReadonlySet<string>,
): Record<string, Point> {
  if (rows.size === 0 || !Object.keys(moves).some((id) => rows.has(id))) return moves;
  return Object.fromEntries(
    Object.entries(moves).map(([id, p]) => {
      const at = rows.has(id) ? nodes.find((n) => n.id === id)?.position : undefined;
      return [id, at === undefined ? p : { x: p.x, y: at.y }];
    }),
  );
}
