import {
  ACTIVITY_DECISION_TYPE,
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  type BoxSize,
  type CompiledView,
  type Point,
  type ViewNode,
} from '@diagc/core/internal';
import { ACTIVITY_LAYOUT, flip, laneNameLength, type LaneAxis } from './activity-frame';
import { edgeLabelText } from './layout-graph';
import { textWidth } from './box-size';
import { EDGE_LABEL_MAX_CHARS } from '../node/label-size';
import { routeEndSides } from '../edge/edge-geometry';
import { routeLaneEdges, type RouterBox, type RouterEdge, type RouterSide } from './lane-router';

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
 * a node's place along the flow is elk's, untouched, and its place across the
 * flow is its place within its own lane's band.
 *
 * The lanes run along the flow (activity-frame.ts `laneAxisOf`): rows when it
 * runs across the page, columns when it runs down.
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

/** What the banding passes work on, built once per layout: elk's arrangement of
 * the hoisted view, whose maps each pass edits in place, the hoist, and the view
 * as compiled, lanes and all. */
export interface Banding<T extends Geo = Geo> {
  result: { geometry: Map<string, T>; routes: Map<string, Point[]>; labelSpots: Map<string, Point> };
  hoist: LaneHoist;
  original: CompiledView;
}

/** The view with every eligible activity frame's lanes dissolved, or `undefined`
 * when there is none (the view is then laid out as it stands). */
export function hoistLanes(view: CompiledView): LaneHoist | undefined {
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

/** What a member takes up: its box, and the caption an activity glyph hangs under
 * it. Under rows the caption only makes it taller (elk already left its width
 * free along the flow); under columns it is the caption's width that decides how
 * wide the lane must be. */
function footprint(g: Geo, caption: BoxSize | undefined, axis: LaneAxis): Geo {
  if (caption === undefined) return { x: g.x, y: g.y, width: g.width, height: g.height };
  const width = axis === 'rows' ? g.width : Math.max(g.width, caption.width);
  return { x: g.x + (g.width - width) / 2, y: g.y, width, height: g.height + caption.height };
}

/** One lane member as the tracks see it: the stretch of the flow it takes up,
 * and across the flow where elk put it, how far it reaches before its box's
 * centre, and how far in all. */
interface TrackMember {
  id: string;
  from: number;
  to: number;
  at: number;
  up: number;
  size: number;
}

/**
 * A lane's members sorted into tracks: lines along the flow, each holding the
 * members whose centres share it. Elk never saw the lane, and leaves each member
 * wherever the other lanes' nodes pushed it; the tracks put a lane's steps back
 * in line, so the lane is only as thick as its busiest moment.
 *
 * Taken in flow order, a member starts on the track of the step it follows in
 * its lane (the first track when it follows none) and moves on a track while the
 * one it is on holds a member that shares its stretch of the flow, or its
 * sibling: another step that follows the same one, or leads to the same one.
 * Those are branches, and belong side by side. `forward` lists the links that run
 * with the flow, whichever lanes they join; a link that runs back says nothing
 * about where its ends belong.
 */
function tracksOf(members: readonly TrackMember[], forward: readonly { from: string; to: string }[]): TrackMember[][] {
  const before = new Map<string, Set<string>>();
  const after = new Map<string, Set<string>>();
  const note = (map: Map<string, Set<string>>, key: string, value: string) =>
    map.set(key, (map.get(key) ?? new Set<string>()).add(value));
  for (const l of forward) {
    note(before, l.to, l.from);
    note(after, l.from, l.to);
  }
  const share = (a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): boolean =>
    a !== undefined && b !== undefined && [...a].some((id) => b.has(id));
  const siblings = (a: string, b: string): boolean =>
    share(before.get(a), before.get(b)) || share(after.get(a), after.get(b));

  const tracks: TrackMember[][] = [];
  const trackOf = new Map<string, number>();
  for (const m of [...members].sort((p, q) => p.from - q.from || p.at - q.at)) {
    const led = [...(before.get(m.id) ?? [])].flatMap((id) => trackOf.get(id) ?? []);
    let t = led.length > 0 ? Math.min(...led) : 0;
    const taken = (track: readonly TrackMember[] | undefined): boolean =>
      track?.some((o) => (o.from < m.to && m.from < o.to) || siblings(o.id, m.id)) === true;
    while (taken(tracks[t])) t++;
    trackOf.set(m.id, t);
    (tracks[t] ??= []).push(m);
  }
  // a track left empty (a member followed one that sat farther out) takes no room
  return tracks.filter((t) => t !== undefined && t.length > 0);
}

/**
 * Put the lanes back into a layout of the hoisted view: each lane becomes a band
 * holding its members, lane-relative as React Flow nests them. A member keeps
 * elk's place along the flow (shifted so the first clears the lane's name strip)
 * and its order across the band, on the lane's tracks (`tracksOf`), `gap` apart.
 * Deeper nodes are parent-relative to a member and stay put.
 *
 * Written for rows, where the flow runs along x. For columns every box is
 * flipped on the way in and on the way out.
 */
export function bandLanes<T extends Geo>(
  { result: { geometry }, hoist, original }: Banding<T>,
  gap: number,
  /** the caption hung under a member (an activity glyph's name): counted in its
   * footprint, so the text stays inside its lane */
  captions?: ReadonlyMap<string, BoxSize>,
  axis: LaneAxis = 'rows',
): Map<string, { dx: number; dy: number }> {
  const moved = new Map<string, { dx: number; dy: number }>();
  const { LANE_MIN_W, LANE_MIN_H, LANE_STRIP_W, TITLE_STRIP_W, PAD } = ACTIVITY_LAYOUT;
  const turn = <G extends Geo>(g: G): G => (axis === 'rows' ? g : flip(g));
  const names = new Map<string, string>();
  const index = (n: ViewNode) => {
    names.set(n.id, n.node.name);
    n.children.forEach(index);
  };
  original.roots.forEach(index);

  for (const [frameId, frame] of hoist.frames) {
    const frameGeo = geometry.get(frameId);
    if (frameGeo === undefined) continue;
    const members = frame.lanes.flatMap((l) => l.members).filter((id) => geometry.has(id));
    // each member's footprint as elk left it, and the same seen along the flow
    const real = new Map(members.map((id) => [id, footprint(geometry.get(id)!, captions?.get(id), axis)] as const));
    const foot = new Map([...real].map(([id, r]) => [id, turn(r)] as const));
    const minX = Math.min(...[...foot.values()].map((f) => f.x));
    // the links that run with the flow: the target starts after the source ends
    const forward = original.layoutEdges.filter((e) => {
      const a = foot.get(e.from);
      const b = foot.get(e.to);
      return a !== undefined && b !== undefined && b.x >= a.x + a.width;
    });

    let length: number = LANE_MIN_W;
    const bands = frame.lanes.map((lane) => {
      const placed = new Map<string, Point>();
      const inLane = lane.members.filter((id) => foot.has(id)).sort((a, b) => foot.get(a)!.y - foot.get(b)!.y);
      const tracks = tracksOf(
        inLane.map((id) => {
          const f = foot.get(id)!;
          const box = turn(geometry.get(id)!);
          return { id, from: f.x, to: f.x + f.width, at: f.y, up: box.y + box.height / 2 - f.y, size: f.height };
        }),
        forward,
      );
      let bottom = PAD;
      let right = 0;
      for (const track of tracks) {
        const up = Math.max(...track.map((m) => m.up));
        for (const m of track) {
          const x = m.from - minX + LANE_STRIP_W + PAD;
          placed.set(m.id, { x, y: bottom + up - m.up });
          right = Math.max(right, x + m.to - m.from);
        }
        bottom += up + Math.max(...track.map((m) => m.size - m.up)) + gap;
      }
      if (tracks.length > 0) bottom -= gap;
      length = Math.max(length, right + PAD);
      // a band is never thinner than its own name is long
      const thick = Math.max(LANE_MIN_H, bottom + PAD, laneNameLength(names.get(lane.id) ?? ''));
      return { lane, placed, thick };
    });

    let across = 0;
    for (const band of bands) {
      const lane = turn({ x: TITLE_STRIP_W, y: across, width: length, height: band.thick });
      for (const [id, at] of band.placed) {
        const was = geometry.get(id)!;
        const r = real.get(id)!;
        // the footprint's spot in the lane, then the box's place inside its footprint
        const x = (axis === 'rows' ? at.x : at.y) + was.x - r.x;
        const y = (axis === 'rows' ? at.y : at.x) + was.y - r.y;
        // frame-relative before (elk's) and after (the lane's origin plus the spot in it)
        moved.set(id, { dx: lane.x + x - was.x, dy: lane.y + y - was.y });
        geometry.set(id, { ...was, x, y });
      }
      const prior = geometry.get(band.lane.id);
      geometry.set(band.lane.id, { ...(prior ?? frameGeo), ...lane });
      across += band.thick;
    }
    const size = turn({ x: 0, y: 0, width: TITLE_STRIP_W + length, height: across });
    geometry.set(frameId, { ...frameGeo, width: size.width, height: size.height });
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
 * an edge between lanes always, and left to routeBandedEdges.
 */
export function rebaseRoutes(
  { result: { geometry, routes, labelSpots }, hoist, original }: Banding,
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

/** An edge label's box as drawn: `.dg-edge-label`, 10px at 1.4 with 1px 6px of
 * padding, one line of at most EDGE_LABEL_MAX_CHARS. */
function edgeLabelSize(text: string): BoxSize {
  const shown = text.length > EDGE_LABEL_MAX_CHARS ? text.slice(0, EDGE_LABEL_MAX_CHARS) : text;
  return { width: Math.ceil(textWidth(shown, 10)) + 12, height: 16 };
}

const TURNED: Record<RouterSide, RouterSide> = { left: 'top', top: 'left', right: 'bottom', bottom: 'right' };

/**
 * Route the frame links the banding left without a route (rebaseRoutes dropped
 * them: every link between lanes, and any whose shifted elk path ran into a
 * box) — orthogonally, through the column gaps and lane pad strips the banded
 * frame keeps clear (lane-router.ts). A link the router cannot place, or one
 * fixed to a top/bottom side, keeps floating.
 */
export function routeBandedEdges(
  { result: { geometry, routes, labelSpots }, hoist, original }: Banding,
  captions?: ReadonlyMap<string, BoxSize>,
  axis: LaneAxis = 'rows',
): void {
  const { PAD } = ACTIVITY_LAYOUT;
  // the router is written for rows: columns go in flipped and come out flipped
  const turn = <G extends { x: number; y: number; width: number; height: number }>(g: G): G =>
    axis === 'rows' ? g : flip(g);
  const turnPoint = (p: Point): Point => (axis === 'rows' ? p : { x: p.y, y: p.x });
  const turnSize = (b: BoxSize): BoxSize => (axis === 'rows' ? b : { width: b.height, height: b.width });
  const turnSide = (side: RouterSide | undefined): RouterSide | undefined =>
    side === undefined || axis === 'rows' ? side : TURNED[side];
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
          ...turn({ x: ax, y: ay, width: g.width, height: g.height }),
          caption:
            caption === undefined || axis === 'rows' ? caption : { width: caption.height, height: caption.width },
          captionSide: axis === 'rows' ? 'bottom' : 'right',
          fanOut: n.node.type === ACTIVITY_DECISION_TYPE,
        });
      }
      n.children.forEach((c) => place(c, ax, ay));
    };
    for (const lane of frame.children) {
      const lg = geometry.get(lane.id);
      if (lg === undefined) continue;
      // the pad strips along a lane's top and bottom hold no member
      const band = turn({ x: fx + lg.x, y: fy + lg.y, width: lg.width, height: lg.height });
      corridors.push(band.y + PAD / 2, band.y + band.height - PAD / 2);
      lane.children.forEach((c) => place(c, fx + lg.x, fy + lg.y));
    }

    const inFrame = new Set(boxes.map((b) => b.id));
    const edges: RouterEdge[] = original.layoutEdges
      .filter((e) => hoist.touched.has(e.id) && inFrame.has(e.from) && inFrame.has(e.to))
      // A fixed side counts where the drawn edge carries one, as useEdgePath reads
      // it: core leaves a rolled-up relation's sides on its own nodes.
      .map((e) => {
        const label = edgeLabelText(e).trim();
        return {
          id: e.id,
          from: e.from,
          to: e.to,
          fromSide: e.style?.fromSide,
          toSide: e.style?.toSide,
          hasLabel: label !== '',
          labelSize: label !== '' ? turnSize(edgeLabelSize(label)) : undefined,
        };
      })
      // elk's surviving routes stand, unless they break a fixed side (useEdgePath
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
    const routed = routeLaneEdges({
      boxes,
      corridors,
      edges: edges.map((e) => ({ ...e, fromSide: turnSide(e.fromSide), toSide: turnSide(e.toSide) })),
    });
    for (const [id, pts] of routed.routes) routes.set(id, pts.map(turnPoint));
    for (const [id, p] of routed.labelSpots) labelSpots.set(id, turnPoint(p));
  }
}
