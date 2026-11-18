import {
  isStateMachineType,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_ZONE_TYPE,
  type CompiledView,
  type DiagramModel,
  type LayoutDirection,
  type ViewEdge,
  type ViewNode,
} from '@diagc/core/internal';
import { containmentRank } from './activity-frame';
import { containerPad, ORDER_LINK_KIND } from './layout-graph';

interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StateMachineLayoutOptions {
  /** the plane the view was compiled for; its containment orders the regions */
  plane?: string;
  /** the flow the layout ran in: regions stack across it */
  direction: LayoutDirection;
}

/** the edge of a region it shares with the region before it, where the dashed line goes */
export type RegionSeparator = 'top' | 'left';

/** Which coordinate runs along the flow and which across it. */
interface Axes {
  along: 'x' | 'y';
  across: 'x' | 'y';
  alongSize: 'width' | 'height';
  acrossSize: 'width' | 'height';
}

const ACROSS_Y: Axes = { along: 'x', across: 'y', alongSize: 'width', acrossSize: 'height' };
const ACROSS_X: Axes = { along: 'y', across: 'x', alongSize: 'height', acrossSize: 'width' };

/** RIGHT/LEFT flows run along x, so regions stack one above the other; DOWN/UP side by side */
const axesOf = (direction: LayoutDirection): Axes =>
  direction === 'RIGHT' || direction === 'LEFT' ? ACROSS_Y : ACROSS_X;

// elk's coordinates are fractional; a hair of difference is not a change
const EPSILON = 0.5;

/** the room a widened zone leaves beside a sibling that is not a zone */
const ZONE_CLEARANCE = 12;

const NO_SEPARATORS: ReadonlyMap<string, RegionSeparator> = new Map();

const hasStateMachine = (model: DiagramModel) => model.nodes.some((n) => isStateMachineType(n.type));

/** an open state or machine: the boxes that hold regions and carry entry and exit points */
const isOpenComposite = (n: ViewNode) =>
  n.state === 'expanded' && (n.node.type === SM_STATE_TYPE || n.node.type === SM_MACHINE_TYPE);

const isBorderPoint = (n: ViewNode) => n.node.type === SM_ENTRY_TYPE || n.node.type === SM_EXIT_TYPE;

/** an open composite's regions on show, in containment order (see containmentRank) */
function regionsOf(n: ViewNode, rankIn: (parent: string, child: string) => number): ViewNode[] {
  if (!isOpenComposite(n)) return [];
  return n.children
    .filter((c) => c.node.type === SM_REGION_TYPE)
    .sort((a, b) => rankIn(n.id, a.id) - rankIn(n.id, b.id));
}

/** a machine's zones on show, in containment order (see containmentRank) */
function zonesOf(n: ViewNode, rankIn: (parent: string, child: string) => number): ViewNode[] {
  if (n.state !== 'expanded' || n.node.type !== SM_MACHINE_TYPE) return [];
  return n.children.filter((c) => c.node.type === SM_ZONE_TYPE).sort((a, b) => rankIn(n.id, a.id) - rankIn(n.id, b.id));
}

/**
 * The view with a machine's zones held in their declared order, for the layout
 * run: one layout-only link from each zone to the next (ORDER_LINK_KIND), so the
 * zones follow each other along the flow whatever the transitions between them
 * suggest, and elk still routes every transition. The same object back when no
 * machine has two zones (it is a layout cache key).
 */
export function withZoneOrder(view: CompiledView, model: DiagramModel, plane: string | undefined): CompiledView {
  if (!model.nodes.some((n) => n.type === SM_ZONE_TYPE)) return view;
  const rankIn = containmentRank(model, plane);
  const links: ViewEdge[] = [];
  const visit = (n: ViewNode): void => {
    const zones = zonesOf(n, rankIn);
    for (let i = 0; i + 1 < zones.length; i++) {
      const from = zones[i]!.id;
      const to = zones[i + 1]!.id;
      links.push({ id: `${ORDER_LINK_KIND}:${from}:${to}`, from, to, kind: ORDER_LINK_KIND, constituents: [] });
    }
    n.children.forEach(visit);
  };
  view.roots.forEach(visit);
  return links.length === 0 ? view : { ...view, layoutEdges: [...view.layoutEdges, ...links] };
}

/** Copy-on-write over the geometry: the input map back while nothing changed. */
class Draft<T extends Geo> {
  private out: Map<string, T> | undefined;
  /** ids whose box this pass moved or resized: their parents may need to grow */
  readonly touched = new Set<string>();

  constructor(private readonly geometry: ReadonlyMap<string, T>) {}

  get(id: string): T | undefined {
    return (this.out ?? this.geometry).get(id);
  }

  set(id: string, box: Geo): void {
    const g = this.get(id);
    if (g === undefined) return;
    const same = (['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(g[k] - box[k]) < EPSILON);
    if (same) return;
    this.out ??= new Map(this.geometry);
    this.out.set(id, { ...g, ...box });
    this.touched.add(id);
  }

  result(): ReadonlyMap<string, T> {
    return this.out ?? this.geometry;
  }
}

/** a pair of values, one along the flow and one across it */
interface Span {
  along: number;
  across: number;
}

/** a box from its along/across corner and extents */
function boxOf(axes: Axes, at: Span, length: Span): Geo {
  const box = { x: 0, y: 0, width: 0, height: 0 };
  box[axes.along] = at.along;
  box[axes.across] = at.across;
  box[axes.alongSize] = length.along;
  box[axes.acrossSize] = length.across;
  return box;
}

/**
 * Stack the regions across the flow from the composite's padding corner, edge
 * to edge. They share one along-flow extent — the largest among them, or the
 * composite's inner one when that is larger — and the last one runs on to the
 * inner far side, so together they fill the box and every dashed line spans it.
 * Each region's content is parent-relative, so it moves with its region.
 */
function stackRegions<T extends Geo>(draft: Draft<T>, parent: ViewNode, regions: readonly ViewNode[], axes: Axes) {
  const box = draft.get(parent.id);
  const laid = regions.map((r) => draft.get(r.id));
  if (box === undefined || laid.some((g) => g === undefined)) return;
  const pad = containerPad(parent);
  const alongStart = axes.along === 'x' ? pad.left : pad.top;
  const alongEnd = axes.along === 'x' ? pad.right : pad.bottom;
  const acrossStart = axes.across === 'x' ? pad.left : pad.top;
  const acrossEnd = axes.across === 'x' ? pad.right : pad.bottom;
  const alongLen = Math.max(box[axes.alongSize] - alongStart - alongEnd, ...laid.map((g) => g![axes.alongSize]));
  let cursor = acrossStart;
  regions.forEach((r, i) => {
    const own = laid[i]![axes.acrossSize];
    const acrossLen = i === regions.length - 1 ? Math.max(own, box[axes.acrossSize] - acrossEnd - cursor) : own;
    draft.set(r.id, boxOf(axes, { along: alongStart, across: cursor }, { along: alongLen, across: acrossLen }));
    cursor += acrossLen;
  });
}

/** do two boxes share any stretch of the flow, so that one can stand in the other's way across it? */
const sharesFlow = (a: Geo, b: Geo, axes: Axes): boolean =>
  a[axes.along] < b[axes.along] + b[axes.alongSize] && b[axes.along] < a[axes.along] + a[axes.alongSize];

/**
 * Give a machine's zones one extent across the flow: each runs from the first
 * zone's near side to the last one's far side, so they read as a stack of bands
 * and not as boxes of whatever width their content took. A zone stops short of a
 * sibling that is not a zone and stands beside it (an initial outside every zone,
 * say), which it would otherwise cover.
 *
 * A zone's content is parent-relative, so it is shifted back by as much as the
 * zone's near side moved: nothing inside a zone moves on the canvas, and every
 * route still stands on its ends.
 */
function alignZones<T extends Geo>(draft: Draft<T>, parent: ViewNode, zones: readonly ViewNode[], axes: Axes) {
  const laid = zones.map((z) => draft.get(z.id));
  if (zones.length < 2 || laid.some((g) => g === undefined)) return;
  const boxes = laid as T[];
  const near = Math.min(...boxes.map((g) => g[axes.across]));
  const far = Math.max(...boxes.map((g) => g[axes.across] + g[axes.acrossSize]));
  const others = parent.children
    .filter((c) => c.node.type !== SM_ZONE_TYPE && !isBorderPoint(c))
    .map((c) => draft.get(c.id))
    .filter((g): g is T => g !== undefined);
  zones.forEach((zone, i) => {
    const box = boxes[i]!;
    const inTheWay = others.filter((o) => sharesFlow(o, box, axes));
    const from = Math.max(
      near,
      ...inTheWay
        .filter((o) => o[axes.across] + o[axes.acrossSize] <= box[axes.across])
        .map((o) => o[axes.across] + o[axes.acrossSize] + ZONE_CLEARANCE),
    );
    const to = Math.min(
      far,
      ...inTheWay
        .filter((o) => o[axes.across] >= box[axes.across] + box[axes.acrossSize])
        .map((o) => o[axes.across] - ZONE_CLEARANCE),
    );
    const shift = box[axes.across] - from;
    draft.set(zone.id, { ...box, [axes.across]: from, [axes.acrossSize]: to - from });
    if (Math.abs(shift) < EPSILON) return;
    for (const child of zone.children) {
      const g = draft.get(child.id);
      if (g !== undefined) draft.set(child.id, { ...g, [axes.across]: g[axes.across] + shift });
    }
  });
}

/**
 * Grow `n` right and down around the children this pass moved or grew. Never
 * left or up, and never smaller: the stack starts at the padding corner, so it
 * only ever needs room further on, and the box's origin is what saved positions
 * of its children are relative to. Entry and exit points do not count — they
 * straddle the border by design.
 */
function growAround<T extends Geo>(draft: Draft<T>, n: ViewNode) {
  if (n.state !== 'expanded' || !n.children.some((c) => draft.touched.has(c.id))) return;
  const box = draft.get(n.id);
  if (box === undefined) return;
  const kids = n.children
    .filter((c) => !isBorderPoint(c))
    .map((c) => draft.get(c.id))
    .filter((g): g is T => g !== undefined);
  if (kids.length === 0) return;
  const pad = containerPad(n);
  const width = Math.max(box.width, ...kids.map((k) => k.x + k.width + pad.right));
  const height = Math.max(box.height, ...kids.map((k) => k.y + k.height + pad.bottom));
  draft.set(n.id, { ...box, width, height });
}

/** a centre `c` on a side `length` long, kept `size` away from either corner */
function clampAlong(c: number, size: number, length: number): number {
  return length < 2 * size ? length / 2 : Math.min(Math.max(c, size), length - size);
}

/**
 * Put each entry and exit point's centre on its composite's nearest side. The
 * side is the one nearest in `before` — the box as the layout drew it — so a
 * point elk set against the bottom stays on the bottom when the stack grows the
 * box, and follows that border to where it now is.
 */
function snapBorderPoints<T extends Geo>(draft: Draft<T>, n: ViewNode, before: Geo) {
  const box = draft.get(n.id);
  if (box === undefined) return;
  for (const c of n.children) {
    const g = isBorderPoint(c) ? draft.get(c.id) : undefined;
    if (g === undefined) continue;
    const cx = g.x + g.width / 2;
    const cy = g.y + g.height / 2;
    const off = { left: cx, right: before.width - cx, top: cy, bottom: before.height - cy };
    const side = (Object.keys(off) as (keyof typeof off)[]).reduce((a, b) => (off[b] < off[a] ? b : a));
    const vertical = side === 'left' || side === 'right';
    const x = vertical ? (side === 'left' ? 0 : box.width) : clampAlong(cx, g.width, box.width);
    const y = vertical ? clampAlong(cy, g.height, box.height) : side === 'top' ? 0 : box.height;
    draft.set(c.id, { ...g, x: x - g.width / 2, y: y - g.height / 2 });
  }
}

/**
 * Lay a state machine's open composites out the UML way, after elk: an
 * orthogonal state's (or machine's) regions stacked across the flow and filling
 * it, and its entry and exit points on its border. elk already stacks regions
 * roughly so; this pass lines them up, puts them in containment order and closes
 * the gaps, which is what lets one dashed line divide two regions. A machine's
 * zones, which the layout run already put in order (withZoneOrder), are given
 * one extent across the flow.
 *
 * Geometry is parent-relative (React Flow nesting). Boxes grow right and down to
 * fit, ancestors included; nothing else moves. Edges touching a node this pass
 * moved — a region, so everything inside it too — no longer stand on their laid
 * spot and float (useEdgePath); routes are not redrawn here. The same map back
 * when the model has no sm- nodes or nothing needed to change. Pure and cheap:
 * runs on every placed-geometry recompute.
 */
export function arrangeStateMachines<T extends Geo>(
  geometry: ReadonlyMap<string, T>,
  view: CompiledView,
  model: DiagramModel,
  { plane, direction }: StateMachineLayoutOptions,
): ReadonlyMap<string, T> {
  if (!hasStateMachine(model)) return geometry;
  const rankIn = containmentRank(model, plane);
  const axes = axesOf(direction);
  const draft = new Draft(geometry);

  // children first: a nested state that grew is a bigger child of its region
  const visit = (n: ViewNode): void => {
    n.children.forEach(visit);
    const before = draft.get(n.id);
    const regions = regionsOf(n, rankIn);
    if (regions.length > 0) stackRegions(draft, n, regions, axes);
    alignZones(draft, n, zonesOf(n, rankIn), axes);
    growAround(draft, n);
    if (before !== undefined && isOpenComposite(n)) snapBorderPoints(draft, n, before);
  };
  view.roots.forEach(visit);
  return draft.result();
}

/**
 * Which regions draw a dashed leading edge: every region on show after the first
 * in its composite — the top edge when they stack one above the other, the left
 * when side by side. The same regions, in the same order, as
 * arrangeStateMachines stacks; the separator rides on the region rather than
 * the composite because only the region knows where its edge ends up.
 */
export function regionSeparators(
  view: CompiledView,
  model: DiagramModel,
  { plane, direction }: StateMachineLayoutOptions,
): ReadonlyMap<string, RegionSeparator> {
  if (!hasStateMachine(model)) return NO_SEPARATORS;
  const rankIn = containmentRank(model, plane);
  const side: RegionSeparator = axesOf(direction) === ACROSS_Y ? 'top' : 'left';
  const out = new Map<string, RegionSeparator>();
  const visit = (n: ViewNode): void => {
    regionsOf(n, rankIn)
      .slice(1)
      .forEach((r) => out.set(r.id, side));
    n.children.forEach(visit);
  };
  view.roots.forEach(visit);
  return out.size > 0 ? out : NO_SEPARATORS;
}
