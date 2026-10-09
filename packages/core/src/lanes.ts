import type { DiagramModel } from './types';
import { containmentOn, containmentPlaneOf } from './planes';
import { ACTIVITY_LANE_TYPE } from './activity/activity';

/** Past this many lanes, trying every order is too slow to do on a click. */
const MAX_PERMUTED_LANES = 8;

/**
 * The order of an activity frame's lanes that keeps its links shortest: each
 * link between two lanes costs the number of lane boundaries it crosses, and the
 * order with the lowest total wins. Every link that crosses a lane it does not
 * belong to is one more line drawn through someone else's band, so this is the
 * order a reader can follow with the least back and forth.
 *
 * Exhaustive up to MAX_PERMUTED_LANES lanes (8! = 40320 orders, a few ms);
 * beyond that the current order comes back unchanged. Ties keep the current
 * order, so a frame already at its best never shuffles. Lane order carries
 * meaning (who acts first, who is upstream), which is why this is a suggestion
 * the author applies, never something the layout does on its own.
 *
 * Returns the lane ids in the suggested order, on the given plane (the default
 * one when absent); members are counted through regions and any other nesting.
 */
export function bestLaneOrder(model: DiagramModel, frameId: string, plane?: string): string[] {
  const edges = containmentOn(model, containmentPlaneOf(model, plane));
  const typeOf = new Map(model.nodes.map((n) => [n.id, n.type]));
  const lanes = edges
    .filter((e) => e.parent === frameId && typeOf.get(e.child) === ACTIVITY_LANE_TYPE)
    .map((e) => e.child);
  if (lanes.length < 3 || lanes.length > MAX_PERMUTED_LANES) return lanes;

  // every node under each lane, at any depth (first claim wins on a DAG)
  const laneOf = new Map<string, number>();
  const kids = new Map<string, string[]>();
  for (const e of edges) kids.set(e.parent, [...(kids.get(e.parent) ?? []), e.child]);
  lanes.forEach((lane, i) => {
    const stack = [...(kids.get(lane) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (laneOf.has(id)) continue;
      laneOf.set(id, i);
      stack.push(...(kids.get(id) ?? []));
    }
  });

  // links between two different lanes, as a weight per lane pair
  const weight = lanes.map(() => lanes.map(() => 0));
  for (const r of model.relations) {
    const a = laneOf.get(r.from);
    const b = laneOf.get(r.to);
    if (a === undefined || b === undefined || a === b) continue;
    weight[a]![b]! += 1;
    weight[b]![a]! += 1;
  }

  const n = lanes.length;
  const costOf = (order: readonly number[]): number => {
    const pos = new Array<number>(n);
    order.forEach((lane, p) => (pos[lane] = p));
    let c = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) c += weight[i]![j]! * Math.abs(pos[i]! - pos[j]!);
    return c;
  };

  // Heap's algorithm would be faster but visits orders in no useful sequence;
  // lexicographic order starts at the current one, so a strict `<` keeps it on a tie.
  let best = lanes.map((_, i) => i);
  let bestCost = costOf(best);
  const order = [...best];
  const next = (): boolean => {
    let i = n - 2;
    while (i >= 0 && order[i]! > order[i + 1]!) i--;
    if (i < 0) return false;
    let j = n - 1;
    while (order[j]! < order[i]!) j--;
    [order[i], order[j]] = [order[j]!, order[i]!];
    order.splice(i + 1, n - i - 1, ...order.slice(i + 1).reverse());
    return true;
  };
  while (next()) {
    const c = costOf(order);
    if (c < bestCost) {
      bestCost = c;
      best = [...order];
    }
  }
  return best.map((i) => lanes[i]!);
}
