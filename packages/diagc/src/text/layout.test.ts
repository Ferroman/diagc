import { describe, expect, it } from 'vitest';
import { compileView, type CompiledView, type DiagramModel, type ViewNode } from '@diagc/core/internal';
import type { CellPoint } from './canvas';
import { boxText, edgeText, type BoxText } from './content';
import { UNICODE } from './glyphs';
import { layoutCells, type BoxGeometry, type TextLayout } from './layout';

function modelOf(extra: Partial<DiagramModel>): DiagramModel {
  return {
    version: 1,
    id: 'm',
    name: 'm',
    nodes: [],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
    ...extra,
  };
}

/** Lays a model out fully unfolded, the way the renderer would hand it over. */
async function laid(model: DiagramModel, direction = 'DOWN'): Promise<{ view: CompiledView; layout: TextLayout }> {
  const pins = Object.fromEntries(model.containment.map((c) => [c.parent, 'expanded' as const]));
  const view = compileView(model, { pins });
  const boxes = new Map<string, BoxText>();
  const walk = (vn: ViewNode): void => {
    boxes.set(vn.id, boxText(vn, { inside: vn.children.length, glyphs: UNICODE }));
    vn.children.forEach(walk);
  };
  view.roots.forEach(walk);
  const labels = new Map(view.layoutEdges.map((e) => [e.id, edgeText(e, UNICODE)]));
  return { view, layout: await layoutCells(view, boxes, direction, labels) };
}

const inside = (p: CellPoint, b: BoxGeometry): boolean =>
  p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const overlap = (a: BoxGeometry, b: BoxGeometry): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** the cell next to `b`, one step outside one of its sides */
const besideOf = (p: CellPoint, b: BoxGeometry): boolean =>
  !inside(p, b) &&
  ((p.x >= b.x && p.x < b.x + b.width && (p.y === b.y - 1 || p.y === b.y + b.height)) ||
    (p.y >= b.y && p.y < b.y + b.height && (p.x === b.x - 1 || p.x === b.x + b.width)));
const routeOf = (layout: TextLayout) => [...layout.routes.values()][0]!;

const pair = modelOf({
  nodes: [
    { id: 'a', name: 'Web' },
    { id: 'b', name: 'Database' },
  ],
  relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
});

describe('layoutCells', () => {
  it('stacks a flow downwards and ends the route on the cell above the target', async () => {
    const { layout } = await laid(pair);
    const a = layout.boxes.get('a')!;
    const b = layout.boxes.get('b')!;
    expect(b.y).toBeGreaterThan(a.y + a.height);
    const end = routeOf(layout).points.at(-1)!;
    expect(end.y).toBe(b.y - 1);
    expect(end.x).toBeGreaterThanOrEqual(b.x);
    expect(end.x).toBeLessThan(b.x + b.width);
    expect(routeOf(layout).points[0]!.y).toBe(a.y + a.height);
  });

  it('lays a flow rightwards when asked', async () => {
    const { layout } = await laid(pair, 'RIGHT');
    const b = layout.boxes.get('b')!;
    expect(routeOf(layout).points.at(-1)!.x).toBe(b.x - 1);
  });

  it('sizes each box as its text asks', async () => {
    const { layout } = await laid(pair);
    expect(layout.boxes.get('b')).toMatchObject({ width: 'Database'.length + 4, height: 3 });
  });

  it('frames a container around its children, with room inside the frame', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'Platform' },
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      containment: [
        { parent: 'p', child: 'a' },
        { parent: 'p', child: 'b' },
      ],
    });
    const { layout } = await laid(model);
    const p = layout.boxes.get('p')!;
    for (const id of ['a', 'b']) {
      const c = layout.boxes.get(id)!;
      expect(c.x).toBeGreaterThan(p.x);
      expect(c.y).toBeGreaterThan(p.y + 1);
      expect(c.x + c.width).toBeLessThan(p.x + p.width);
      expect(c.y + c.height).toBeLessThan(p.y + p.height);
    }
    expect(overlap(layout.boxes.get('a')!, layout.boxes.get('b')!)).toBe(false);
    expect(p.width).toBeGreaterThanOrEqual('Platform'.length + 6);
  });

  it('makes a frame as wide as its title, and no taller than its children need, either way it flows', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'A container with a long title' },
        { id: 'a', name: 'A' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
    });
    for (const direction of ['DOWN', 'UP', 'RIGHT', 'LEFT']) {
      const p = (await laid(model, direction)).layout.boxes.get('p')!;
      expect({ direction, wide: p.width >= 'A container with a long title'.length + 6, height: p.height }).toEqual({
        direction,
        wide: true,
        height: 6,
      });
    }
  });

  it('ends an edge between two containers’ children beside the target child', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'P' },
        { id: 'q', name: 'Q' },
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      containment: [
        { parent: 'p', child: 'a' },
        { parent: 'q', child: 'b' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
    });
    const { layout } = await laid(model);
    const route = routeOf(layout);
    expect(besideOf(route.points.at(-1)!, layout.boxes.get('b')!)).toBe(true);
    expect(besideOf(route.points[0]!, layout.boxes.get('a')!)).toBe(true);
  });

  it('lays out a self-loop, outside its box', async () => {
    const model = modelOf({
      nodes: [{ id: 'a', name: 'Retry' }],
      relations: [{ id: 'r', from: 'a', to: 'a', kind: 'sync' }],
    });
    const { layout } = await laid(model);
    const a = layout.boxes.get('a')!;
    for (const p of routeOf(layout).points) expect(inside(p, a)).toBe(false);
  });

  it('ends an edge between a container and its own child on the container’s frame, every way it flows', async () => {
    for (const [from, to] of [
      ['a', 'p'],
      ['p', 'a'],
    ]) {
      const model = modelOf({
        nodes: [
          { id: 'p', name: 'Platform' },
          { id: 'a', name: 'Api' },
        ],
        containment: [{ parent: 'p', child: 'a' }],
        relations: [{ id: 'r', from: from!, to: to!, kind: 'sync' }],
      });
      for (const direction of ['DOWN', 'UP', 'RIGHT', 'LEFT']) {
        const { layout } = await laid(model, direction);
        const [p, a] = [layout.boxes.get('p')!, layout.boxes.get('a')!];
        const points = routeOf(layout).points;
        const container = from === 'p' ? points[0]! : points.at(-1)!;
        expect({
          direction,
          from,
          points: points.length >= 2,
          onFrame: inside(container, p) && !inside(container, a),
        }).toEqual({
          direction,
          from,
          points: true,
          onFrame: true,
        });
      }
    }
  });

  it('keeps every route orthogonal and every point on the canvas', async () => {
    const model = modelOf({
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase().repeat(4) })),
      relations: [
        { id: 'r1', from: 'a', to: 'b', kind: 'sync' },
        { id: 'r2', from: 'a', to: 'c', kind: 'sync' },
        { id: 'r3', from: 'c', to: 'd', kind: 'sync' },
        { id: 'r4', from: 'd', to: 'a', kind: 'sync' },
      ],
    });
    const { layout } = await laid(model);
    for (const route of layout.routes.values()) {
      for (let i = 1; i < route.points.length; i++) {
        const [p, q] = [route.points[i - 1]!, route.points[i]!];
        expect(p.x === q.x || p.y === q.y).toBe(true);
      }
      for (const p of route.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(layout.width);
        expect(p.y).toBeLessThan(layout.height);
      }
    }
  });

  it('places a label where neither box is', async () => {
    const model = { ...pair, relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', label: 'reads orders' }] };
    const { layout } = await laid(model);
    const label = routeOf(layout).label!;
    expect(label.text).toBe('reads orders');
    for (const id of ['a', 'b']) {
      const box = layout.boxes.get(id)!;
      for (let i = 0; i < label.text.length; i++) expect(inside({ x: label.x + i, y: label.y }, box)).toBe(false);
    }
  });

  it('lays out nothing for an empty view', async () => {
    const { layout } = await laid(modelOf({}));
    expect([layout.width, layout.height, layout.boxes.size]).toEqual([0, 0, 0]);
  });
});
