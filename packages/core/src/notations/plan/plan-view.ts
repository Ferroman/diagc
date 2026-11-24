import type { DiagramModel } from '../../types';
import { defined } from '../../util';
import type { CompiledView, PlanViewLane, ViewEdge, ViewNode } from '../../view/types';
import { planRoster } from './plan-roster';
import { isPlanActor, isPlanEvent, isPlanZone, planGraphCached, type PlanGraph, type PlanSpan } from './plan';
import { PLAN_UNASSIGNED, planTeams, planTint, type PlanLane, type PlanTintInput } from './teams';

/** A lane header's synthetic node type. Not a plan type a model ever holds:
 * the header exists only in a grouped view, like a drill view's stubs. */
export const PLAN_LANE_TYPE = 'plan-lane' as const;

/** The Unassigned roster card's synthetic node type: the card stands for work
 * no actor is placed on. Like a lane header it is the view's, never the model's. */
export const PLAN_UNASSIGNED_TYPE = 'plan-unassigned' as const;

/** Reserved prefix of every lane copy id (and lane header id). The lane key is
 * URI-encoded, so it carries no `:` and the id cannot be split two ways — but
 * nothing should split it: the view's `copies` maps a copy back. */
const COPY_PREFIX = '__lane__:';

/** The canvas id of `id`'s copy in `lane` (a lane key); `id` '' is the lane's
 * header. The one place a copy id is spelled. */
export function planCopyId(lane: string, id: string): string {
  return `${COPY_PREFIX}${encodeURIComponent(lane)}:${id}`;
}

export interface PlanViewOptions {
  /** group the chart into team lanes */
  grouped: boolean;
  /** hidden team ids, person ids and PLAN_UNASSIGNED */
  hidden: ReadonlySet<string>;
  /** the view is drilled into a zone: there are no lanes inside an opened
   * zone (it keeps the whole plan's coordinates), so grouping is ignored and
   * only hiding applies. Said by the caller — a scoped view does not say
   * reliably on its own which zone it was opened on. */
  opened?: boolean;
  /** the view carries its controls (the Unassigned card, which exists only to
   * be toggled). A still export (chromeless) sets false: the picture is the
   * plan and nothing else. Default true. */
  controls?: boolean;
}

/**
 * Rewrite a compiled plan view for team lanes and hiding. Pure; grouping and
 * hiding are view state, so this runs after `compileView`, never in the model.
 *
 * Hiding drops every zone `planTeams` hides, with its subtree, and every arrow
 * touching what was dropped — from `edges` and `layoutEdges` alike, since a
 * hidden row takes no room either. Grouped, each top-level zone becomes one
 * copy per lane it appears in (its own canvas id, the real node and fold
 * state), with a header node per lane, and arrows are copied per lane.
 */
export function planView(
  compiled: CompiledView,
  model: DiagramModel,
  plane: string | undefined,
  opts: PlanViewOptions,
): CompiledView {
  const group = opts.grouped && opts.opened !== true;
  const graph = planGraphCached(model, plane);
  const teams = planTeams(model, graph, opts.hidden);
  // the card is offered whenever there is unassigned work — hidden or not, so
  // it can be shown again; an opened zone has no use for it unless it is
  // hiding something (hiding still applies there). A plan with no person or
  // team has nothing to group or hide, so it has no card either.
  const card =
    opts.controls !== false &&
    teams.hasUnassigned &&
    (opts.opened !== true || opts.hidden.has(PLAN_UNASSIGNED)) &&
    model.nodes.some(isPlanActor);
  if (!group && opts.hidden.size === 0 && !card) return planRoster(compiled, model);
  const visible = withoutHidden(compiled, teams.hiddenZones, hiddenBelow(graph, teams.hiddenZones));
  const drawn = group ? groupedView(visible, { model, graph, teams }) : visible;
  const pinnedRows = group
    ? drawn.lanes?.flatMap((l) => l.zones)
    : opts.hidden.size > 0 && opts.opened !== true
      ? drawn.roots.filter((r) => isPlanZone(r.node) && !graph.parent.has(r.id)).map((r) => r.id)
      : undefined;
  // last: frames wrap whatever roots the rewrite above left, grouped or not
  return planRoster(
    {
      ...drawn,
      ...(card ? { roots: [...drawn.roots, unassignedCard()] } : {}),
      ...defined({ pinnedRows }),
    },
    model,
  );
}

/** The Unassigned roster card: a leaf root the roster places last. */
function unassignedCard(): ViewNode {
  return {
    id: PLAN_UNASSIGNED,
    node: { id: PLAN_UNASSIGNED, type: PLAN_UNASSIGNED_TYPE, name: 'Unassigned' },
    state: 'leaf',
    children: [],
    promoted: false,
    sharedMembers: [],
  };
}

/** Every id in a subtree, into `out`. */
function collect(vn: ViewNode, out: Set<string>): void {
  out.add(vn.id);
  for (const c of vn.children) collect(c, out);
}

/** The hidden zones and everything inside them on the plan plane — nested
 * zones, events, free-form children — as model ids. What a fold hides from the
 * compiled view still travels in its edges' constituents, so this is the set
 * those are checked against. */
function hiddenBelow(graph: PlanGraph, hiddenZones: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const add = (z: string): void => {
    if (out.has(z)) return;
    out.add(z);
    const c = graph.children.get(z);
    for (const id of [...(c?.events ?? []), ...(c?.others ?? [])]) out.add(id);
    for (const child of c?.zones ?? []) add(child);
  };
  for (const z of hiddenZones) add(z);
  return out;
}

function withoutHidden(view: CompiledView, hiddenZones: ReadonlySet<string>, gone: ReadonlySet<string>): CompiledView {
  if (hiddenZones.size === 0) return view;
  const dropped = new Set<string>();
  // A drill stub standing in for a hidden zone goes too: it would show the
  // zone, just off-frame. Only zones are ever hidden — never an actor.
  const hides = (vn: ViewNode): boolean =>
    hiddenZones.has(vn.id) || (vn.external !== undefined && hiddenZones.has(vn.external));
  const prune = (nodes: readonly ViewNode[]): ViewNode[] =>
    nodes.flatMap((vn) => {
      if (hides(vn)) {
        collect(vn, dropped);
        return [];
      }
      const children = prune(vn.children);
      // Untouched subtrees keep their identity, as the compiled view's own do.
      return children.length === vn.children.length && children.every((c, i) => c === vn.children[i])
        ? [vn]
        : [{ ...vn, children }];
    });
  const roots = prune(view.roots);
  // An arrow goes with a dropped end. Both ends visible is not enough: a folded
  // zone carries its rows' relations as its own, so a hidden row's relation is
  // taken out of the edge, and an edge left with none of its own goes too.
  const prunedEdges = (edges: readonly ViewEdge[]): ViewEdge[] =>
    edges.flatMap((e) => {
      if (dropped.has(e.from) || dropped.has(e.to)) return [];
      const constituents = e.constituents.filter((r) => !gone.has(r.from) && !gone.has(r.to));
      if (constituents.length === e.constituents.length) return [e];
      return constituents.length === 0 ? [] : [{ ...e, constituents }];
    });
  const anchorOf = new Map([...view.anchorOf].filter(([id, box]) => !gone.has(id) && !dropped.has(box)));
  const externals =
    view.externals === undefined ? undefined : new Map([...view.externals].filter(([stub]) => !dropped.has(stub)));
  return {
    ...view,
    roots,
    edges: prunedEdges(view.edges),
    layoutEdges: prunedEdges(view.layoutEdges),
    anchorOf,
    ...defined({ externals }),
  };
}

/** A copy's id, and the lane it is in; `lane` is absent for a node drawn once
 * (an actor, a top-level event), which stands for itself in every lane. */
interface Placed {
  lane?: string;
  id: string;
}

function laneHeader(lane: PlanLane): ViewNode {
  const id = planCopyId(lane.key, '');
  return {
    id,
    node: { id, type: PLAN_LANE_TYPE, name: lane.name, ...defined({ color: lane.color }) },
    state: 'leaf',
    children: [],
    promoted: false,
    sharedMembers: [],
  };
}

function groupedView(view: CompiledView, input: PlanTintInput): CompiledView {
  const { laneKeysOf, lanes } = input.teams;
  const inLane = (id: string, lane: string): boolean => laneKeysOf.get(id)?.includes(lane) === true;
  const copies = new Map<string, string>();
  const tints = new Map<string, readonly PlanSpan[]>();
  /** view id -> its copies, in lane order (lanes are walked in order) */
  const placed = new Map<string, Placed[]>();

  // In lane L a copy keeps the nested zones that appear in L themselves, and
  // every event and free-form child (they follow their parent). The real node
  // and the fold state are shared, so a fold keyed by zone id folds every copy.
  const copy = (vn: ViewNode, lane: string): ViewNode => {
    const id = planCopyId(lane, vn.id);
    copies.set(id, vn.id);
    placed.set(vn.id, [...(placed.get(vn.id) ?? []), { lane, id }]);
    if (isPlanZone(vn.node)) tints.set(id, planTint(input, vn.id, lane));
    const children = vn.children.filter((c) => !isPlanZone(c.node) || inLane(c.id, lane)).map((c) => copy(c, lane));
    return { ...vn, id, children };
  };

  const tops = view.roots.filter((r) => isPlanZone(r.node));
  const rest = view.roots.filter((r) => !isPlanZone(r.node));
  const laneRoots: ViewNode[] = [];
  const laneList: PlanViewLane[] = [];
  for (const lane of lanes) {
    const zones = tops.filter((z) => inLane(z.id, lane.key)).map((z) => copy(z, lane.key));
    if (zones.length === 0) continue; // an empty lane is not drawn
    const header = laneHeader(lane);
    laneRoots.push(header, ...zones);
    laneList.push({ id: header.id, lane, zones: zones.map((z) => z.id) });
  }

  // An arrow is drawn in every lane holding a copy of both ends; when none
  // does, once, between the ends' first copies (across lanes).
  const rewrite = (edges: readonly ViewEdge[]): ViewEdge[] =>
    edges.flatMap((e) => {
      const from = placed.get(e.from);
      const to = placed.get(e.to);
      if (from === undefined && to === undefined) return [e];
      const ends = { from: from ?? [{ id: e.from }], to: to ?? [{ id: e.to }] };
      const shared = ends.from.flatMap((f) => {
        const t = f.lane === undefined ? undefined : ends.to.find((c) => c.lane === f.lane);
        return t === undefined ? [] : [{ lane: f.lane!, from: f.id, to: t.id }];
      });
      if (shared.length === 0) return [{ ...e, from: ends.from[0]!.id, to: ends.to[0]!.id }];
      return shared.map((s) => {
        const id = planCopyId(s.lane, e.id);
        copies.set(id, e.id);
        return { ...e, id, from: s.from, to: s.to };
      });
    });

  return {
    ...view,
    roots: [...rest, ...laneRoots],
    edges: rewrite(view.edges),
    layoutEdges: rewrite(view.layoutEdges),
    copies,
    lanes: laneList,
    tints,
    topEvents: rest.filter((r) => isPlanEvent(r.node)).map((r) => r.id),
  };
}
