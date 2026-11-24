import { relationLabels } from '../labels';
import { relationLayer } from './layers';
import type { DiagramModel, DiagramRelation, Polarity, RelationStyle } from '../types';
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
 * a production C4 landscape (17 folded systems, ~400 relations), the
 * old "first three joined, then +N" policy put 40-70 characters on hundreds of
 * arrows. 32 characters is about two ordinary labels ("reads / writes",
 * "publishes / consumes") — the case where naming both is genuinely more useful
 * than counting them. Nothing is lost above it: the constituents are one fold, or
 * one click on the edge, away.
 */
const AGG_LABEL_BUDGET = 32;

/** Relations that draw as one arrow: the same two anchors, layer and fixed sides. */
interface Group {
  from: string;
  to: string;
  layer?: string;
  rels: DiagramRelation[];
}

export interface ResolveEdgesOptions {
  activeLayers?: string[];
  /** draw the relations no layer claims; default true */
  includeBase?: boolean;
  /** a relation drawn end to end is its own edge (state-machine planes) */
  separateDirect?: boolean;
  /** a relation rolled up at either end lifts both ends to the rows side by
   *  side under their common host (plan planes): see `liftEnds` */
  liftRolledUp?: boolean;
}

export function resolveEdges(model: DiagramModel, tree: ViewTree, opts: ResolveEdgesOptions = {}): ViewEdge[] {
  const tintOf = new Map(model.layers.map((l) => [l.id, l.tint]));
  const groups = groupRelations(model, tree, {
    active: new Set(opts.activeLayers ?? []),
    includeBase: opts.includeBase ?? true,
    separateDirect: opts.separateDirect ?? false,
    liftRolledUp: opts.liftRolledUp ?? false,
  });
  // A transition's label already uses ' / ' before its effect, so on a state-machine
  // plane two merged transitions `pay` and `ship` must not read as `pay / ship`.
  const separator = opts.separateDirect === true ? '; ' : ' / ';
  return [...groups.entries()].map(([key, g]) => toViewEdge(key, g, tintOf, separator));
}

function groupRelations(
  model: DiagramModel,
  tree: ViewTree,
  {
    active,
    includeBase,
    separateDirect,
    liftRolledUp,
  }: { active: ReadonlySet<string>; includeBase: boolean; separateDirect: boolean; liftRolledUp: boolean },
): Map<string, Group> {
  const anchorFor = (id: string): string | undefined => (tree.byId.has(id) ? id : tree.anchorOf.get(id));
  const groups = new Map<string, Group>();
  for (const r of model.relations) {
    // Effective layer: the relation's own, else what `layerRules` assigns.
    const layer = relationLayer(model, r);
    if (layer === undefined ? !includeBase : !active.has(layer)) continue;
    const anchors = endsOf(r, anchorFor, liftRolledUp ? tree.hostOf : undefined);
    if (anchors === undefined) continue;
    const [from, to] = anchors;
    const isOriginalSelfLoop = r.from === r.to;
    if (from === to && !(isOriginalSelfLoop && tree.byId.has(r.from))) continue;
    // Folding exists to merge, so only a relation drawn end to end stays apart:
    // one rolled up to a folded container still joins that container's edge.
    const apart = separateDirect && attachesDirectly(r, from, to) ? `|${r.id}` : '';
    const key = `${from}=>${to}:${layer ?? ''}${fixedSidesKey(r, from, to)}${apart}`;
    const group = groups.get(key) ?? { from, to, layer, rels: [] };
    group.rels.push(r);
    groups.set(key, group);
  }
  return groups;
}

/** The two visible ends `r` draws between; undefined when either is not shown. */
function endsOf(
  r: DiagramRelation,
  anchorFor: (id: string) => string | undefined,
  hostOf: ReadonlyMap<string, string | null> | undefined,
): [string, string] | undefined {
  const from = anchorFor(r.from);
  const to = anchorFor(r.to);
  if (from === undefined || to === undefined) return undefined;
  if (hostOf === undefined || attachesDirectly(r, from, to)) return [from, to];
  return liftEnds(from, to, hostOf);
}

/**
 * Both ends of a rolled-up relation, lifted to the two rows side by side under
 * their nearest common host. A plan's dependency into a folded zone says the
 * zone waits on something; drawn from each open row that leads into it, the
 * fold would hide one end and leave the other's detail standing, as several
 * arrows into one bar. Lifted, the folded zone is joined by the zone beside it
 * — one arrow, zone to zone, as a Gantt chart summarises — and folding either
 * side reads the same. An end that is itself that common host (a zone to a row
 * inside its own folded child) keeps its place.
 */
function liftEnds(from: string, to: string, hostOf: ReadonlyMap<string, string | null>): [string, string] {
  const chainOf = (id: string): string[] => {
    const chain = [id];
    for (let cur = hostOf.get(id) ?? null; cur !== null; cur = hostOf.get(cur) ?? null) chain.push(cur);
    return chain;
  };
  const up = chainOf(from);
  const down = chainOf(to);
  const shared = new Set(down);
  const common = up.find((id) => shared.has(id));
  const below = (chain: string[]): string => {
    const i = common === undefined ? chain.length : chain.indexOf(common);
    return chain[Math.max(i - 1, 0)]!;
  };
  return [below(up), below(down)];
}

// Two arrows between the same pair fixed to *different* border sides are
// visually distinct, so keep them apart (like opposite directions already
// are). Fixed sides only count when the relation attaches directly to the
// anchor — a relation rolled up to a container had its side fixed on its child,
// not the container, so it must still aggregate into the one boundary edge.
function fixedSidesKey(r: DiagramRelation, from: string, to: string): string {
  const direct = attachesDirectly(r, from, to);
  const fromSide = direct ? r.style?.fromSide : undefined;
  const toSide = direct ? r.style?.toSide : undefined;
  return fromSide !== undefined || toSide !== undefined ? `:${fromSide ?? ''}>${toSide ?? ''}` : '';
}

/** Whether `r` is drawn end to end between `from` and `to`, rather than rolled up
 * to a container at either end. */
export function attachesDirectly(r: DiagramRelation, from: string, to: string): boolean {
  return from === r.from && to === r.to;
}

/** The style a relation's drawn edge carries: all of it when the relation is drawn
 * end to end; without its fixed sides when it was rolled up, because those were
 * fixed on its own nodes, not on the container that now stands in for them. */
function edgeStyle(r: DiagramRelation, from: string, to: string): RelationStyle | undefined {
  if (r.style === undefined || attachesDirectly(r, from, to)) return r.style;
  const { fromSide: _fromSide, toSide: _toSide, ...rest } = r.style;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** An aggregate's style: each property every constituent's drawn style sets to the
 * same value, like the shared polarity. Two dashed grey peerings stay one dashed
 * grey line; a property one relation leaves unset falls back to the kind's look,
 * as it would on that relation's own edge. */
function sharedStyle(rels: readonly DiagramRelation[], from: string, to: string): RelationStyle | undefined {
  const [first, ...rest] = rels.map((r) => edgeStyle(r, from, to));
  if (first === undefined) return undefined;
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(first)) {
    if (rest.every((s) => s?.[key as keyof RelationStyle] === value)) shared[key] = value;
  }
  return Object.keys(shared).length > 0 ? (shared as RelationStyle) : undefined;
}

function toViewEdge(
  key: string,
  g: Group,
  tintOf: ReadonlyMap<string, string | undefined>,
  separator: string,
): ViewEdge {
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
    edge.label = aggregateLabel(g.rels, separator);
  }
  const style = single !== undefined ? edgeStyle(single, g.from, g.to) : sharedStyle(g.rels, g.from, g.to);
  if (style !== undefined) edge.style = style;
  const polarity = combinePolarity(g.rels);
  if (polarity !== undefined) edge.polarity = polarity;
  if (single?.delay !== undefined) edge.delay = single.delay;
  if (g.layer !== undefined) {
    edge.layer = g.layer;
    const tint = tintOf.get(g.layer);
    if (tint !== undefined) edge.tint = tint;
  }
  return edge;
}

/** A multi-relation aggregate's label: the constituents' names while that is
 * still cheaper to read than counting them, and the count once it is not. */
function aggregateLabel(rels: readonly DiagramRelation[], separator: string): string {
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const r of rels) {
    for (const l of relationLabels(r)) {
      const t = l.text.trim();
      if (t !== '' && !seen.has(t)) {
        seen.add(t);
        distinct.push(t);
      }
    }
  }
  const joined = distinct.join(separator);
  // ONE distinct label is the edge's own meaning however long it is (the
  // renderer ellipsises it), so it always survives; several only earn their
  // width while the join stays inside AGG_LABEL_BUDGET. An aggregate here
  // always holds at least two relations, so the plural is always right.
  return distinct.length === 1 || (distinct.length > 1 && joined.length <= AGG_LABEL_BUDGET)
    ? joined
    : `${rels.length} relations`;
}

/** The one relation behind a drawn edge; undefined when the edge stands for several,
 * which is why an aggregate carries no per-relation labels or note. */
export function soleRelation(edge: ViewEdge): DiagramRelation | undefined {
  return edge.constituents.length === 1 ? edge.constituents[0] : undefined;
}
