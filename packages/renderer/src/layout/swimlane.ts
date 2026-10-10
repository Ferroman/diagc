import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  type BoxSize,
  type CompiledView,
  type LayoutSettings,
  type Point,
  type ViewNode,
} from '@diagc/core/internal';
import { ACTIVITY_LAYOUT } from './activity-frame';
import { containerPad, edgeLabelText, FALLBACK_DIRECTION } from './layout-graph';
import { routeEndSides } from '../edge/edge-geometry';
import { routeLaneEdges, type RouterBox, type RouterEdge } from './lane-router';

/**
 * Activity swimlanes: one layering along the flow, nodes banded by lane across it.
 *
 * Handed the lanes as containers, elk treats each as one opaque box and lines the
 * lanes up ALONG the flow — the customer's lane first, the orders lane after it,
 * accounting after that — and the band pass then stacked them at the same x. Each
 * lane's content kept its lane-relative place, so a flow that left a lane and
 * came back ran backwards across the picture: the start node sat wherever its
 * lane's own layout put it, and every edge touching a moved lane lost its route.
 *
 * So elk never sees the lanes. Their contents are hoisted into the frame and laid
 * out as ONE graph, which gives every node its place along the flow relative to
 * every other node, whichever lane it is in. `bandLanes` then puts the lanes back:
 * x is elk's, untouched, and y is each node's place within its own lane's band.
 *
 * Horizontal flows only: lanes are horizontal bands (vertical lanes are a recorded
 * deferral), and banding a flow that runs DOWN would throw away its order.
 */

interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HoistedFrame {
  lanes: { id: string; members: string[] }[];
}

export interface LaneHoist {
  /** the view elk lays out: every hoisted frame's children are its lanes' children */
  view: CompiledView;
  frames: Map<string, HoistedFrame>;
  /** edges with an endpoint inside a hoisted frame, whose elk routes the banding invalidates */
  touched: Set<string>;
}

const isHorizontal = (settings: LayoutSettings | undefined): boolean => {
  const d = settings?.direction ?? FALLBACK_DIRECTION;
  return d === 'RIGHT' || d === 'LEFT';
};

/** The view with every eligible activity frame's lanes dissolved, or `undefined`
 * when there is none (the view is then laid out exactly as before). */
export function hoistLanes(view: CompiledView, settings: LayoutSettings | undefined): LaneHoist | undefined {
  if (!isHorizontal(settings)) return undefined;
  const frames = new Map<string, HoistedFrame>();
  const laneIds = new Set<string>();

  const eligible = (n: ViewNode): boolean =>
    n.node.type === ACTIVITY_FRAME_TYPE &&
    n.state === 'expanded' &&
    n.children.length > 0 &&
    // an empty lane is a leaf; a folded one would hide members elk must place
    n.children.every((c) => c.node.type === ACTIVITY_LANE_TYPE && c.state !== 'collapsed');

  const rewrite = (n: ViewNode): ViewNode => {
    if (eligible(n)) {
      frames.set(n.id, { lanes: n.children.map((l) => ({ id: l.id, members: l.children.map((c) => c.id) })) });
      n.children.forEach((l) => laneIds.add(l.id));
      // lane declaration order is model order, so the flattened list reads lane by lane
      return { ...n, children: n.children.flatMap((l) => l.children.map(rewrite)) };
    }
    if (n.children.length === 0) return n;
    return { ...n, children: n.children.map(rewrite) };
  };
  const roots = view.roots.map(rewrite);
  if (frames.size === 0) return undefined;

  const inFrame = new Set<string>();
  const note = (n: ViewNode, inside: boolean) => {
    const here = inside || frames.has(n.id);
    if (here) inFrame.add(n.id);
    n.children.forEach((c) => note(c, here));
  };
  view.roots.forEach((r) => note(r, false));

  const touched = new Set(view.layoutEdges.filter((e) => inFrame.has(e.from) || inFrame.has(e.to)).map((e) => e.id));
  // an edge to a lane itself has nothing left to attach to in the laid-out view
  const keep = (e: { from: string; to: string }) => !laneIds.has(e.from) && !laneIds.has(e.to);
  return {
    view: { ...view, roots, edges: view.edges.filter(keep), layoutEdges: view.layoutEdges.filter(keep) },
    frames,
    touched,
  };
}

/**
 * Put the lanes back into a layout of the hoisted view: each lane becomes a band
 * holding its members, lane-relative as React Flow nests them. A member keeps
 * elk's x (shifted so the widest reach clears the lane's label strip) and its
 * order down the band; runs of empty height — where elk had another lane's nodes —
 * close up to `gap`. Deeper nodes are parent-relative to a member and stay put.
 */
export function bandLanes<T extends Geo>(
  geometry: Map<string, T>,
  hoist: LaneHoist,
  original: CompiledView,
  gap: number,
  /** px hanging below a member's box (an activity glyph's caption): counted in
   * the band's height and in the run closing, so the text stays inside its lane */
  below?: ReadonlyMap<string, number>,
): Map<string, { dx: number; dy: number }> {
  const moved = new Map<string, { dx: number; dy: number }>();
  const L = ACTIVITY_LAYOUT;
  const byId = new Map<string, ViewNode>();
  const index = (n: ViewNode) => {
    byId.set(n.id, n);
    n.children.forEach(index);
  };
  original.roots.forEach(index);

  for (const [frameId, frame] of hoist.frames) {
    const frameGeo = geometry.get(frameId);
    if (frameGeo === undefined) continue;
    const members = frame.lanes.flatMap((l) => l.members).filter((id) => geometry.has(id));
    const minX = Math.min(...members.map((id) => geometry.get(id)!.x));

    let width: number = L.LANE_MIN_W;
    const bands = frame.lanes.map((lane) => {
      const laneNode = byId.get(lane.id);
      const pad =
        laneNode !== undefined
          ? containerPad(laneNode)
          : { top: L.PAD, left: L.LANE_STRIP_W + L.PAD, bottom: L.PAD, right: L.PAD };
      const placed = new Map<string, Point>();
      const inLane = lane.members
        .filter((id) => geometry.has(id))
        .sort((a, b) => geometry.get(a)!.y - geometry.get(b)!.y);
      let shift = inLane.length > 0 ? geometry.get(inLane[0]!)!.y : 0;
      let reach = -Infinity; // lowest bottom so far, in elk's coordinates
      let bottom = 0;
      let right = 0;
      for (const id of inLane) {
        const g = geometry.get(id)!;
        const hang = below?.get(id) ?? 0;
        if (reach !== -Infinity && g.y > reach + gap) shift += g.y - reach - gap;
        reach = Math.max(reach, g.y + g.height + hang);
        const x = g.x - minX + pad.left;
        const y = g.y - shift + pad.top;
        placed.set(id, { x, y });
        bottom = Math.max(bottom, y + g.height + hang);
        right = Math.max(right, x + g.width);
      }
      width = Math.max(width, right + pad.right);
      return { lane, placed, height: Math.max(L.LANE_MIN_H, bottom + pad.bottom) };
    });

    let y = 0;
    for (const band of bands) {
      for (const [id, at] of band.placed) {
        const was = geometry.get(id)!;
        // frame-relative before (elk's) and after (the lane's origin plus the spot in it)
        moved.set(id, { dx: L.TITLE_STRIP_W + at.x - was.x, dy: y + at.y - was.y });
        geometry.set(id, { ...was, x: at.x, y: at.y });
      }
      const prior = geometry.get(band.lane.id);
      geometry.set(band.lane.id, { ...(prior ?? frameGeo), x: L.TITLE_STRIP_W, y, width, height: band.height });
      y += band.height;
    }
    geometry.set(frameId, { ...frameGeo, width: L.TITLE_STRIP_W + width, height: y });
  }
  return moved;
}

/** Does the segment a→b pass through the rectangle's interior? (Liang–Barsky clip,
 * against the box shrunk by a pixel so a route running along a wall still passes.) */
function crosses(a: Point, b: Point, r: Geo): boolean {
  const x0 = r.x + 1;
  const y0 = r.y + 1;
  const x1 = r.x + r.width - 1;
  const y1 = r.y + r.height - 1;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The elk routes that survive the banding, shifted to match it. A route is kept
 * when both of its ends moved by the same offset (so the path still starts and
 * ends on them) and the shifted path runs through no other box — the banding put
 * other lanes' nodes where elk's route never looked. Everything else is dropped,
 * and the renderer floats it: an edge between lanes always, as it always has.
 */
export function rebaseRoutes(
  routes: Map<string, Point[]>,
  labelSpots: Map<string, Point>,
  hoist: LaneHoist,
  original: CompiledView,
  geometry: ReadonlyMap<string, Geo>,
  moved: ReadonlyMap<string, { dx: number; dy: number }>,
): void {
  const parent = new Map<string, string | null>();
  const walk = (n: ViewNode, p: string | null) => {
    parent.set(n.id, p);
    n.children.forEach((c) => walk(c, n.id));
  };
  original.roots.forEach((r) => walk(r, null));

  // the hoisted member an id belongs to (itself or its nearest such ancestor)
  const memberOf = (id: string): string | undefined => {
    for (let cur: string | null | undefined = id; cur != null; cur = parent.get(cur)) {
      if (moved.has(cur)) return cur;
    }
    return undefined;
  };
  const shiftOf = (id: string) => {
    const m = memberOf(id);
    return m === undefined ? { dx: 0, dy: 0 } : moved.get(m)!;
  };

  // every drawn box inside a hoisted frame, absolute, after the banding
  const boxes: { id: string; box: Geo }[] = [];
  const place = (n: ViewNode, ox: number, oy: number, inside: boolean) => {
    const g = geometry.get(n.id);
    if (g === undefined) return;
    const ax = ox + g.x;
    const ay = oy + g.y;
    const here = inside || hoist.frames.has(n.id);
    if (here && n.state !== 'expanded')
      boxes.push({ id: n.id, box: { x: ax, y: ay, width: g.width, height: g.height } });
    n.children.forEach((c) => place(c, ax, ay, here));
  };
  original.roots.forEach((r) => place(r, 0, 0, false));

  const ends = new Map(original.layoutEdges.map((e) => [e.id, e] as const));
  for (const id of hoist.touched) {
    const pts = routes.get(id);
    const e = ends.get(id);
    if (pts === undefined || e === undefined) continue;
    const a = shiftOf(e.from);
    const b = shiftOf(e.to);
    const next = pts.map((p) => ({ x: p.x + a.dx, y: p.y + a.dy }));
    const blocked =
      a.dx !== b.dx ||
      a.dy !== b.dy ||
      boxes.some(
        ({ id: boxId, box }) =>
          boxId !== e.from && boxId !== e.to && next.some((p, i) => i > 0 && crosses(next[i - 1]!, p, box)),
      );
    if (blocked) {
      routes.delete(id);
      labelSpots.delete(id);
      continue;
    }
    routes.set(id, next);
    const spot = labelSpots.get(id);
    if (spot !== undefined) labelSpots.set(id, { x: spot.x + a.dx, y: spot.y + a.dy });
  }
}

/**
 * Route the frame links the banding left without a route (rebaseRoutes dropped
 * them: every link between lanes, and any whose shifted elk path ran into a
 * box) — orthogonally, through the column gaps and lane pad strips the banded
 * frame keeps clear (lane-router.ts). A link the router cannot place, or one
 * pinned to a top/bottom side, keeps floating as before.
 */
export function routeBandedEdges(
  routes: Map<string, Point[]>,
  labelSpots: Map<string, Point>,
  hoist: LaneHoist,
  original: CompiledView,
  geometry: ReadonlyMap<string, Geo>,
  captions?: ReadonlyMap<string, BoxSize>,
): void {
  const L = ACTIVITY_LAYOUT;
  for (const frameId of hoist.frames.keys()) {
    const boxes: RouterBox[] = [];
    const corridors: number[] = [];
    let frame: ViewNode | undefined;
    const find = (n: ViewNode) => {
      if (n.id === frameId) frame = n;
      else n.children.forEach(find);
    };
    original.roots.forEach(find);
    // absolute origin of the frame: the sum of its ancestors' offsets
    const origin = (() => {
      const path: string[] = [];
      const seek = (n: ViewNode, trail: string[]): boolean => {
        if (n.id === frameId) {
          path.push(...trail);
          return true;
        }
        return n.children.some((c) => seek(c, [...trail, n.id]));
      };
      original.roots.some((r) => seek(r, []));
      return path.reduce(
        (o, id) => {
          const g = geometry.get(id);
          return g === undefined ? o : { x: o.x + g.x, y: o.y + g.y };
        },
        { x: 0, y: 0 },
      );
    })();
    const fg = geometry.get(frameId);
    if (frame === undefined || fg === undefined) continue;
    const fx = origin.x + fg.x;
    const fy = origin.y + fg.y;
    const place = (n: ViewNode, ox: number, oy: number) => {
      const g = geometry.get(n.id);
      if (g === undefined) return;
      const ax = ox + g.x;
      const ay = oy + g.y;
      if (n.state !== 'expanded') {
        const caption = captions?.get(n.id);
        boxes.push({
          id: n.id,
          x: ax,
          y: ay,
          width: g.width,
          height: g.height,
          ...(caption !== undefined ? { caption } : {}),
        });
      }
      n.children.forEach((c) => place(c, ax, ay));
    };
    for (const lane of frame.children) {
      const lg = geometry.get(lane.id);
      if (lg === undefined) continue;
      // the pad strips along a lane's top and bottom hold no member
      corridors.push(fy + lg.y + L.PAD / 2, fy + lg.y + lg.height - L.PAD / 2);
      lane.children.forEach((c) => place(c, fx + lg.x, fy + lg.y));
    }

    const inFrame = new Set(boxes.map((b) => b.id));
    const edges: RouterEdge[] = original.layoutEdges
      .filter((e) => hoist.touched.has(e.id) && inFrame.has(e.from) && inFrame.has(e.to))
      // A fixed side counts where the drawn edge carries one, as DiagramEdge reads
      // it: core leaves a rolled-up relation's sides on its own nodes.
      .map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        ...(e.style?.fromSide !== undefined ? { fromSide: e.style.fromSide } : {}),
        ...(e.style?.toSide !== undefined ? { toSide: e.style.toSide } : {}),
        hasLabel: edgeLabelText(e).trim() !== '',
      }))
      // elk's surviving routes stand, unless they break a pin (DiagramEdge
      // would then float them): those are routed here, honouring it
      .filter((e) => {
        const kept = routes.get(e.id);
        if (kept === undefined) return true;
        const sides = routeEndSides(kept);
        return (
          (e.fromSide !== undefined && e.fromSide !== sides.from) || (e.toSide !== undefined && e.toSide !== sides.to)
        );
      });
    if (edges.length === 0) continue;
    const routed = routeLaneEdges({ boxes, corridors, edges });
    for (const [id, pts] of routed.routes) routes.set(id, pts);
    for (const [id, p] of routed.labelSpots) labelSpots.set(id, p);
  }
}
