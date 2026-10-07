import { describe, expect, it } from 'vitest';
import { compileView, model, type CompiledView, type DiagramModel, type ViewNode } from '@diagc/core';
import { ACTIVITY_LAYOUT as L } from './activity-frame';
import { layoutView, type NodeGeometry } from './layout';
import { bandLanes, hoistLanes, rebaseRoutes } from './swimlane';

const RIGHT = { direction: 'RIGHT' as const };

const view = (m: DiagramModel): CompiledView =>
  compileView(m, { pins: Object.fromEntries(m.nodes.map((n) => [n.id, 'expanded' as const])) });

/** absolute boxes from parent-relative geometry */
function absolute(v: CompiledView, g: ReadonlyMap<string, NodeGeometry>): Map<string, NodeGeometry> {
  const out = new Map<string, NodeGeometry>();
  const walk = (n: ViewNode, ox: number, oy: number) => {
    const q = g.get(n.id);
    if (q === undefined) return;
    out.set(n.id, { ...q, x: ox + q.x, y: oy + q.y });
    n.children.forEach((c) => walk(c, ox + q.x, oy + q.y));
  };
  v.roots.forEach((r) => walk(r, 0, 0));
  return out;
}

/** A flow that leaves its lane and comes back: a (l1) → b (l2) → c (l1) → d (l3). */
function zigzag(): DiagramModel {
  const m = model('zz');
  const act = m.activity('f');
  const l1 = act.lane('l1');
  const l2 = act.lane('l2');
  const l3 = act.lane('l3');
  const a = l1.action('a', 'A');
  const b = l2.action('b', 'B');
  const c = l1.action('c', 'C');
  const d = l3.action('d', 'D');
  act.flow(a, b).flow(b, c).flow(c, d);
  return m.toJSON();
}

describe('hoistLanes', () => {
  it('leaves a vertical flow alone', () => {
    expect(hoistLanes(view(zigzag()), { direction: 'DOWN' })).toBeUndefined();
    expect(hoistLanes(view(zigzag()), undefined)).toBeUndefined();
  });

  it('leaves a view without activity frames alone', () => {
    const m = model('plain');
    m.node('x', { name: 'X' });
    expect(hoistLanes(view(m.toJSON()), RIGHT)).toBeUndefined();
  });

  it("makes the lanes' members the frame's children, lane by lane", () => {
    const hoist = hoistLanes(view(zigzag()), RIGHT)!;
    const frame = hoist.view.roots.find((r) => r.id === 'f')!;
    expect(frame.children.map((c) => c.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(hoist.frames.get('f')!.lanes).toEqual([
      { id: 'l1', members: ['a', 'c'] },
      { id: 'l2', members: ['b'] },
      { id: 'l3', members: ['d'] },
    ]);
    expect(hoist.touched.size).toBe(3);
  });

  it('drops an edge that ends on a lane itself', () => {
    const m = zigzag();
    m.nodes.push({ id: 'outside', name: 'Outside' });
    m.relations.push({ id: 'to-lane', from: 'outside', to: 'l2', kind: 'uses' });
    const hoist = hoistLanes(view(m), RIGHT)!;
    expect(hoist.view.layoutEdges.some((e) => e.to === 'l2')).toBe(false);
  });
});

describe('layoutView on activity lanes', () => {
  it('lays the flow out left to right across lanes', async () => {
    const v = view(zigzag());
    const { geometry } = await layoutView(v, undefined, RIGHT);
    const abs = absolute(v, geometry);
    const x = (id: string) => abs.get(id)!.x;
    // before the swimlane pass every lane started at the same x, so c sat beside a
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
    expect(x('c')).toBeLessThan(x('d'));
  });

  it('stacks the lanes in declaration order, each holding its own members', async () => {
    const v = view(zigzag());
    const { geometry } = await layoutView(v, undefined, RIGHT);
    const abs = absolute(v, geometry);
    const lanes = ['l1', 'l2', 'l3'].map((id) => abs.get(id)!);
    for (let i = 1; i < lanes.length; i++) expect(lanes[i]!.y).toBe(lanes[i - 1]!.y + lanes[i - 1]!.height);
    for (const [member, lane] of [
      ['a', 'l1'],
      ['c', 'l1'],
      ['b', 'l2'],
      ['d', 'l3'],
    ] as const) {
      const n = abs.get(member)!;
      const l = abs.get(lane)!;
      expect(n.y).toBeGreaterThanOrEqual(l.y);
      expect(n.y + n.height).toBeLessThanOrEqual(l.y + l.height);
      expect(n.x).toBeGreaterThanOrEqual(l.x + L.LANE_STRIP_W);
    }
    expect(new Set(lanes.map((l) => l.width)).size).toBe(1);
  });

  it('keeps the routes of a lane that moved as one piece, and routes the ones between lanes', async () => {
    const m = model('routes');
    const act = m.activity('f');
    const l1 = act.lane('l1');
    const l2 = act.lane('l2');
    const a = l1.action('a', 'A');
    const b = l1.action('b', 'B');
    const c = l2.action('c', 'C');
    act.flow(a, b).flow(b, c);
    const v = view(m.toJSON());
    const { geometry, routes } = await layoutView(v, undefined, RIGHT);
    const abs = absolute(v, geometry);
    const idOf = (from: string, to: string) => v.layoutEdges.find((e) => e.from === from && e.to === to)!.id;

    const within = routes.get(idOf('a', 'b'));
    expect(within).toBeDefined();
    // the route still starts on a and ends on b, where the banding put them
    const first = within![0]!;
    const last = within![within!.length - 1]!;
    expect(first.x).toBeCloseTo(abs.get('a')!.x + abs.get('a')!.width, 0);
    expect(last.x).toBeCloseTo(abs.get('b')!.x, 0);
    // between lanes elk's route is gone; the lane router draws one, right-angled,
    // from b's side into c's
    const across = routes.get(idOf('b', 'c'))!;
    expect(across.every((p, i) => i === 0 || p.x === across[i - 1]!.x || p.y === across[i - 1]!.y)).toBe(true);
    expect(across[0]!.x).toBeCloseTo(abs.get('b')!.x + abs.get('b')!.width, 0);
    expect(across[across.length - 1]!.x).toBeCloseTo(abs.get('c')!.x, 0);
  });

  it('grows a lane to hold a caption hanging under its lowest member', async () => {
    const m = model('cap');
    const act = m.activity('f');
    const l1 = act.lane('l1');
    l1.decision('d', 'Is it in stock and ready to ship?');
    const v = view(m.toJSON());
    const glyph = { width: 48, height: 48 };
    const bare = await layoutView(v, new Map([['d', glyph]]), RIGHT);
    const captioned = await layoutView(v, new Map([['d', { ...glyph, caption: { width: 180, height: 35 } }]]), RIGHT);
    const lane = (r: typeof bare) => r.geometry.get('l1')!;
    const d = captioned.geometry.get('d')!;
    expect(lane(captioned).height).toBeGreaterThanOrEqual(d.y + d.height + 35);
    expect(lane(captioned).height).toBeGreaterThan(lane(bare).height - 1);
  });

  it('lays out a downward activity exactly as before', async () => {
    const v = view(zigzag());
    const { geometry } = await layoutView(v, undefined, { direction: 'DOWN' });
    // the lanes stayed elk's containers: each is laid out, not synthesized
    expect(geometry.get('a')!.x).toBeGreaterThanOrEqual(0);
    expect(geometry.has('l1')).toBe(true);
  });
});

describe('bandLanes', () => {
  it("closes up the height elk spent on another lane's nodes", () => {
    const v = view(zigzag());
    const hoist = hoistLanes(v, RIGHT)!;
    const box = (x: number, y: number) => ({ x, y, width: 100, height: 40 });
    const g = new Map<string, NodeGeometry>([
      ['f', { x: 0, y: 0, width: 1000, height: 1000 }],
      ['a', box(28, 0)],
      ['b', box(200, 100)],
      // 400 below a, all of it spent on the other lanes' rows
      ['c', box(400, 440)],
      ['d', box(600, 200)],
    ]);
    const moved = bandLanes(g, hoist, v, 40);
    const pad = { top: L.PAD, left: L.LANE_STRIP_W + L.PAD };
    expect(g.get('a')).toMatchObject({ x: pad.left, y: pad.top });
    expect(g.get('c')).toMatchObject({ x: 400 - 28 + pad.left, y: pad.top + 40 + 40 });
    expect(g.get('l1')).toMatchObject({ x: L.TITLE_STRIP_W, y: 0, height: pad.top + 40 + 40 + 40 + L.PAD });
    expect(g.get('l2')!.y).toBe(g.get('l1')!.height);
    expect(moved.get('a')).toEqual({ dx: L.TITLE_STRIP_W + pad.left - 28, dy: pad.top });
  });
});

describe('rebaseRoutes', () => {
  const setup = () => {
    const v = view(zigzag());
    const hoist = hoistLanes(v, RIGHT)!;
    const id = (from: string, to: string) => v.layoutEdges.find((e) => e.from === from && e.to === to)!.id;
    return { v, hoist, id };
  };

  it('shifts a route whose ends moved together', () => {
    const { v, hoist, id } = setup();
    const routes = new Map([
      [
        id('a', 'b'),
        [
          { x: 10, y: 10 },
          { x: 50, y: 10 },
        ],
      ],
    ]);
    const spots = new Map([[id('a', 'b'), { x: 30, y: 10 }]]);
    const geometry = new Map<string, NodeGeometry>([['f', { x: 0, y: 0, width: 999, height: 999 }]]);
    const same = { dx: 5, dy: 7 };
    rebaseRoutes(
      routes,
      spots,
      hoist,
      v,
      geometry,
      new Map([
        ['a', same],
        ['b', same],
      ]),
    );
    expect(routes.get(id('a', 'b'))).toEqual([
      { x: 15, y: 17 },
      { x: 55, y: 17 },
    ]);
    expect(spots.get(id('a', 'b'))).toEqual({ x: 35, y: 17 });
  });

  it('drops a route whose ends moved apart', () => {
    const { v, hoist, id } = setup();
    const routes = new Map([
      [
        id('a', 'b'),
        [
          { x: 10, y: 10 },
          { x: 50, y: 10 },
        ],
      ],
    ]);
    const geometry = new Map<string, NodeGeometry>([['f', { x: 0, y: 0, width: 999, height: 999 }]]);
    rebaseRoutes(
      routes,
      new Map(),
      hoist,
      v,
      geometry,
      new Map([
        ['a', { dx: 0, dy: 0 }],
        ['b', { dx: 0, dy: 90 }],
      ]),
    );
    expect(routes.has(id('a', 'b'))).toBe(false);
  });

  it('drops a route the banding put a box on', () => {
    const { v, hoist, id } = setup();
    const routes = new Map([
      [
        id('a', 'b'),
        [
          { x: 0, y: 10 },
          { x: 300, y: 10 },
        ],
      ],
    ]);
    const geometry = new Map<string, NodeGeometry>([
      ['f', { x: 0, y: 0, width: 999, height: 999 }],
      ['l3', { x: 0, y: 0, width: 999, height: 999 }],
      ['d', { x: 100, y: 0, width: 50, height: 40 }],
    ]);
    const still = { dx: 0, dy: 0 };
    rebaseRoutes(
      routes,
      new Map(),
      hoist,
      v,
      geometry,
      new Map([
        ['a', still],
        ['b', still],
        ['d', still],
      ]),
    );
    expect(routes.has(id('a', 'b'))).toBe(false);
  });
});

describe('layoutView on an activity with a loop', () => {
  /** coin-supply's shape: a round trip to another lane, and a reissue that goes
   * back to the write — so the only honest loop-back is reissue → write */
  function retry(): DiagramModel {
    const m = model('retry');
    const act = m.activity('f');
    const own = act.lane('own');
    const cp = act.lane('cp');
    const start = own.start('s');
    const prep = own.action('prep', 'Prepare');
    const write = own.action('write', 'Write the emission');
    const send = own.send('send', 'Signing request');
    const recv = cp.receive('recv', 'Signing request');
    const sign = cp.action('sign', 'Sign');
    const back = cp.send('back', 'Signing result');
    const result = own.receive('result', 'Signing result');
    const ok = own.decision('ok');
    const done = own.action('done', 'Completed');
    const expired = own.action('expired', 'Expired');
    const reissue = own.action('reissue', 'Reissue');
    const end = own.end('e');
    const note = own.note('why', 'The ledger row is written before signing and is not reversed on EXPIRED.');
    act
      .flow(start, prep)
      .flow(prep, write)
      .flow(write, send)
      .flow(send, recv)
      .flow(recv, sign)
      .flow(sign, back)
      .flow(back, result)
      .flow(result, ok)
      .flow(ok, done, '[valid]')
      .flow(ok, expired, '[expired]')
      .flow(expired, reissue)
      .flow(reissue, write)
      .flow(done, end)
      .noteLink(note, write);
    return m.toJSON();
  }

  it('starts at the left edge and runs every step of the loop forwards', async () => {
    const v = view(retry());
    const { geometry } = await layoutView(v, undefined, RIGHT);
    const abs = absolute(v, geometry);
    const x = (id: string) => abs.get(id)!.x;
    const order = ['s', 'prep', 'write', 'send', 'recv', 'sign', 'back', 'result', 'ok', 'expired', 'reissue'];
    for (let i = 1; i < order.length; i++)
      expect(x(order[i]!), `${order[i - 1]} → ${order[i]}`).toBeGreaterThan(x(order[i - 1]!));
    // nothing sits left of the start, the note included
    for (const [id, g] of abs) if (!['f', 'own', 'cp'].includes(id)) expect(g.x, id).toBeGreaterThanOrEqual(x('s'));
  });

  it('draws a note link from the note, though elk laid it out the other way', async () => {
    const v = view(retry());
    const { geometry, routes } = await layoutView(v, undefined, RIGHT);
    const abs = absolute(v, geometry);
    const link = v.layoutEdges.find((e) => e.kind === 'note-link')!;
    // note and target share a lane, so the route survives the banding
    const route = routes.get(link.id)!;
    expect(route).toBeDefined();
    const note = abs.get('why')!;
    const first = route[0]!;
    const within = (p: { x: number; y: number }, g: NodeGeometry) =>
      p.x >= g.x - 1 && p.x <= g.x + g.width + 1 && p.y >= g.y - 1 && p.y <= g.y + g.height + 1;
    expect(within(first, note)).toBe(true);
  });
});
