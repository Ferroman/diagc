import { describe, expect, it } from 'vitest';
import { compileView, model, type CompiledView, type Point } from '@diagc/core/internal';
import type { NodeGeometry } from './layout';
import { centreLevels } from './symmetry';

const geo = (x: number, y: number, width: number, height: number): NodeGeometry => ({ x, y, width, height });
const pts = (...xy: [number, number][]): Point[] => xy.map(([x, y]) => ({ x, y }));

/** a, then b and c below it: a lone box over a full row */
function lopsided(): CompiledView {
  const m = model('sym');
  const a = m.node('a');
  const b = m.node('b');
  const c = m.node('c');
  m.relate(a, b, { kind: 'sync' });
  m.relate(a, c, { kind: 'sync' });
  return compileView(m.toJSON(), {});
}

/** `a` left-aligned over `b … c`: the row of two spans 0..400, `a` sits at 0..100 */
const lopsidedGeometry = () =>
  new Map<string, NodeGeometry>([
    ['a', geo(0, 0, 100, 40)],
    ['b', geo(0, 100, 100, 40)],
    ['c', geo(300, 100, 100, 40)],
  ]);

const edgeId = (view: CompiledView, from: string, to: string): string =>
  view.layoutEdges.find((e) => e.from === from && e.to === to)!.id;

describe('centreLevels', () => {
  it('centres every row of a level on the level’s axis, down the page', () => {
    const out = centreLevels(
      lopsided(),
      { geometry: lopsidedGeometry(), routes: new Map(), labelSpots: new Map() },
      'DOWN',
    );
    // the level spans 0..400, so its axis is 200: `a` (centre 50) moves right by 150
    expect(out.geometry.get('a')).toEqual(geo(150, 0, 100, 40));
    // the row of two already sits on the axis
    expect(out.geometry.get('b')).toEqual(geo(0, 100, 100, 40));
    expect(out.geometry.get('c')).toEqual(geo(300, 100, 100, 40));
  });

  it('moves a route’s points with the rows they start and end in, and bends a straight edge between rows that moved apart', () => {
    const view = lopsided();
    const routes = new Map([[edgeId(view, 'a', 'b'), pts([50, 40], [50, 100])]]);
    const out = centreLevels(view, { geometry: lopsidedGeometry(), routes, labelSpots: new Map() }, 'DOWN');
    // `a` moved by 150, `b` did not: the line leaves `a` where it did, jogs in
    // the gap between the rows, and reaches `b` where it did
    expect(out.routes.get(edgeId(view, 'a', 'b'))).toEqual(pts([200, 40], [200, 70], [50, 70], [50, 100]));
  });

  it('gives a bend in the gap between rows the shift of the row its vertical run comes from', () => {
    const view = lopsided();
    const routes = new Map([[edgeId(view, 'a', 'c'), pts([50, 40], [50, 70], [350, 70], [350, 100])]]);
    const out = centreLevels(view, { geometry: lopsidedGeometry(), routes, labelSpots: new Map() }, 'DOWN');
    expect(out.routes.get(edgeId(view, 'a', 'c'))).toEqual(pts([200, 40], [200, 70], [350, 70], [350, 100]));
  });

  it('centres the inside of an open container on the container’s own axis, in absolute route space', () => {
    const m = model('nested');
    const box = m.node('box');
    const c1 = m.node('c1');
    const c2 = m.node('c2');
    box.contains(c1, c2);
    m.relate(c1, c2, { kind: 'sync' });
    const view = compileView(m.toJSON(), { pins: { box: 'expanded' } });
    const geometry = new Map<string, NodeGeometry>([
      ['box', geo(100, 0, 400, 200)],
      // parent-relative: c1 is a lone box over c2, which spans the content width
      ['c1', geo(20, 40, 100, 40)],
      ['c2', geo(20, 120, 360, 40)],
    ]);
    // absolute: c1's bottom centre (170, 80) straight down to c2's top (170, 120)
    const routes = new Map([[edgeId(view, 'c1', 'c2'), pts([170, 80], [170, 120])]]);
    const out = centreLevels(view, { geometry, routes, labelSpots: new Map() }, 'DOWN');
    // the content spans 20..380 inside the box, so its axis is 200: c1 (centre 70) moves by 130
    expect(out.geometry.get('c1')).toEqual(geo(150, 40, 100, 40));
    expect(out.geometry.get('c2')).toEqual(geo(20, 120, 360, 40));
    expect(out.geometry.get('box')).toEqual(geo(100, 0, 400, 200));
    expect(out.routes.get(edgeId(view, 'c1', 'c2'))).toEqual(pts([300, 80], [300, 100], [170, 100], [170, 120]));
  });

  it('centres columns across the page when the flow runs right', () => {
    const geometry = new Map<string, NodeGeometry>([
      ['a', geo(0, 0, 100, 40)],
      ['b', geo(200, 0, 100, 40)],
      ['c', geo(200, 100, 100, 40)],
    ]);
    const out = centreLevels(lopsided(), { geometry, routes: new Map(), labelSpots: new Map() }, 'RIGHT');
    // the level spans 0..140 down the page, axis 70: `a` (centre 20) moves down by 50
    expect(out.geometry.get('a')).toEqual(geo(0, 50, 100, 40));
    expect(out.geometry.get('b')).toEqual(geo(200, 0, 100, 40));
  });

  it('moves a label spot with the nearest point of its route', () => {
    const view = lopsided();
    const id = edgeId(view, 'a', 'b');
    const routes = new Map([[id, pts([50, 40], [50, 100])]]);
    const labelSpots = new Map([[id, { x: 50, y: 55 }]]);
    const out = centreLevels(view, { geometry: lopsidedGeometry(), routes, labelSpots }, 'DOWN');
    expect(out.labelSpots.get(id)).toEqual({ x: 200, y: 55 });
  });

  it('leaves an arrangement whose rows already sit on the axis as it is', () => {
    const geometry = new Map<string, NodeGeometry>([
      ['a', geo(150, 0, 100, 40)],
      ['b', geo(0, 100, 100, 40)],
      ['c', geo(300, 100, 100, 40)],
    ]);
    const view = lopsided();
    const routes = new Map([[edgeId(view, 'a', 'b'), pts([200, 40], [200, 70], [50, 70], [50, 100])]]);
    const out = centreLevels(view, { geometry, routes, labelSpots: new Map() }, 'DOWN');
    expect([...out.geometry]).toEqual([...geometry]);
    expect([...out.routes]).toEqual([...routes]);
  });
});
