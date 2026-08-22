import { relationLabels } from '../labels';
import { relationLayer } from './layers';
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

/**
 * Width budget, in characters, for the joined labels of an AGGREGATE edge (one
 * arrow standing for several relations). Above it the edge reports how many
 * relations it rolled up instead of naming them.
 *
 * The budget is on the joined text, not on a label count, because what makes a
 * folded view unreadable is text WIDTH on many edges at once: measured on
 * EngageRocket's platform-c4 landscape (17 folded systems, ~400 relations), the
 * old "first three joined, then +N" policy put 40-70 characters on hundreds of
 * arrows. 32 characters is about two ordinary labels ("reads / writes",
 * "publishes / consumes") — the case where naming both is genuinely more useful
 * than counting them. Nothing is lost above it: the constituents are one fold, or
 * one click on the edge, away.
 */
const AGG_LABEL_BUDGET = 32;

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
  // Effective layer: the relation's own, else what `layerRules` assigns.
  const layerOf = (r: DiagramRelation): string | undefined => relationLayer(m, r);

  interface Group {
    from: string;
    to: string;
    layer?: string;
    rels: DiagramRelation[];
  }
  const groups = new Map<string, Group>();

  for (const r of m.relations) {
    const layer = layerOf(r);
    if (layer === undefined ? !includeBase : !active.has(layer)) continue;
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
    const key = `${from}=>${to}:${layer ?? ''}${pinKey}`;
    const group = groups.get(key) ?? { from, to, layer, rels: [] };
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
      // Multi-relation aggregate: name the constituents while that is still
      // cheaper to read than counting them, and count them once it is not.
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
      const joined = distinct.join(' / ');
      // ONE distinct label is the edge's own meaning however long it is (the
      // renderer ellipsises it), so it always survives; several only earn their
      // width while the join stays inside AGG_LABEL_BUDGET. An aggregate here
      // always holds at least two relations, so the plural is always right.
      edge.label =
        distinct.length === 1 || (distinct.length > 1 && joined.length <= AGG_LABEL_BUDGET)
          ? joined
          : `${g.rels.length} relations`;
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
