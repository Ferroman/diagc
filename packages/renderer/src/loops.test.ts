import { describe, expect, it } from 'vitest';
import { absoluteRects, combinePolarities, findLoops, placeLoopLabels, type Loop, type LoopEdgeInput, type NodeRect } from './loops';

function shuffled<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (i + seed) % (i + 1);
    const tmp = a[i];
    a[i] = a[j] as T;
    a[j] = tmp as T;
  }
  return a;
}

describe('combinePolarities', () => {
  it('is defined iff every polarity is defined and agrees', () => {
    expect(combinePolarities([])).toBeUndefined();
    expect(combinePolarities(['+'])).toBe('+');
    expect(combinePolarities(['+', '+', '+'])).toBe('+');
    expect(combinePolarities(['-', '-'])).toBe('-');
  });

  it('yields undefined on any missing polarity or disagreement', () => {
    expect(combinePolarities([undefined])).toBeUndefined();
    expect(combinePolarities(['+', undefined])).toBeUndefined();
    expect(combinePolarities(['+', '-'])).toBeUndefined();
    expect(combinePolarities(['+', '+', '-'])).toBeUndefined();
    // once undefined, a later agreeing edge can't "fix" it
    expect(combinePolarities(['+', undefined, '+'])).toBeUndefined();
    expect(combinePolarities(['+', '-', '+'])).toBeUndefined();
  });
});

describe('findLoops', () => {
  it('finds a single R loop in an all-+ triangle, keyed from the min-id node', () => {
    const edges: LoopEdgeInput[] = [
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ];
    const result = findLoops(edges);
    expect(result.truncated).toBe(false);
    expect(result.loops).toEqual([{ key: 'a→b→c', nodes: ['a', 'b', 'c'], edgeIds: ['e1', 'e2', 'e3'], kind: 'R' }]);
  });

  it('is deterministic regardless of input edge order', () => {
    const edges: LoopEdgeInput[] = [
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ];
    const inOrder = findLoops(edges);
    const shuffledOrder = findLoops(shuffled(edges, 7));
    expect(shuffledOrder).toEqual(inOrder);
  });

  it('classifies one "-" arc as B (odd count)', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '-' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ]);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]?.kind).toBe('B');
  });

  it('classifies two "-" arcs as R (even count)', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '-' },
      { id: 'e2', from: 'b', to: 'c', polarity: '-' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ]);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]?.kind).toBe('R');
  });

  it('classifies a 2-node loop with one "-" as B, and with none as R', () => {
    const b = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '-' },
      { id: 'e2', from: 'b', to: 'a', polarity: '+' },
    ]);
    expect(b.loops).toEqual([{ key: 'a→b', nodes: ['a', 'b'], edgeIds: ['e1', 'e2'], kind: 'B' }]);

    const r = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'a', polarity: '+' },
    ]);
    expect(r.loops).toEqual([{ key: 'a→b', nodes: ['a', 'b'], edgeIds: ['e1', 'e2'], kind: 'R' }]);
  });

  it('finds two distinct loops in a figure-eight sharing one node', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
      { id: 'e4', from: 'a', to: 'd', polarity: '+' },
      { id: 'e5', from: 'd', to: 'e', polarity: '+' },
      { id: 'e6', from: 'e', to: 'a', polarity: '+' },
    ]);
    expect(result.truncated).toBe(false);
    expect(result.loops.map((l) => l.key).sort()).toEqual(['a→b→c', 'a→d→e']);
  });

  it('keeps both orientations of a triangle as distinct loops (reflections not deduped)', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
      { id: 'e4', from: 'a', to: 'c', polarity: '+' },
      { id: 'e5', from: 'c', to: 'b', polarity: '+' },
      { id: 'e6', from: 'b', to: 'a', polarity: '+' },
    ]);
    const threeCycles = result.loops.filter((l) => l.nodes.length === 3).map((l) => l.key);
    expect(threeCycles.sort()).toEqual(['a→b→c', 'a→c→b']);
  });

  it('marks a loop unknown when parallel arcs on the same (from,to) disagree in polarity', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e1b', from: 'a', to: 'b', polarity: '-' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ]);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]?.kind).toBe('unknown');
  });

  it('classifies normally when parallel arcs on the same (from,to) agree in polarity', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '-' },
      { id: 'e1b', from: 'a', to: 'b', polarity: '-' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ]);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]?.kind).toBe('B');
  });

  it('marks a loop unknown when any arc has undefined polarity', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ]);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]?.kind).toBe('unknown');
  });

  it('treats a self-loop as a length-1 loop, classified by its own polarity', () => {
    const result = findLoops([{ id: 'e1', from: 'a', to: 'a', polarity: '-' }]);
    expect(result.loops).toEqual([{ key: 'a', nodes: ['a'], edgeIds: ['e1'], kind: 'B' }]);
  });

  it('returns no loops for a DAG', () => {
    const result = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
    ]);
    expect(result).toEqual({ loops: [], truncated: false });
  });

  it('caps output at maxLoops, keeping the shortest loops on overflow, deterministically', () => {
    // Hub 'a' bidirectionally wired to b,c,d,e,f (5 disjoint 2-cycles) plus one
    // extra b<->c chord (a 6th 2-cycle + a 3-cycle pair). Full enumeration
    // (maxLoops well above the total) is NOT truncated, so this graph's raw
    // set is proven complete — the maxLoops:5 cap is then provably just
    // "keep the 5 shortest of a fully-known set", not order-dependent.
    const pairs: [string, string][] = [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['a', 'e'],
      ['a', 'f'],
      ['b', 'c'],
    ];
    const edges: LoopEdgeInput[] = [];
    let n = 0;
    for (const [x, y] of pairs) {
      edges.push({ id: `e${n++}`, from: x, to: y, polarity: '+' });
      edges.push({ id: `e${n++}`, from: y, to: x, polarity: '+' });
    }

    const full = findLoops(edges, { maxLoops: 50 });
    expect(full.truncated).toBe(false);
    expect(full.loops).toHaveLength(8); // 6 two-cycles + 2 three-cycles

    const capped = findLoops(edges, { maxLoops: 5 });
    expect(capped.truncated).toBe(true);
    expect(capped.loops).toHaveLength(5);
    expect(capped.loops.every((l) => l.nodes.length === 2)).toBe(true);
    expect(capped.loops.map((l) => l.key)).toEqual(['a→b', 'a→c', 'a→d', 'a→e', 'a→f']);

    const cappedShuffled = findLoops(shuffled(edges, 5), { maxLoops: 5 });
    expect(cappedShuffled).toEqual(capped);
  });

  it('does not throw and reports truncated on a tiny budget', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const edges: LoopEdgeInput[] = [];
    let n = 0;
    for (const i of ids) for (const j of ids) if (i !== j) edges.push({ id: `e${n++}`, from: i, to: j, polarity: '+' });

    expect(() => findLoops(edges, { budget: 5 })).not.toThrow();
    const result = findLoops(edges, { budget: 5 });
    expect(result.truncated).toBe(true);
  });

  it('keeps every shortest loop even when the graph has far more loops than the kept count', () => {
    // K7: 7 nodes fully bidirectionally connected → 21 two-cycles plus hundreds
    // of longer loops (well past the old 200-loop enumeration cap). Enumeration
    // must not stop in start-node order, or short loops rooted at high-id nodes
    // (e.g. a 2-cycle on the last two nodes) vanish. All 21 two-cycles are the
    // shortest loops, so every one must survive the maxLoops keep.
    const ids = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    const edges: LoopEdgeInput[] = [];
    let n = 0;
    for (const i of ids) for (const j of ids) if (i !== j) edges.push({ id: `e${n++}`, from: i, to: j, polarity: '+' });
    const { loops } = findLoops(edges);
    const twoCycles = loops.filter((l) => l.nodes.length === 2);
    expect(twoCycles).toHaveLength(21); // C(7,2) mutual pairs — none dropped by the cap
    // and specifically the pair on the last two nodes (rooted latest) is kept
    expect(twoCycles.some((l) => l.key === 'n5→n6')).toBe(true);
  });

  it('finds no loops when maxLength is shorter than the only cycle', () => {
    const result = findLoops(
      [
        { id: 'e1', from: 'a', to: 'b', polarity: '+' },
        { id: 'e2', from: 'b', to: 'c', polarity: '+' },
        { id: 'e3', from: 'c', to: 'a', polarity: '+' },
      ],
      { maxLength: 2 },
    );
    expect(result).toEqual({ loops: [], truncated: false });
  });
});

describe('placeLoopLabels', () => {
  const triangleLoop = () =>
    findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
    ]).loops;

  it('places a triangle label off the top-right corner of its anchor node, cw when the winding is clockwise on screen', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      ['c', { x: 50, y: 100, width: 20, height: 20 }],
    ]);
    // anchored by node 'a' (the loop's canonical first node): a.x+a.width+15+6=41, a.y-15-6=-21
    const placements = placeLoopLabels(triangleLoop(), rects);
    expect(placements).toEqual([{ key: 'a→b→c', kind: 'R', x: 41, y: -21, direction: 'cw' }]);
  });

  it('flips direction to ccw when member order winds counterclockwise on screen', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 50, y: 100, width: 20, height: 20 }],
      ['c', { x: 100, y: 0, width: 20, height: 20 }],
    ]);
    const placements = placeLoopLabels(triangleLoop(), rects);
    expect(placements[0]?.direction).toBe('ccw');
  });

  it('nudges deterministically off an obstacle that covers the raw anchor corner', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      ['c', { x: 50, y: 100, width: 20, height: 20 }],
    ]);
    // an obstacle sitting on a's anchor corner (~41,-21) forces a nudge; the ring
    // search tries due north one gap-step (36px) out next, clearing it.
    const blocker: NodeRect = { x: 30, y: -30, width: 22, height: 22 };
    const placements = placeLoopLabels(triangleLoop(), rects, { obstacles: [blocker] });
    expect(placements).toEqual([{ key: 'a→b→c', kind: 'R', x: 41, y: -57, direction: 'cw' }]);
  });

  it('keeps two loops sharing two of three nodes at least minLabelGap apart', () => {
    const loops = findLoops([
      { id: 'e1', from: 'a', to: 'b', polarity: '+' },
      { id: 'e2', from: 'b', to: 'c', polarity: '+' },
      { id: 'e3', from: 'c', to: 'a', polarity: '+' },
      { id: 'e4', from: 'b', to: 'd', polarity: '+' },
      { id: 'e5', from: 'd', to: 'a', polarity: '+' },
    ]).loops;
    // c and d sit almost on top of each other, so the two loops' natural
    // centroids start out well under the 36px gap.
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      ['c', { x: 50, y: 80, width: 20, height: 20 }],
      ['d', { x: 52, y: 82, width: 20, height: 20 }],
    ]);
    const placements = placeLoopLabels(loops, rects, { obstacles: [] });
    expect(placements).toHaveLength(2);
    const [p0, p1] = placements;
    const gap = Math.hypot((p0?.x ?? 0) - (p1?.x ?? 0), (p0?.y ?? 0) - (p1?.y ?? 0));
    expect(gap).toBeGreaterThanOrEqual(36);
  });

  it('fans many co-located loops out to honor a large label gap (dense-CLD declutter)', () => {
    // Interlocking loops through shared hub nodes all share one centroid. With a
    // badge-sized gap the two-ring search would run out of room and stack the
    // overflow; the placement must keep fanning out so nothing overlaps.
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      ['c', { x: 50, y: 100, width: 20, height: 20 }],
    ]);
    const loops: Loop[] = Array.from({ length: 16 }, (_, i) => ({
      key: `k${String(i).padStart(2, '0')}`,
      nodes: ['a', 'b', 'c'],
      edgeIds: [],
      kind: 'R',
    }));
    const gap = 56;
    const placements = placeLoopLabels(loops, rects, { obstacles: [], minLabelGap: gap });
    expect(placements).toHaveLength(16);
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const d = Math.hypot(
          (placements[i]?.x ?? 0) - (placements[j]?.x ?? 0),
          (placements[i]?.y ?? 0) - (placements[j]?.y ?? 0),
        );
        expect(d).toBeGreaterThanOrEqual(gap);
      }
    }
  });

  it('falls back to the centroid (overlap accepted) when every candidate is blocked', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      ['c', { x: 50, y: 100, width: 20, height: 20 }],
    ]);
    const hugeObstacle: NodeRect = { x: -1000, y: -1000, width: 2000, height: 2000 };
    const placements = placeLoopLabels(triangleLoop(), rects, { obstacles: [hugeObstacle] });
    // every candidate is blocked, so it falls back to the raw anchor corner (41,-21)
    expect(placements).toEqual([{ key: 'a→b→c', kind: 'R', x: 41, y: -21, direction: 'cw' }]);
  });

  it('omits a loop when a member node has no rect (unmeasured)', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      // 'c' missing — never measured
    ]);
    expect(placeLoopLabels(triangleLoop(), rects)).toEqual([]);
  });

  it('may place a label inside an expanded-container rect the caller excludes from obstacles', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, width: 20, height: 20 }],
      ['b', { x: 100, y: 0, width: 20, height: 20 }],
      ['c', { x: 40, y: 20, width: 40, height: 40 }], // e.g. an expanded container, geometrically covers the centroid
    ]);
    const cRect = rects.get('c');
    const aRect = rects.get('a');
    const bRect = rects.get('b');
    expect(cRect).toBeDefined();
    expect(aRect).toBeDefined();
    expect(bRect).toBeDefined();
    const obstaclesExcludingC = [aRect as NodeRect, bRect as NodeRect];
    const placements = placeLoopLabels(triangleLoop(), rects, { obstacles: obstaclesExcludingC });
    // The anchor corner off node 'a' (41,-21) is accepted; only a and b are
    // obstacles and neither covers it.
    expect(placements).toEqual([{ key: 'a→b→c', kind: 'R', x: 41, y: -21, direction: 'cw' }]);
  });
});

describe('absoluteRects', () => {
  it('resolves a parentId chain to absolute offsets', () => {
    const rects = absoluteRects([
      { id: 'grandparent', position: { x: 10, y: 10 }, measured: { width: 300, height: 300 } },
      { id: 'parent', position: { x: 5, y: 5 }, parentId: 'grandparent', measured: { width: 100, height: 100 } },
      { id: 'child', position: { x: 2, y: 2 }, parentId: 'parent', measured: { width: 20, height: 20 } },
    ]);
    expect(rects.get('grandparent')).toEqual({ x: 10, y: 10, width: 300, height: 300 });
    expect(rects.get('parent')).toEqual({ x: 15, y: 15, width: 100, height: 100 });
    expect(rects.get('child')).toEqual({ x: 17, y: 17, width: 20, height: 20 });
  });

  it('skips nodes missing measured width/height', () => {
    const rects = absoluteRects([
      { id: 'a', position: { x: 0, y: 0 }, measured: { width: 10, height: 10 } },
      { id: 'b', position: { x: 5, y: 5 } }, // no measured
      { id: 'c', position: { x: 5, y: 5 }, measured: { width: 10 } }, // height missing
    ]);
    expect(rects.has('a')).toBe(true);
    expect(rects.has('b')).toBe(false);
    expect(rects.has('c')).toBe(false);
  });
});
