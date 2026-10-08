import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagc/core/internal';
import { removeOverlaps, separate } from './overlap';
import { CONTAINER_PAD } from './layout-graph';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** every pair at least `gap` apart on one axis, to the half pixel the pass works to */
function clear(boxes: readonly Box[], gap: number): boolean {
  return boxes.every((a, i) =>
    boxes
      .slice(i + 1)
      .every(
        (b) =>
          Math.min(a.x + a.width, b.x + b.width) + gap - Math.max(a.x, b.x) <= 0.5 ||
          Math.min(a.y + a.height, b.y + b.height) + gap - Math.max(a.y, b.y) <= 0.5,
      ),
  );
}

describe('separate', () => {
  it('leaves boxes that already clear the gap alone', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 200, y: 0, width: 100, height: 40 },
    ];
    expect(separate(boxes, 40)).toBe(false);
    expect(boxes[1]!.x).toBe(200);
  });

  it('pushes a pair apart along the cheaper axis, both boxes by half', () => {
    // wide boxes stacked a little: moving apart vertically costs far less
    const a = { x: 0, y: 0, width: 140, height: 40 };
    const b = { x: 10, y: 20, width: 140, height: 40 };
    expect(separate([a, b], 10)).toBe(true);
    expect(a.x).toBe(0);
    expect(b.x).toBe(10);
    expect(b.y - (a.y + a.height)).toBeCloseTo(10);
    expect(a.y).toBeCloseTo(-15);
  });

  it('untangles a pile of points into boxes that clear each other', () => {
    // stress's failure mode: every node at (almost) the same spot
    const boxes = Array.from({ length: 12 }, (_, i) => ({ x: i % 3, y: i % 4, width: 140, height: 48 }));
    separate(boxes, 40);
    expect(clear(boxes, 40)).toBe(true);
  });

  it('is deterministic', () => {
    const pile = () =>
      Array.from({ length: 8 }, (_, i) => ({ x: (i * 7) % 5, y: (i * 3) % 4, width: 120, height: 40 }));
    const a = pile();
    const b = pile();
    separate(a, 20);
    separate(b, 20);
    expect(a).toEqual(b);
  });
});

describe('removeOverlaps', () => {
  it('separates inside a container first, then grows it to hold what moved', () => {
    const m = model('ov');
    m.node('g', { name: 'Group' }).contains(m.node('a'), m.node('b'));
    m.node('c');
    const view = compileView(m.toJSON(), { focus: ['g'] });
    const geometry = new Map<string, Box>([
      ['g', { x: 0, y: 0, width: 200, height: 100 }],
      ['a', { x: 20, y: 40, width: 140, height: 40 }],
      ['b', { x: 30, y: 45, width: 140, height: 40 }],
      ['c', { x: 150, y: 50, width: 140, height: 40 }],
    ]);
    expect(removeOverlaps(view, geometry, 40)).toBe(true);
    const [g, a, b, c] = ['g', 'a', 'b', 'c'].map((id) => geometry.get(id)!);
    expect(clear([a!, b!], 40)).toBe(true);
    // children start at the padding, and the group holds them
    expect(Math.min(a!.x, b!.x)).toBe(CONTAINER_PAD.left);
    expect(Math.min(a!.y, b!.y)).toBe(CONTAINER_PAD.top);
    expect(g!.height).toBeGreaterThanOrEqual(Math.max(a!.y + a!.height, b!.y + b!.height) + CONTAINER_PAD.bottom);
    // ...and the group, at its new size, clears its sibling
    expect(clear([g!, c!], 40)).toBe(true);
  });

  it('reports nothing moved on a clean layout', () => {
    const m = model('ok');
    m.node('a');
    m.node('b');
    const geometry = new Map<string, Box>([
      ['a', { x: 0, y: 0, width: 100, height: 40 }],
      ['b', { x: 300, y: 0, width: 100, height: 40 }],
    ]);
    expect(removeOverlaps(compileView(m.toJSON(), {}), geometry, 40)).toBe(false);
  });
});
