import { describe, expect, it } from 'vitest';
import { seedFrom, sketchNode, sketchEdge, sketchCircle } from './sketch';
import type { RoughStyle } from './stylePresets';

const SOLID: RoughStyle = { roughness: 1.15, bowing: 1, strokeWidth: 1.5, fillStyle: 'solid' };
const HACHURE: RoughStyle = { roughness: 0.9, bowing: 0.8, strokeWidth: 1.2, fillStyle: 'hachure', fillWeight: 0.8, hachureGap: 5 };

describe('seedFrom', () => {
  it('is stable and varies by id', () => {
    expect(seedFrom('a')).toBe(seedFrom('a'));
    expect(seedFrom('a')).not.toBe(seedFrom('b'));
    expect(Number.isInteger(seedFrom('node-1'))).toBe(true);
  });

  it('never returns 0 (rough treats seed 0 as "no seed" and falls back to Math.random)', () => {
    expect(seedFrom('')).toBeGreaterThan(0);
    for (const id of ['a', 'node-1', 'edge-1-2', 'system', String(Math.PI)]) {
      expect(seedFrom(id)).toBeGreaterThan(0);
    }
  });
});

describe('sketchNode', () => {
  it('produces non-empty fill and stroke path data for each shape', () => {
    for (const kind of ['box', 'cylinder', 'hexagon', 'bubble'] as const) {
      const p = sketchNode(kind, 160, 80, 42, SOLID);
      expect(p.stroke.length).toBeGreaterThan(0);
      expect(p.fill.length).toBeGreaterThan(0);
      expect(p.hatch).toBe(''); // solid fills produce no hatch lines
      expect(p.stroke.startsWith('M')).toBe(true);
    }
  });
  it('is deterministic for the same args and differs by seed', () => {
    expect(sketchNode('box', 120, 60, 7, SOLID)).toEqual(sketchNode('box', 120, 60, 7, SOLID));
    expect(sketchNode('box', 120, 60, 7, SOLID).stroke).not.toBe(sketchNode('box', 120, 60, 8, SOLID).stroke);
  });
  it('tolerates zero/degenerate sizes without throwing, for every shape', () => {
    for (const kind of ['box', 'cylinder', 'hexagon', 'bubble'] as const) {
      expect(() => sketchNode(kind, 0, 0, 1, SOLID)).not.toThrow();
      const p = sketchNode(kind, 0, 0, 1, SOLID);
      expect(p.stroke).not.toContain('NaN');
      expect(p.fill).not.toContain('NaN');
    }
  });
  it('sketches a circle inscribed in the box, distinct from the box fallback', () => {
    // Same seed/style/size as the box case below: a fallback to the rectangle
    // path (e.g. a dropped `circle` branch) would make these two identical.
    const style: RoughStyle = { roughness: 1, bowing: 1, strokeWidth: 1.2, fillStyle: 'solid' };
    const circle = sketchNode('circle', 28, 28, 1, style);
    const box = sketchNode('box', 28, 28, 1, style);
    expect(circle.stroke).not.toBe('');
    expect(circle.stroke).not.toBe(box.stroke);
  });
});

/** every y coordinate in rough's path output (commands are all x,y pairs) */
const ys = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_n, i) => i % 2 === 1);

describe('sketchNode bubble', () => {
  it('hangs a tail below the box, so the outline reaches past the node height', () => {
    // The tail is the whole point of the shape: a bubble whose outline stayed
    // inside the box would be indistinguishable from a box.
    const box = sketchNode('box', 160, 80, 42, SOLID);
    const bubble = sketchNode('bubble', 160, 80, 42, SOLID);
    expect(Math.max(...ys(box.stroke))).toBeLessThan(84);
    expect(Math.max(...ys(bubble.stroke))).toBeGreaterThan(86);
  });
  it('keeps the body one closed outline, not a box with a triangle stuck on', () => {
    // Two sub-paths would draw a seam across the tail base and fill twice.
    const d = sketchNode('bubble', 160, 80, 42, SOLID).fill;
    expect((d.match(/M/g) ?? []).length).toBe(1);
  });
});

describe('sketchEdge', () => {
  it('roughens a path deterministically and returns stroke-only geometry', () => {
    const clean = 'M0,0 C50,0 50,100 100,100';
    const a = sketchEdge(clean, 3, SOLID);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(clean); // roughened, not the input
    expect(sketchEdge(clean, 3, SOLID)).toBe(a); // deterministic
    expect(sketchEdge(clean, 4, SOLID)).not.toBe(a); // seed-sensitive
  });

  it('falls back to the original path when rough emits no stroke sub-paths (a bare moveto)', () => {
    // A lone "moveto" has no line segment to roughen — rough.toPaths yields
    // nothing with a `stroke`, which would otherwise blank the edge + marker.
    const bare = 'M5,5';
    expect(sketchEdge(bare, 1, SOLID)).toBe(bare);
  });

  it('draws a single stroke pass, not rough\'s default two overlapping ones', () => {
    // rough.js sketches each line as TWO overlapping passes by default; on a
    // long curved edge (e.g. a CLD bow) the two passes run visibly parallel and
    // read as two separate edges. One pass per edge keeps it a single line.
    const clean = 'M0,0 C50,0 50,100 100,100';
    const subpaths = (sketchEdge(clean, 3, SOLID).match(/M/g) ?? []).length;
    expect(subpaths).toBe(1);
  });
});

describe('sketchCircle', () => {
  it('produces non-empty stroke path data', () => {
    const p = sketchCircle(30, 30, 40, 7, SOLID);
    expect(p.stroke.length).toBeGreaterThan(0);
    expect(p.stroke.startsWith('M')).toBe(true);
  });
  it('is deterministic for the same seed and differs by seed', () => {
    expect(sketchCircle(30, 30, 40, 7, SOLID)).toEqual(sketchCircle(30, 30, 40, 7, SOLID));
    expect(sketchCircle(30, 30, 40, 7, SOLID).stroke).not.toBe(sketchCircle(30, 30, 40, 8, SOLID).stroke);
  });
});

describe('fill styles', () => {
  it('solid puts geometry in fill, hachure puts it in hatch (stroked lines, not polygons)', () => {
    const solid = sketchNode('box', 160, 80, 42, SOLID);
    expect(solid.fill.length).toBeGreaterThan(0);
    expect(solid.hatch).toBe('');
    const hatched = sketchNode('box', 160, 80, 42, HACHURE);
    expect(hatched.hatch.length).toBeGreaterThan(0);
    expect(hatched.fill).toBe('');
    expect(hatched.stroke.length).toBeGreaterThan(0); // outline still present
  });
  it('never leaks sentinel classification into path data', () => {
    const p = sketchNode('box', 160, 80, 42, HACHURE);
    for (const d of [p.fill, p.hatch, p.stroke]) expect(d).not.toContain('sentinel');
  });

  it('puts geometry in hatch (not fill) for every non-solid fill style', () => {
    const nonSolid: RoughStyle['fillStyle'][] = ['hachure', 'cross-hatch', 'zigzag', 'dots'];
    for (const fillStyle of nonSolid) {
      const style: RoughStyle = { roughness: 0.9, bowing: 0.8, strokeWidth: 1.2, fillStyle, fillWeight: 0.8, hachureGap: 5 };
      const p = sketchNode('box', 160, 80, 42, style);
      expect(p.hatch.length).toBeGreaterThan(0);
      expect(p.fill).toBe('');
      expect(p.stroke.length).toBeGreaterThan(0);
    }
  });
});

describe('cornerRadius', () => {
  it('rounds only box shapes; a radius changes the outline geometry', () => {
    const sharp = sketchNode('box', 160, 80, 42, HACHURE);
    const round = sketchNode('box', 160, 80, 42, HACHURE, 14);
    expect(round.stroke).not.toBe(sharp.stroke);
    // a bubble is a box with a tail — it rounds like one
    expect(sketchNode('bubble', 160, 80, 42, HACHURE, 14).stroke).not.toBe(sketchNode('bubble', 160, 80, 42, HACHURE).stroke);
    // cylinder/hexagon ignore the radius entirely
    for (const kind of ['cylinder', 'hexagon'] as const) {
      expect(sketchNode(kind, 160, 80, 42, HACHURE, 14)).toEqual(sketchNode(kind, 160, 80, 42, HACHURE));
    }
  });
  it('a radius larger than the box degrades gracefully (clamped, no NaN)', () => {
    const p = sketchNode('box', 20, 10, 1, SOLID, 50);
    expect(p.stroke).not.toContain('NaN');
  });
});

describe('sketchNode activity shapes', () => {
  // Test with a non-solid style so that the fillStyle: 'solid' overrides
  // in start-dot and end-bullseye make a geometric difference, and bar's
  // solid fill differs from the hachure box's empty fill.
  const STYLE: RoughStyle = { roughness: 1.15, bowing: 1, strokeWidth: 1.5, fillStyle: 'cross-hatch' };
  const box = sketchNode('box', 120, 60, 7, STYLE);

  // Bar shares box's outline stroke (same rectangle geometry and seed), so
  // discrimination is by fill: bar's solid fill vs box's hachure (which leaves fill empty)
  it('bar sketches with solid fill, distinct from hachure box', () => {
    const p = sketchNode('bar', 120, 60, 7, STYLE);
    expect(p.fill).not.toBe('');
    expect(p.fill).not.toBe(box.fill);
  });

  for (const kind of ['diamond', 'start-dot', 'end-bullseye', 'send-signal', 'receive-signal', 'note'] as const) {
    it(`sketches a distinct ${kind}`, () => {
      const p = sketchNode(kind, 120, 60, 7, STYLE);
      expect(p.stroke).not.toBe('');
      expect(p.stroke).not.toBe(box.stroke);
    });
  }
  it('end-bullseye draws two concentric circles (inner solid fill present)', () => {
    const p = sketchNode('end-bullseye', 28, 28, 7, STYLE);
    expect(p.fill).not.toBe('');
  });
});
