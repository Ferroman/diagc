import type { DiagramModel } from './types';

/** The notation id a plane (or the model) declares to be drawn as a consequence tree. */
export const SECOND_ORDER_NOTATION = 'second-order' as const;
export const SO_DECISION_TYPE = 'so-decision' as const;
/** Valence is a TYPE VARIANT, not a field: a registry and palette entry, no
 * schema change — the same trick C4 uses for its `-external` stencils. */
export const SO_CONSEQUENCE_TYPES = ['so-consequence-positive', 'so-consequence-negative', 'so-consequence-neutral'] as const;
/** The kind the builder and the studio create. The derivation below does NOT
 * filter by it (see consequenceOrders). */
export const SO_LEADS_TO_KIND = 'leads-to' as const;

/** good, bad, neutral */
export type Valence = '+' | '-' | '0';

const TYPE_OF: Record<Valence, (typeof SO_CONSEQUENCE_TYPES)[number]> = {
  '+': 'so-consequence-positive',
  '-': 'so-consequence-negative',
  '0': 'so-consequence-neutral',
};

export const consequenceTypeOf = (v: Valence): string => TYPE_OF[v];

export function valenceOf(type: string | undefined): Valence | undefined {
  return (Object.keys(TYPE_OF) as Valence[]).find((v) => TYPE_OF[v] === type);
}

export const isSecondOrderNode = (n: { type?: string }): boolean =>
  n.type === SO_DECISION_TYPE || valenceOf(n.type) !== undefined;

export interface ConsequenceOrders {
  /** node id → order. A decision nothing leads to is 0. */
  orders: ReadonlyMap<string, number>;
  /** ids ON a loop, in declaration order, when there is one — `orders` is then empty */
  cycle?: string[];
  /** consequences no decision leads to, in declaration order — they get no order */
  unreachable: string[];
}

/**
 * Which band each decision and consequence belongs to. This is the ONE place
 * that answers it, so the layout's partitions, the band overlay, the studio
 * panel and validation cannot disagree.
 *
 * The order is the LONGEST path from a decision: every cause then sits in an
 * earlier band than its effect, and no arrow ever runs inside a band — which is
 * also exactly what lets elk take the orders as layer partitions.
 *
 * Reads the MODEL's relations, never drawn edges: toggling a layer must not
 * move a box. Any kind of relation between two second-order nodes counts, so
 * restyling an arrow can never drop a node out of its band. Never throws.
 */
export function consequenceOrders(model: DiagramModel): ConsequenceOrders {
  const nodes = model.nodes.filter(isSecondOrderNode);
  const ids = new Set(nodes.map((n) => n.id));
  const next = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const prev = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const seen = new Set<string>();
  for (const r of model.relations) {
    if (r.from === r.to || !ids.has(r.from) || !ids.has(r.to)) continue;
    const pair = `${r.from}\u0000${r.to}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    next.get(r.from)!.push(r.to);
    prev.get(r.to)!.push(r.from);
  }

  // Kahn: whatever is never released sits on a loop or behind one.
  const waiting = new Map(nodes.map((n) => [n.id, prev.get(n.id)!.length]));
  const topo: string[] = nodes.filter((n) => waiting.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < topo.length; i++) {
    for (const to of next.get(topo[i]!)!) {
      const left = waiting.get(to)! - 1;
      waiting.set(to, left);
      if (left === 0) topo.push(to);
    }
  }
  if (topo.length < nodes.length) {
    // Peel what merely hangs OFF the loop (nothing stuck follows from it), so
    // the report names the loop itself.
    const released = new Set(topo);
    const stuck = new Set(nodes.map((n) => n.id).filter((id) => !released.has(id)));
    for (let peeled = true; peeled; ) {
      peeled = false;
      for (const id of stuck) {
        if (next.get(id)!.some((to) => stuck.has(to))) continue;
        stuck.delete(id);
        peeled = true;
      }
    }
    return { orders: new Map(), cycle: nodes.map((n) => n.id).filter((id) => stuck.has(id)), unreachable: [] };
  }

  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const orders = new Map<string, number>();
  for (const id of topo) {
    const causes = prev.get(id)!.map((p) => orders.get(p)).filter((o): o is number => o !== undefined);
    if (causes.length > 0) orders.set(id, Math.max(...causes) + 1);
    else if (typeOf.get(id) === SO_DECISION_TYPE) orders.set(id, 0);
  }
  return { orders, unreachable: nodes.map((n) => n.id).filter((id) => !orders.has(id)) };
}
