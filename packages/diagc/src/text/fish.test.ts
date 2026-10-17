import { describe, expect, it } from 'vitest';
import { compileView, model, type DiagramModel, type ViewNode } from '@diagc/core/internal';
import type { CellPoint } from './canvas';
import { boxText, type BoxText } from './content';
import { FISH, fishCells } from './fish';
import { UNICODE } from './glyphs';
import type { BoxGeometry, TextLayout } from './layout';

/** The fish laid out in cells, with what a test needs to find its parts. */
function laid(fish: DiagramModel): TextLayout & { edge: (from: string, to: string) => CellPoint[] } {
  const view = compileView(fish, { pins: {} });
  const boxes = new Map<string, BoxText>();
  const walk = (vn: ViewNode): void => {
    boxes.set(vn.id, boxText(vn, { inside: 0, glyphs: UNICODE, notation: 'fishbone' }));
    vn.children.forEach(walk);
  };
  view.roots.forEach(walk);
  const layout = fishCells(fish, view, boxes);
  const edge = (from: string, to: string): CellPoint[] => {
    const e = view.edges.find((x) => x.from === from && x.to === to)!;
    return layout.routes.get(e.id)!.points;
  };
  return { ...layout, edge };
}

/** The starter's fish: six categories, three of them with causes, one with a sub-cause. */
function starter(): DiagramModel {
  const m = model('outage', { name: 'Outage' });
  const fb = m.fishbone('outage', 'Checkout outage on release day');
  const { people, process, code } = fb.categories('Software');
  people!.cause('on-call', 'On-call engineer new to checkout');
  process!.cause('no-freeze', 'No change freeze on release day');
  code!.cause('migration', 'Untested schema migration').cause('no-fixture', 'No fixture with real order data');
  return m.toJSON();
}

const box = (layout: TextLayout, id: string): BoxGeometry => layout.boxes.get(id)!;
const inside = (p: CellPoint, b: BoxGeometry): boolean =>
  p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const overlap = (a: BoxGeometry, b: BoxGeometry): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** every cell a route passes, but the end of a slanted one, which is the line it meets */
function cellsOf(points: readonly CellPoint[]): CellPoint[] {
  const cells: CellPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    const slanted = a.x !== b.x && a.y !== b.y;
    for (let s = 0; s <= steps - (slanted ? 1 : 0); s++) {
      cells.push({ x: a.x + Math.sign(b.x - a.x) * s, y: a.y + Math.sign(b.y - a.y) * s });
    }
  }
  return cells;
}

describe('fishCells', () => {
  it('sets the categories alternately above and below the spine, two to a column, left to right, the head last', () => {
    const fish = laid(starter());
    const spine = fish.fish!.spine.y;
    const join = (category: string): number => fish.edge(category, 'outage').at(-1)!.x;
    for (const id of ['people', 'requirements', 'infrastructure']) expect(box(fish, id).y).toBeLessThan(spine);
    for (const id of ['process', 'code', 'dependencies']) expect(box(fish, id).y).toBeGreaterThan(spine);
    expect([join('people'), join('requirements'), join('infrastructure')]).toEqual([
      join('process'),
      join('code'),
      join('dependencies'),
    ]);
    expect(join('people')).toBeLessThan(join('requirements'));
    expect(join('requirements')).toBeLessThan(join('infrastructure'));
    const head = box(fish, 'outage');
    expect(head.x).toBeGreaterThan(join('infrastructure'));
    expect(spine).toBeGreaterThan(head.y);
    expect(spine).toBeLessThan(head.y + head.height - 1);
    expect(fish.fish!.spine).toEqual({ y: spine, from: 0, to: head.x });
  });

  it('slants each bone in to the spine one cell a row, from under its label', () => {
    const fish = laid(starter());
    const spine = fish.fish!.spine.y;
    for (const id of ['people', 'process', 'requirements', 'code', 'infrastructure', 'dependencies']) {
      const [top, end] = fish.edge(id, 'outage');
      const label = box(fish, id);
      expect(end!.y).toBe(spine);
      expect(Math.abs(end!.y - top!.y)).toBe(end!.x - top!.x);
      // the label is the row past the bone's top, over where the bone would go on
      expect(label.y).toBe(top!.y + Math.sign(top!.y - spine));
      expect(top!.x - 1).toBeGreaterThanOrEqual(label.x);
      expect(top!.x - 1).toBeLessThan(label.x + label.width);
      expect(label.height).toBe(1);
    }
  });

  it('hangs a cause on a line that meets its bone, its words a space before the line', () => {
    const fish = laid(starter());
    for (const [cause, category] of [
      ['on-call', 'people'],
      ['no-freeze', 'process'],
      ['migration', 'code'],
    ] as const) {
      const [start, end] = fish.edge(cause, category);
      expect(start!.y).toBe(end!.y);
      // the bone passes the cell after the line's end
      expect(cellsOf(fish.edge(category, 'outage'))).toContainEqual({ x: end!.x + 1, y: end!.y });
      const words = box(fish, cause);
      expect(words.x + words.width).toBe(start!.x - 1);
      expect(inside({ x: words.x + words.width - 1, y: start!.y }, words)).toBe(true);
    }
  });

  it('puts a sub-cause’s words past its cause’s line, on a tick that meets the line', () => {
    const fish = laid(starter());
    const [head, foot] = fish.edge('no-fixture', 'migration');
    const line = fish.edge('migration', 'code');
    expect([Math.abs(foot!.x - head!.x), Math.abs(foot!.y - head!.y)]).toEqual([1, 1]);
    expect(cellsOf(line)).toContainEqual(foot);
    // below the spine, past the line is further down
    expect(head!.y).toBe(line[0]!.y + 1);
    const words = box(fish, 'no-fixture');
    expect([words.y, words.x + words.width]).toEqual([head!.y, head!.x - 1]);
  });

  it('wraps a long cause and keeps every word clear of every other and of every line', () => {
    const m = model('long', { name: 'Long' });
    const fb = m.fishbone('effect', 'Checkout p95 over five seconds at peak');
    const { people, process, code } = fb.categories('Software');
    people!.cause('a', 'A cause whose name runs on well past what one line of a box shows');
    people!.cause('b', 'Short').cause('b1', 'Its sub-cause');
    process!.cause('c', 'Another rather long cause name, wrapped').cause('c1', 'One');
    code!.cause('d', 'Third');
    const fish = laid(m.toJSON());
    expect(box(fish, 'a').height).toBeGreaterThan(1);
    const boxes = [...fish.boxes.entries()];
    for (const [i, [a, ga]] of boxes.entries()) {
      for (const [b, gb] of boxes.slice(i + 1))
        expect({ a, b, overlap: overlap(ga, gb) }).toEqual({ a, b, overlap: false });
    }
    for (const [id, route] of fish.routes) {
      for (const cell of cellsOf(route.points)) {
        for (const [b, g] of boxes) expect({ id, b, inside: inside(cell, g) }).toEqual({ id, b, inside: false });
      }
    }
  });

  it('sets what is not on the fish in a row under it, as boxes', () => {
    const fish = starter();
    const loose = { ...fish, nodes: [...fish.nodes, { id: 'loose', name: 'Nothing hangs this', type: 'fb-cause' }] };
    const layout = laid(loose);
    const lowest = Math.max(...[...layout.boxes].filter(([id]) => id !== 'loose').map(([, g]) => g.y + g.height));
    expect(box(layout, 'loose').y).toBeGreaterThan(lowest);
    expect(box(layout, 'loose').height).toBe(3);
    expect(layout.fish!.words.has('loose')).toBe(false);
  });

  it('gives a head with no bones yet a stub of spine', () => {
    const m = model('bare', { name: 'Bare' });
    m.fishbone('outage', 'Outage');
    const fish = laid(m.toJSON());
    const head = box(fish, 'outage');
    expect(fish.fish!.spine).toEqual({ y: head.y + 1, from: 0, to: head.x });
    expect(head.x).toBe(FISH.COLUMN_GAP + 1);
  });

  it('is a row of boxes, and no fish, without an effect', () => {
    const fish = starter();
    const headless = { ...fish, nodes: fish.nodes.filter((n) => n.id !== 'outage') };
    const layout = laid(headless);
    expect(layout.fish).toBeUndefined();
    expect(new Set([...layout.boxes.values()].map((g) => g.y))).toEqual(new Set([0]));
    expect(layout.routes.size).toBe(0);
  });
});
