import { describe, expect, it } from 'vitest';
import { compileView, type DiagramModel } from '@diagramming/core';
import { ACTIVITY_LAYOUT as L, arrangeActivityFrames } from './activity-frame';

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

const view = (m: DiagramModel) =>
  compileView(m, { pins: Object.fromEntries(m.nodes.map((n) => [n.id, 'expanded' as const])) });

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
    const out = arrangeActivityFrames(g, view(m), m, { l1: { w: 900, h: 400 } });
    expect(out.get('l1')).toEqual({ x: L.TITLE_STRIP_W, y: 0, width: 900, height: 400 });
    expect(out.get('l2')).toEqual({ x: L.TITLE_STRIP_W, y: 400, width: 900, height: L.LANE_MIN_H });
    expect(out.get('f')).toEqual({ x: 0, y: 0, width: L.TITLE_STRIP_W + 900, height: 520 });
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
});
