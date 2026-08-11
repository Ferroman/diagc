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
    for (const kind of ['box', 'cylinder', 'hexagon'] as const) {
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
    for (const kind of ['box', 'cylinder', 'hexagon'] as const) {
      expect(() => sketchNode(kind, 0, 0, 1, SOLID)).not.toThrow();
      const p = sketchNode(kind, 0, 0, 1, SOLID);
      expect(p.stroke).not.toContain('NaN');
      expect(p.fill).not.toContain('NaN');
    }
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
