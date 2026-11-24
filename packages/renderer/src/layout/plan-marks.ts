import {
  PLAN_INTERRUPTS,
  isPlanRole,
  periodSpanOf,
  planPeriodsOf,
  spanOf,
  type DiagramModel,
  type PlanGraph,
  type PlanSpan,
} from '@diagc/core/internal';
import type { LabelSide, NodeStripe } from '../notations';
import { ZONE_TEXT, nameRowWidth, planChips, planGraphCached } from './plan-layout';

// What a plan bar wears beyond its box: the side a name too long for it hangs
// on, and the stretches a period hatches over it. Derived per model and plane,
// like the role chips (plan-layout.ts's planChips), and handed to the canvas
// through the notation's node hooks.

// keyed by plane and px per day: a stretched bar may fit the name it did not
type ByScale<T> = Map<string, ReadonlyMap<string, T>>;
const scaleKey = (plane: string | undefined, dayWidth: number): string => `${plane ?? ''}\u0000${String(dayWidth)}`;
const sidesCache = new WeakMap<DiagramModel, ByScale<LabelSide>>();

/**
 * The childless bars too short for their name, and the side each one's name is
 * drawn on instead (the notation's `labelSides`). A bar's width is its dates —
 * a one-day bar is one day wide — so it never grows to fit its name the way a box
 * would: a wider box would end on a later day than the plan says, and stick
 * out of the zone it belongs to. The name goes beside the bar, as Gantt charts
 * do: to the right, or to the left where the right would cross the wall of the
 * zone the bar is in, and failing both wherever there is more room. A zone with
 * rows gets a side as well: open, its name titles its band (`titleBand`) and
 * the canvas ignores the side; folded, it is a bar like any other. A
 * dependency arrow curves out of a bar's end and into a bar's start, so a bar
 * only an arrow leaves hangs its name on its left and one only an arrow enters
 * on its right, whatever the walls: past its zone's wall the name lies over
 * open canvas, since no other row shares its height. A zone whose rows an
 * arrow leaves or enters counts too: folded, it stands in for them.
 */
/** The side an arrow leaves free for a bar's name — left of a bar only an
 * arrow leaves, right of one only an arrow enters — while the chart has room
 * for it there, else the other side if that has room; undefined when no arrow
 * decides (none, or both ways) or neither side fits, and the walls decide. */
function arrowSide(
  { leaves, enters, dayWidth }: { leaves: boolean; enters: boolean; dayWidth: number },
  span: PlanSpan,
  range: PlanSpan | undefined,
  need: number,
): LabelSide | undefined {
  if (leaves === enters || range === undefined) return undefined;
  const room = {
    left: (span.start - range.start) * dayWidth,
    right: (range.end - span.end) * dayWidth,
  };
  const free: LabelSide = leaves ? 'left' : 'right';
  const other: LabelSide = leaves ? 'right' : 'left';
  return room[free] >= need ? free : room[other] >= need ? other : undefined;
}

export function planLabelSides(
  model: DiagramModel,
  plane: string | undefined,
  dayWidth: number,
): ReadonlyMap<string, LabelSide> {
  let byScale = sidesCache.get(model);
  if (byScale === undefined) {
    byScale = new Map();
    sidesCache.set(model, byScale);
  }
  const key = scaleKey(plane, dayWidth);
  const cached = byScale.get(key);
  if (cached !== undefined) return cached;
  const DAY = dayWidth;
  const { PAD_X, BORDER, OUTSIDE_GAP } = ZONE_TEXT;
  const graph = planGraphCached(model, plane);
  const chips = planChips(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const leaves = arrowEnds(model, graph, 'from');
  const enters = arrowEnds(model, graph, 'to');
  const sides = new Map<string, LabelSide>();
  for (const id of graph.zones) {
    const node = byId.get(id)!;
    const span = spanOf(node);
    if (span === undefined) continue;
    const row = nameRowWidth(node.name, chips.get(id));
    if (row + 2 * PAD_X + BORDER <= (span.end - span.start + 1) * DAY) continue;
    const need = row + OUTSIDE_GAP + PAD_X;
    const ends = { leaves: leaves.has(id), enters: enters.has(id), dayWidth };
    const onChart = arrowSide(ends, span, graph.range, need);
    if (onChart !== undefined) {
      sides.set(id, onChart);
      continue;
    }
    const parentId = graph.parent.get(id);
    const parentSpan = parentId !== undefined ? spanOf(byId.get(parentId)!) : undefined;
    if (parentSpan === undefined) {
      sides.set(id, 'right');
      continue;
    }
    const right = (parentSpan.end - span.end) * DAY;
    const left = (span.start - parentSpan.start) * DAY;
    sides.set(id, right >= need ? 'right' : left >= need ? 'left' : right >= left ? 'right' : 'left');
  }
  byScale.set(key, sides);
  return sides;
}
/** The zones a dependency arrow leaves (`from`) or enters (`to`): that end of
 * any relation that is not a role, and each zone holding it, up to — not
 * including — one that also holds the other end (folded, the zone stands in for
 * the row inside it; core's `liftRolledUp` draws the arrow from it then). */
function arrowEnds(model: DiagramModel, graph: PlanGraph, end: 'from' | 'to'): Set<string> {
  const ends = new Set<string>();
  const upFrom = (id: string): string[] => {
    const chain: string[] = [];
    for (let cur: string | undefined = id; cur !== undefined; cur = graph.parent.get(cur)) chain.push(cur);
    return chain;
  };
  for (const r of model.relations) {
    if (isPlanRole(r.kind) || r.kind === PLAN_INTERRUPTS) continue;
    const holdsOther = new Set(upFrom(end === 'from' ? r.to : r.from));
    for (const id of upFrom(r[end])) {
      if (holdsOther.has(id)) break;
      ends.add(id);
    }
  }
  return ends;
}

const stripesCache = new WeakMap<DiagramModel, ByScale<NodeStripe[]>>();

/**
 * Each interrupted zone's stripes: the days of each period that interrupts it
 * which fall inside its own span, in px from the bar's left edge (a bar's x is
 * its start day, so the offset is the same folded, open, dragged or opened on
 * its own). A period that does not overlap the bar draws nothing on it; a row
 * inside an interrupted zone is striped only if it is named too.
 */
export function planStripes(
  model: DiagramModel,
  plane: string | undefined,
  dayWidth: number,
): ReadonlyMap<string, NodeStripe[]> {
  let byScale = stripesCache.get(model);
  if (byScale === undefined) {
    byScale = new Map();
    stripesCache.set(model, byScale);
  }
  const key = scaleKey(plane, dayWidth);
  const cached = byScale.get(key);
  if (cached !== undefined) return cached;
  const DAY = dayWidth;
  const graph = planGraphCached(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const stripes = new Map<string, NodeStripe[]>();
  for (const id of graph.zones) {
    const bar = spanOf(byId.get(id)!);
    if (bar === undefined) continue;
    const own: NodeStripe[] = [];
    for (const pid of planPeriodsOf(model, id)) {
      const period = byId.get(pid);
      const days = period === undefined ? undefined : periodSpanOf(period);
      if (period === undefined || days === undefined) continue;
      const start = Math.max(days.start, bar.start);
      const end = Math.min(days.end, bar.end);
      if (end < start) continue;
      own.push({
        x: (start - bar.start) * DAY,
        width: (end - start + 1) * DAY,
        title: period.name,
        ...(period.color !== undefined ? { color: period.color } : {}),
      });
    }
    if (own.length > 0) stripes.set(id, own);
  }
  byScale.set(key, stripes);
  return stripes;
}
