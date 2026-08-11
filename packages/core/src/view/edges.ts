import { relationLabels } from '../labels';
import type { DiagramModel, DiagramRelation, Polarity } from '../types';
import type { ViewTree } from './tree';
import type { ViewEdge } from './types';

/** the shared polarity of a set of relations: that sign iff every relation is
 *  defined and agrees; otherwise undefined (any missing or disagreeing sign) */
function combinePolarity(rels: readonly DiagramRelation[]): Polarity | undefined {
  let result: Polarity | undefined;
  for (const r of rels) {
    if (r.polarity === undefined) return undefined;
    if (result === undefined) result = r.polarity;
    else if (result !== r.polarity) return undefined;
  }
  return result;
}

export function resolveEdges(
  m: DiagramModel,
  tree: ViewTree,
  activeLayers?: string[],
  includeBase = true,
): ViewEdge[] {
  const active = new Set(activeLayers ?? []);
  const tintOf = new Map(m.layers.map((l) => [l.id, l.tint]));
  const anchorFor = (id: string): string | undefined =>
    tree.byId.has(id) ? id : tree.anchorOf.get(id);

  interface Group {
    from: string;
    to: string;
    layer?: string;
    rels: DiagramRelation[];
  }
  const groups = new Map<string, Group>();

  for (const r of m.relations) {
    if (r.layer === undefined ? !includeBase : !active.has(r.layer)) continue;
    const from = anchorFor(r.from);
    const to = anchorFor(r.to);
    if (from === undefined || to === undefined) continue;
    const isOriginalSelfLoop = r.from === r.to;
    if (from === to && !(isOriginalSelfLoop && tree.byId.has(r.from))) continue;
    // Two arrows between the same pair pinned to *different* border sides are
    // visually distinct, so keep them apart (like opposite directions already
    // are). Pins only count when the relation attaches directly to the anchor —
    // a relation rolled up to a container was pinned on its child, not the
    // container, so it must still aggregate into the one boundary edge.
    const direct = from === r.from && to === r.to;
    const fromSide = direct ? r.style?.fromSide : undefined;
    const toSide = direct ? r.style?.toSide : undefined;
    const pinKey = fromSide !== undefined || toSide !== undefined ? `:${fromSide ?? ''}>${toSide ?? ''}` : '';
    const key = `${from}=>${to}:${r.layer ?? ''}${pinKey}`;
    const group = groups.get(key) ?? { from, to, layer: r.layer, rels: [] };
    group.rels.push(r);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, g]) => {
    const kinds = new Set(g.rels.map((r) => r.kind));
    const single = g.rels.length === 1 ? g.rels[0] : undefined;
    const edge: ViewEdge = {
      id: key,
      from: g.from,
      to: g.to,
      kind: kinds.size === 1 ? g.rels[0]!.kind : 'mixed',
      constituents: g.rels,
    };
    if (single !== undefined) {
      const labels = relationLabels(single);
      if (labels.length > 0) edge.labels = labels;
    } else {
      // Multi-relation aggregate: show the constituents' distinct labels rather
      // than a bare count, so a folded pair like reads/writes stays legible.
      // No labels anywhere → keep the count; > 3 distinct → first 3 plus +N.
      const seen = new Set<string>();
      const distinct: string[] = [];
      for (const r of g.rels) {
        for (const l of relationLabels(r)) {
          const t = l.text.trim();
          if (t !== '' && !seen.has(t)) {
            seen.add(t);
            distinct.push(t);
          }
        }
      }
      edge.label =
        distinct.length === 0
          ? String(g.rels.length)
          : distinct.length <= 3
            ? distinct.join(' / ')
            : `${distinct.slice(0, 3).join(' / ')} +${distinct.length - 3}`;
    }
    if (single?.style !== undefined) edge.style = single.style;
    const polarity = combinePolarity(g.rels);
    if (polarity !== undefined) edge.polarity = polarity;
    if (single?.delay !== undefined) edge.delay = single.delay;
    if (g.layer !== undefined) {
      edge.layer = g.layer;
      const tint = tintOf.get(g.layer);
      if (tint !== undefined) edge.tint = tint;
    }
    return edge;
  });
}
