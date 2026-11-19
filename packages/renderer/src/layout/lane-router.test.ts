import { describe, expect, it } from 'vitest';
import { columnGaps, obstacleOf, routeLaneEdges, type RouterBox, type RouterEdge } from './lane-router';
import type { Point } from '@diagc/core/internal';

const box = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 40,
  caption?: { width: number; height: number },
): RouterBox => ({
  id,
  x,
  y,
  width,
  height,
  ...(caption !== undefined ? { caption } : {}),
});

/** every segment is horizontal or vertical */
const orthogonal = (pts: Point[]) =>
  pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1]!.x) < 0.5 || Math.abs(p.y - pts[i - 1]!.y) < 0.5);

/** does any segment pass through the rect's interior? */
const hits = (pts: Point[], r: { x: number; y: number; width: number; height: number }) =>
  pts.some((p, i) => {
    if (i === 0) return false;
    const a = pts[i - 1]!;
    const x0 = Math.min(a.x, p.x);
    const x1 = Math.max(a.x, p.x);
    const y0 = Math.min(a.y, p.y);
    const y1 = Math.max(a.y, p.y);
    return x1 > r.x && x0 < r.x + r.width && y1 > r.y && y0 < r.y + r.height;
  });

describe('obstacleOf / columnGaps', () => {
  it('widens a captioned glyph to its caption and hangs the caption below', () => {
    expect(obstacleOf(box('d', 100, 0, 40, 40, { width: 120, height: 20 }))).toEqual({
      x: 60,
      y: 0,
      width: 120,
      height: 60,
    });
  });

  it('finds the x ranges no box reaches at any height', () => {
    const gaps = columnGaps([box('a', 0, 0), box('b', 50, 300), box('c', 300, 100)]);
    // a and b overlap in x (0–150): one column; c is the next
    expect(gaps).toEqual([{ lo: 156, hi: 294 }]);
  });
});

describe('routeLaneEdges', () => {
  it('draws a straight line between neighbours on one row', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 200, 0)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 200, y: 20 },
    ]);
  });

  it('drops down a gap from one lane to the next, clear of a box in between', () => {
    // a top-left, b one column right and two rows down, blocker under a
    const blocker = box('k', 0, 120);
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), blocker, box('b', 250, 240)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    });
    const r = routes.get('e')!;
    expect(orthogonal(r)).toBe(true);
    expect(r[0]).toEqual({ x: 100, y: 20 });
    expect(r[r.length - 1]).toEqual({ x: 250, y: 260 });
    expect(hits(r, blocker)).toBe(false);
  });

  it('crosses several columns along a corridor that is clear', () => {
    // a far left, b far right one band down; m sits on b's row in the middle column
    const m = box('m', 300, 200);
    const { routes, labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), m, box('b', 600, 200)],
      corridors: [150],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true }],
    });
    const r = routes.get('e')!;
    expect(orthogonal(r)).toBe(true);
    expect(hits(r, m)).toBe(false);
    // the label sits on the longest horizontal run
    const spot = labelSpots.get('e')!;
    expect(r.some((p, i) => i > 0 && p.y === spot.y && r[i - 1]!.y === spot.y)).toBe(true);
  });

  it('keeps a route off a glyph caption', () => {
    const glyph = box('g', 150, 60, 40, 40, { width: 160, height: 20 });
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), glyph, box('b', 400, 120)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    });
    const r = routes.get('e');
    if (r !== undefined) expect(hits(r, obstacleOf(glyph))).toBe(false);
  });

  it('spreads links that share a gap', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('c', 0, 100), box('b', 300, 200), box('d', 300, 300)],
      corridors: [],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'cd', from: 'c', to: 'd' },
      ],
    });
    const verticalX = (id: string) => routes.get(id)![1]!.x;
    expect(verticalX('ab')).not.toBe(verticalX('cd'));
  });

  it('honours a left/right fixed side', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 300, 0), box('b', 0, 200)],
      corridors: [],
      edges: [{ id: 'back', from: 'a', to: 'b', fromSide: 'left', toSide: 'right' }],
    });
    const back = routes.get('back')!;
    expect(back[0]).toEqual({ x: 300, y: 20 });
    expect(back[back.length - 1]).toEqual({ x: 100, y: 220 });
  });

  it('leaves a bottom fixed side from under the caption, then turns into the target', () => {
    const glyph = box('g', 0, 0, 40, 40, { width: 160, height: 20 });
    const { routes } = routeLaneEdges({
      boxes: [glyph, box('b', 200, 100)],
      corridors: [],
      edges: [{ id: 'e', from: 'g', to: 'b', fromSide: 'bottom' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 20, y: 60 },
      { x: 20, y: 120 },
      { x: 200, y: 120 },
    ]);
  });

  it('takes a corridor when the one-bend path is blocked', () => {
    // k sits on the target's row between the two
    const k = box('k', 100, 100, 60, 40);
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0, 40, 40), k, box('b', 300, 100)],
      corridors: [80],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'bottom' }],
    });
    const r = routes.get('e')!;
    expect(orthogonal(r)).toBe(true);
    expect(r[0]).toEqual({ x: 20, y: 40 });
    expect(hits(r, k)).toBe(false);
  });

  it('floats a link with fixed sides it cannot route', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 0, 200)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'top', toSide: 'bottom' }],
    });
    expect(routes.has('e')).toBe(false);
  });
});

describe('routeLaneEdges, point by point', () => {
  it('runs out to the gap, down it and in', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('k', 0, 120), box('b', 250, 240)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 175, y: 20 },
      { x: 175, y: 260 },
      { x: 250, y: 260 },
    ]);
  });

  it('crosses on the cheapest clear row and labels the longest horizontal run', () => {
    const { routes, labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('m', 300, 200), box('b', 600, 200)],
      corridors: [150],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 500, y: 20 },
      { x: 500, y: 220 },
      { x: 600, y: 220 },
    ]);
    expect(labelSpots.get('e')).toEqual({ x: 300, y: 20 });
  });

  it('spreads two runs in one gap a step apart, the upper one left', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('c', 0, 100), box('b', 300, 200), box('d', 300, 300)],
      corridors: [],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'cd', from: 'c', to: 'd' },
      ],
    });
    expect(routes.get('ab')).toEqual([
      { x: 100, y: 20 },
      { x: 195, y: 20 },
      { x: 195, y: 220 },
      { x: 300, y: 220 },
    ]);
    expect(routes.get('cd')).toEqual([
      { x: 100, y: 120 },
      { x: 205, y: 120 },
      { x: 205, y: 320 },
      { x: 300, y: 320 },
    ]);
  });

  it('leaves on the left and enters on the right through the gap between', () => {
    const { routes, labelSpots } = routeLaneEdges({
      boxes: [box('a', 300, 0), box('b', 0, 200)],
      corridors: [],
      edges: [{ id: 'back', from: 'a', to: 'b', fromSide: 'left', toSide: 'right', hasLabel: true }],
    });
    expect(routes.get('back')).toEqual([
      { x: 300, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 220 },
      { x: 100, y: 220 },
    ]);
    expect(labelSpots.get('back')).toEqual({ x: 250, y: 20 });
  });

  it('draws a straight line even where no gap separates the two', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 110, 0)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 110, y: 20 },
    ]);
  });

  it('labels a straight line at its middle', () => {
    const { labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 200, 0)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true }],
    });
    expect(labelSpots.get('e')).toEqual({ x: 150, y: 20 });
  });

  it("draws a straight line between ends under a pixel apart, clear along the source's row", () => {
    const { routes, labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('k', 150, 26.3, 50, 20), box('b', 300, 0.6)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 300, y: 20 + 0.6 },
    ]);
    expect(labelSpots.get('e')).toEqual({ x: 200, y: (20 + 20 + 0.6) / 2 });
  });
});

describe('routeLaneEdges, a fixed top or bottom end', () => {
  it('runs across to the target and down into its top side', () => {
    const { routes, labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 300, 200)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', toSide: 'top', hasLabel: true }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 350, y: 20 },
      { x: 350, y: 200 },
    ]);
    expect(labelSpots.get('e')).toEqual({ x: 225, y: 20 });
  });

  it('runs out to the gap and along the corridor nearest the target when the column above it is blocked', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('k', 330, 80, 40, 40), box('b', 300, 200)],
      corridors: [150, 180],
      edges: [{ id: 'e', from: 'a', to: 'b', toSide: 'top' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 100, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 180 },
      { x: 350, y: 180 },
      { x: 350, y: 200 },
    ]);
  });

  it('leaves on the left of a box for the top of one further left', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 300, 0), box('k', 30, 80, 40, 40), box('b', 0, 200), box('z', 180, 300, 20, 20)],
      corridors: [150],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'left', toSide: 'top' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 300, y: 20 },
      { x: 250, y: 20 },
      { x: 250, y: 150 },
      { x: 50, y: 150 },
      { x: 50, y: 200 },
    ]);
  });

  it('enters on the right after a corridor when the row of the target is blocked', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 300, 0, 40, 40), box('k', 150, 200, 60, 40), box('b', 0, 200)],
      corridors: [100],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'right' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 320, y: 40 },
      { x: 320, y: 100 },
      { x: 125, y: 100 },
      { x: 125, y: 220 },
      { x: 100, y: 220 },
    ]);
  });

  it('enters on the right through the nearest gap past the target, skipping a corridor that is blocked', () => {
    const { routes } = routeLaneEdges({
      boxes: [
        box('z', 0, 300, 40, 40),
        box('b', 200, 200),
        box('k', 360, 200, 40, 40),
        box('q', 380, 50, 40, 40),
        box('a', 450, 0, 40, 40),
      ],
      corridors: [100, 70],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'right' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 470, y: 40 },
      { x: 470, y: 100 },
      { x: 330, y: 100 },
      { x: 330, y: 220 },
      { x: 300, y: 220 },
    ]);
  });

  it('runs out of a bottom side, across the middle row and into a top side', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 300, 200)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'top' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 50, y: 40 },
      { x: 50, y: 120 },
      { x: 350, y: 120 },
      { x: 350, y: 200 },
    ]);
  });

  it('takes the nearest clear corridor when the middle row is blocked', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('k', 150, 100, 60, 40), box('b', 300, 200)],
      corridors: [60, 170],
      edges: [{ id: 'e', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'top' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 50, y: 40 },
      { x: 50, y: 170 },
      { x: 350, y: 170 },
      { x: 350, y: 200 },
    ]);
  });
});

describe('routeLaneEdges, links it leaves floating', () => {
  const routed = (boxes: RouterBox[], corridors: number[], edge: Omit<RouterEdge, 'id'>) =>
    routeLaneEdges({ boxes, corridors, edges: [{ id: 'e', ...edge }] }).routes.has('e');

  it('a box linked to itself', () => {
    expect(routed([box('l', 0, 0), box('a', 200, 0), box('r', 400, 0)], [80], { from: 'a', to: 'a' })).toBe(false);
  });

  it('a link whose run out to its gap is blocked', () => {
    expect(routed([box('a', 0, 0), box('k', 110, 0, 20, 40), box('b', 300, 200)], [], { from: 'a', to: 'b' })).toBe(
      false,
    );
  });

  it('a link no row can carry across to the gap beside its target', () => {
    const wall = box('wall', 300, -100, 40, 500);
    expect(routed([box('a', 0, 0), wall, box('b', 600, 200)], [], { from: 'a', to: 'b' })).toBe(false);
  });

  it('a bottom end whose last run into the target is blocked', () => {
    const boxes = [box('a', 0, 0, 40, 40), box('k', 250, 200, 40, 40), box('b', 300, 200)];
    expect(routed(boxes, [120], { from: 'a', to: 'b', fromSide: 'bottom' })).toBe(false);
  });

  it('a top end whose first run out of the source is blocked', () => {
    const boxes = [box('a', 0, 0), box('k', 110, 0, 40, 40), box('b', 300, 200)];
    expect(routed(boxes, [120], { from: 'a', to: 'b', toSide: 'top' })).toBe(false);
  });
});

describe('routeLaneEdges, a link that goes back', () => {
  // a row of three boxes; the pad strips of their lane lie at y 10 and y 110
  const row = [box('a', 0, 40), box('m', 200, 40), box('b', 400, 40)];

  it('leaves sideways, runs back along a corridor and comes in from the side', () => {
    const { routes } = routeLaneEdges({ boxes: row, corridors: [10, 110], edges: [{ id: 'e', from: 'b', to: 'a' }] });
    expect(routes.get('e')).toEqual([
      { x: 450, y: 40 },
      { x: 450, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
    ]);
  });

  it('gives each run in one corridor a place of its own', () => {
    const { routes } = routeLaneEdges({
      boxes: row,
      corridors: [10],
      edges: [
        { id: 'e1', from: 'b', to: 'a' },
        { id: 'e2', from: 'm', to: 'a' },
      ],
    });
    expect(routes.get('e1')![1]!.y).toBe(10);
    expect(routes.get('e2')![1]!.y).toBe(16);
  });

  it('takes the other side when a box stands between the source and the nearer corridor', () => {
    const boxes = [...row, box('over', 400, -40, 100, 40)];
    const { routes } = routeLaneEdges({ boxes, corridors: [-60, 110], edges: [{ id: 'e', from: 'b', to: 'a' }] });
    const pts = routes.get('e')!;
    expect(pts[0]).toEqual({ x: 450, y: 80 });
    expect(pts[1]!.y).toBe(110);
    expect(hits(pts, boxes[3]!)).toBe(false);
  });

  it('is routed forwards where no corridor is clear, and honours a fixed side', () => {
    const none = routeLaneEdges({ boxes: row, corridors: [], edges: [{ id: 'e', from: 'b', to: 'a' }] });
    expect(none.routes.has('e')).toBe(false);
    const fixed = routeLaneEdges({
      boxes: row,
      corridors: [10, 110],
      edges: [{ id: 'e', from: 'b', to: 'a', fromSide: 'left', toSide: 'right' }],
    });
    expect(fixed.routes.get('e')![0]).toEqual({ x: 400, y: 60 });
  });
});

describe('routeLaneEdges, a decision', () => {
  const decision = (id: string, x: number, y: number): RouterBox => ({ ...box(id, x, y, 48, 48), fanOut: true });

  it('sends its branches out of different corners, towards their targets', () => {
    const { routes } = routeLaneEdges({
      boxes: [decision('d', 0, 200), box('up', 200, 0), box('on', 200, 204), box('down', 200, 400)],
      corridors: [],
      edges: [
        { id: 'u', from: 'd', to: 'up' },
        { id: 'o', from: 'd', to: 'on' },
        { id: 'w', from: 'd', to: 'down' },
      ],
    });
    expect(routes.get('u')).toEqual([
      { x: 24, y: 200 },
      { x: 24, y: 20 },
      { x: 200, y: 20 },
    ]);
    expect(routes.get('o')![0]).toEqual({ x: 48, y: 224 });
    expect(routes.get('w')![0]).toEqual({ x: 24, y: 248 });
  });

  it('keeps a single way out forwards, and gives a second branch to one side the front', () => {
    const one = routeLaneEdges({
      boxes: [decision('d', 0, 200), box('up', 200, 0)],
      corridors: [],
      edges: [{ id: 'u', from: 'd', to: 'up' }],
    });
    expect(one.routes.get('u')![0]).toEqual({ x: 48, y: 224 });
    const two = routeLaneEdges({
      boxes: [decision('d', 0, 400), box('far', 200, 0), box('near', 400, 200)],
      corridors: [],
      edges: [
        { id: 'f', from: 'd', to: 'far' },
        { id: 'n', from: 'd', to: 'near' },
      ],
    });
    expect(two.routes.get('f')![0]).toEqual({ x: 24, y: 400 });
    expect(two.routes.get('n')![0]).toEqual({ x: 48, y: 424 });
  });

  it('leaves the corner a loop back took to the loop', () => {
    const { routes } = routeLaneEdges({
      boxes: [box('first', 0, 40), decision('d', 300, 36), box('up', 500, -200)],
      corridors: [-220, 10],
      edges: [
        { id: 'back', from: 'd', to: 'first' },
        { id: 'u', from: 'd', to: 'up' },
      ],
    });
    expect(routes.get('back')![0]).toEqual({ x: 324, y: 36 });
    expect(routes.get('u')![0]).toEqual({ x: 348, y: 60 });
  });
});

describe('routeLaneEdges, a label beside its source', () => {
  const size = { width: 60, height: 16 };

  it('sits at the start of the run out of the box', () => {
    const { labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 400, 0)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true, labelSize: size }],
    });
    expect(labelSpots.get('e')).toEqual({ x: 100 + 6 + 30, y: 20 });
  });

  it('moves past the first bend when the run out of the box is too short', () => {
    const { routes, labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 130, 300)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true, labelSize: size }],
    });
    const bend = routes.get('e')![1]!;
    expect(bend.x - 100).toBeLessThan(size.width);
    // down the run after the bend, as near the bend as it clears the source box
    expect(labelSpots.get('e')).toEqual({ x: bend.x, y: 50 });
  });

  it('slides along the run until it covers no box', () => {
    const { labelSpots } = routeLaneEdges({
      boxes: [box('a', 0, 0), box('b', 600, 0), box('under', 110, 27, 100, 40)],
      corridors: [],
      edges: [{ id: 'e', from: 'a', to: 'b', hasLabel: true, labelSize: size }],
    });
    const spot = labelSpots.get('e')!;
    expect(spot.y).toBe(20);
    expect(spot.x - 30).toBeGreaterThanOrEqual(210);
  });
});

describe('routeLaneEdges, a frame routed flipped', () => {
  it('counts a caption hung on the right as part of the box, and leaves from beyond it', () => {
    const d: RouterBox = { ...box('d', 0, 0, 48, 48), caption: { width: 20, height: 120 }, captionSide: 'right' };
    expect(obstacleOf(d)).toEqual({ x: 0, y: -36, width: 68, height: 120 });
    const { routes } = routeLaneEdges({
      boxes: [d, box('b', 300, 4)],
      corridors: [],
      edges: [{ id: 'e', from: 'd', to: 'b' }],
    });
    expect(routes.get('e')).toEqual([
      { x: 68, y: 24 },
      { x: 300, y: 24 },
    ]);
  });
});
