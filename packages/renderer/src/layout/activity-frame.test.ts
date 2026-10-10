import { describe, expect, it } from 'vitest';
import { compileView, type DiagramModel } from '@diagc/core/internal';
import { ACTIVITY_LAYOUT as L, arrangeActivityFrames, laneDropOffset, withLaneOrder } from './activity-frame';

const model = (extraLaneKids: { id: string; parent: string }[] = []): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'f', name: 'F', type: 'activity-frame' },
    { id: 'l1', name: 'L1', type: 'activity-lane' },
    { id: 'l2', name: 'L2', type: 'activity-lane' },
    ...extraLaneKids.map((k) => ({ id: k.id, name: k.id, type: 'activity-action' })),
  ],
  containment: [
    { parent: 'f', child: 'l1' },
    { parent: 'f', child: 'l2' },
    ...extraLaneKids.map((k) => ({ parent: k.parent, child: k.id })),
  ],
  relations: [],
  layers: [],
  planes: [],
});

const view = (m: DiagramModel, plane?: string) =>
  compileView(m, { pins: Object.fromEntries(m.nodes.map((n) => [n.id, 'expanded' as const])), plane });

/** the same frame on two planes, its lanes stacked l1, l2 on `a` and l2, l1 on `b` */
const twoPlanes = (): DiagramModel => ({
  ...model(),
  containment: [
    { parent: 'f', child: 'l1' },
    { parent: 'f', child: 'l2' },
    { parent: 'f', child: 'l2', plane: 'b' },
    { parent: 'f', child: 'l1', plane: 'b' },
  ],
  planes: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
});

const geo = (entries: [string, { x: number; y: number; width: number; height: number }][]) => new Map(entries);

describe('arrangeActivityFrames', () => {
  it('returns the same reference when the model has no frames', () => {
    const m: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [{ id: 'a', name: 'A', type: 'activity-action' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const g = geo([['a', { x: 0, y: 0, width: 10, height: 10 }]]);
    const out = arrangeActivityFrames(g, view(m), m);
    expect(out).toBe(g);
  });

  it('stacks bands in containment order, not node order', () => {
    // the studio restacks a lane (move-child) or slots a new one beside its
    // neighbour (add-node after) by reordering containment; the node array
    // keeps creation order
    const m = model();
    const restacked = { ...m, containment: [...m.containment].reverse() };
    const g = geo([
      ['f', { x: 0, y: 0, width: 1, height: 1 }],
      ['l1', { x: 0, y: 0, width: 1, height: 1 }],
      ['l2', { x: 0, y: 0, width: 1, height: 1 }],
    ]);
    const out = arrangeActivityFrames(g, view(restacked), restacked);
    expect(out.get('l2')?.y).toBe(0);
    expect(out.get('l1')?.y).toBe(L.LANE_MIN_H);
  });

  it('stacks empty lanes as MIN-sized bands and wraps the frame', () => {
    const m = model();
    const g = geo([
      ['f', { x: 10, y: 20, width: 1, height: 1 }],
      ['l1', { x: 0, y: 0, width: 1, height: 1 }],
      ['l2', { x: 0, y: 0, width: 1, height: 1 }],
    ]);
    const out = arrangeActivityFrames(g, view(m), m);
    expect(out.get('l1')).toEqual({ x: L.TITLE_STRIP_W, y: 0, width: L.LANE_MIN_W, height: L.LANE_MIN_H });
    expect(out.get('l2')).toEqual({ x: L.TITLE_STRIP_W, y: L.LANE_MIN_H, width: L.LANE_MIN_W, height: L.LANE_MIN_H });
    // frame keeps its hand-placed x/y; only w/h are wrapped
    expect(out.get('f')).toEqual({ x: 10, y: 20, width: L.TITLE_STRIP_W + L.LANE_MIN_W, height: 2 * L.LANE_MIN_H });
  });

  it('grows the lane around content and shares the widest width across lanes', () => {
    // a kid at x=500,w=100 in l1 → right=600, commonW = 600+PAD=624; l2 (empty) gets the same width
    // kid bottom = 100+40 = 140 → l1 height = 140+PAD = 164; l2 (empty) stays at LANE_MIN_H
    // children geometry is NOT touched
    const m = model([{ id: 'k1', parent: 'l1' }]);
    const g = geo([
      ['f', { x: 0, y: 0, width: 1, height: 1 }],
      ['l1', { x: 0, y: 0, width: 1, height: 1 }],
      ['l2', { x: 0, y: 0, width: 1, height: 1 }],
      ['k1', { x: 500, y: 100, width: 100, height: 40 }],
    ]);
    const out = arrangeActivityFrames(g, view(m), m);
    expect(out.get('l1')).toEqual({ x: L.TITLE_STRIP_W, y: 0, width: 624, height: 164 });
    expect(out.get('l2')).toEqual({ x: L.TITLE_STRIP_W, y: 164, width: 624, height: L.LANE_MIN_H });
    expect(out.get('f')).toEqual({ x: 0, y: 0, width: L.TITLE_STRIP_W + 624, height: 284 });
    expect(out.get('k1')).toEqual({ x: 500, y: 100, width: 100, height: 40 });
  });

  it('saved sizes act as minimums', () => {
    // sizes = { l1: { w: 900, h: 400 } } → commonW ≥ 900 (shared by both lanes), l1 height 400
    const m = model();
    const g = geo([
      ['f', { x: 0, y: 0, width: 1, height: 1 }],
      ['l1', { x: 0, y: 0, width: 1, height: 1 }],
      ['l2', { x: 0, y: 0, width: 1, height: 1 }],
    ]);
    const out = arrangeActivityFrames(g, view(m), m, { sizes: { l1: { w: 900, h: 400 } } });
    expect(out.get('l1')).toEqual({ x: L.TITLE_STRIP_W, y: 0, width: 900, height: 400 });
    expect(out.get('l2')).toEqual({ x: L.TITLE_STRIP_W, y: 400, width: 900, height: L.LANE_MIN_H });
    expect(out.get('f')).toEqual({ x: 0, y: 0, width: L.TITLE_STRIP_W + 900, height: 520 });
  });

  it("stacks bands in the viewed plane's containment order", () => {
    const m = twoPlanes();
    const g = geo([
      ['f', { x: 0, y: 0, width: 1, height: 1 }],
      ['l1', { x: 0, y: 0, width: 1, height: 1 }],
      ['l2', { x: 0, y: 0, width: 1, height: 1 }],
    ]);
    const onB = arrangeActivityFrames(g, view(m, 'b'), m, { plane: 'b' });
    expect(onB.get('l2')?.y).toBe(0);
    expect(onB.get('l1')?.y).toBe(L.LANE_MIN_H);
    const onA = arrangeActivityFrames(g, view(m, 'a'), m, { plane: 'a' });
    expect(onA.get('l1')?.y).toBe(0);
  });

  it('arranges two frames independently', () => {
    const m: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'f1', name: 'F1', type: 'activity-frame' },
        { id: 'a1', name: 'A1', type: 'activity-lane' },
        { id: 'a2', name: 'A2', type: 'activity-lane' },
        { id: 'f2', name: 'F2', type: 'activity-frame' },
        { id: 'b1', name: 'B1', type: 'activity-lane' },
        { id: 'b2', name: 'B2', type: 'activity-lane' },
        { id: 'k', name: 'K', type: 'activity-action' },
      ],
      containment: [
        { parent: 'f1', child: 'a1' },
        { parent: 'f1', child: 'a2' },
        { parent: 'f2', child: 'b1' },
        { parent: 'f2', child: 'b2' },
        { parent: 'b1', child: 'k' },
      ],
      relations: [],
      layers: [],
      planes: [],
    };
    const g = geo([
      ['f1', { x: 0, y: 0, width: 1, height: 1 }],
      ['a1', { x: 0, y: 0, width: 1, height: 1 }],
      ['a2', { x: 0, y: 0, width: 1, height: 1 }],
      ['f2', { x: 100, y: 100, width: 1, height: 1 }],
      ['b1', { x: 0, y: 0, width: 1, height: 1 }],
      ['b2', { x: 0, y: 0, width: 1, height: 1 }],
      ['k', { x: 400, y: 50, width: 50, height: 100 }],
    ]);
    const out = arrangeActivityFrames(g, view(m), m);
    // frame 1: empty lanes stay at the MIN band size
    expect(out.get('a1')).toEqual({ x: L.TITLE_STRIP_W, y: 0, width: L.LANE_MIN_W, height: L.LANE_MIN_H });
    expect(out.get('a2')).toEqual({ x: L.TITLE_STRIP_W, y: L.LANE_MIN_H, width: L.LANE_MIN_W, height: L.LANE_MIN_H });
    expect(out.get('f1')).toEqual({ x: 0, y: 0, width: L.TITLE_STRIP_W + L.LANE_MIN_W, height: 2 * L.LANE_MIN_H });
    // frame 2: sized around its own content, unaffected by frame 1's minimums
    expect(out.get('b1')).toEqual({ x: L.TITLE_STRIP_W, y: 0, width: 474, height: 174 });
    expect(out.get('b2')).toEqual({ x: L.TITLE_STRIP_W, y: 174, width: 474, height: L.LANE_MIN_H });
    expect(out.get('f2')).toEqual({ x: 100, y: 100, width: L.TITLE_STRIP_W + 474, height: 294 });
    expect(out.get('k')).toEqual({ x: 400, y: 50, width: 50, height: 100 });
  });

  it("a lane-less frame keeps one empty band's footprint, and still wraps what it holds", () => {
    // A frame straight off the palette (no lanes yet) is an elk leaf sized by its
    // label; a stray dropped into it would shrink it to wrap a 24px dot.
    const m: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'f', name: 'F', type: 'activity-frame' },
        { id: 'g', name: 'G', type: 'activity-frame' },
      ],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const g = geo([
      ['f', { x: 10, y: 20, width: 52, height: 24 }],
      ['g', { x: 0, y: 500, width: 900, height: 300 }],
    ]);
    const out = arrangeActivityFrames(g, view(m), m);
    expect(out.get('f')).toEqual({ x: 10, y: 20, width: L.TITLE_STRIP_W + L.LANE_MIN_W, height: L.LANE_MIN_H });
    expect(out.get('g')).toEqual({ x: 0, y: 500, width: 900, height: 300 });
  });
});

describe('withLaneOrder', () => {
  it("hands the layout a frame's lanes in containment order, not node order", () => {
    const m = model();
    // l2 restacked above l1 (what move-child does): containment says l2 first
    const reordered = { ...m, containment: [m.containment[1]!, m.containment[0]!] };
    const v = view(reordered);
    expect(v.roots[0]!.children.map((c) => c.id)).toEqual(['l1', 'l2']); // the view tree: node order
    expect(withLaneOrder(v, reordered, undefined).roots[0]!.children.map((c) => c.id)).toEqual(['l2', 'l1']);
  });

  it("hands the layout the viewed plane's order when two planes stack the lanes differently", () => {
    const m = twoPlanes();
    expect(withLaneOrder(view(m, 'b'), m, 'b').roots[0]!.children.map((c) => c.id)).toEqual(['l2', 'l1']);
    expect(withLaneOrder(view(m, 'a'), m, 'a').roots[0]!.children.map((c) => c.id)).toEqual(['l1', 'l2']);
  });

  it('orders a borrowing plane by the containment it borrows', () => {
    const m = twoPlanes();
    const borrowing = { ...m, planes: [...m.planes, { id: 'c', name: 'C', containmentOf: 'b' }] };
    expect(withLaneOrder(view(borrowing, 'c'), borrowing, 'c').roots[0]!.children.map((c) => c.id)).toEqual([
      'l2',
      'l1',
    ]);
  });

  it('returns the same view when the order already agrees (it is a cache key)', () => {
    const v = view(model());
    expect(withLaneOrder(v, model(), undefined)).toBe(v);
  });
});

describe('laneDropOffset', () => {
  // three 100px bands: a 0–100, b 100–200, c 200–300 (listed out of order on purpose)
  const lanes = [
    { id: 'c', y: 200, height: 100 },
    { id: 'a', y: 0, height: 100 },
    { id: 'b', y: 100, height: 100 },
  ];

  it('stays put while the lane has not crossed a neighbour’s middle', () => {
    expect(laneDropOffset(lanes, 'a', 40)).toBe(0);
    expect(laneDropOffset(lanes, 'b', 60)).toBe(0);
  });

  it('moves down one slot past the next lane’s middle, and to the end past the last', () => {
    expect(laneDropOffset(lanes, 'a', 120)).toBe(1);
    expect(laneDropOffset(lanes, 'a', 260)).toBe(2);
  });

  it('moves up, clamped at the top', () => {
    expect(laneDropOffset(lanes, 'c', 80)).toBe(-1);
    expect(laneDropOffset(lanes, 'c', -400)).toBe(-2);
  });

  it('is 0 for a lane that is not in the frame', () => {
    expect(laneDropOffset(lanes, 'ghost', 500)).toBe(0);
  });
});
