import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { bowPath, edgePoint, edgeTangent, nearestT, type EdgePathParams } from './edge-geometry';

const horizontal: EdgePathParams = {
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
};

describe('edgePoint / edgeTangent — straight', () => {
  it('starts at the source at t=0', () => {
    expect(edgePoint('straight', horizontal, undefined, 0)).toEqual({ x: 0, y: 0 });
  });

  it('ends at the target at t=1', () => {
    expect(edgePoint('straight', horizontal, undefined, 1)).toEqual({ x: 100, y: 0 });
  });

  it('sits at the midpoint at t=0.5', () => {
    expect(edgePoint('straight', horizontal, undefined, 0.5)).toEqual({ x: 50, y: 0 });
  });

  it('has a unit tangent pointing source→target', () => {
    const tan = edgeTangent('straight', horizontal, undefined, 0.5);
    expect(tan.x).toBeCloseTo(1, 5);
    expect(tan.y).toBeCloseTo(0, 5);
    expect(Math.hypot(tan.x, tan.y)).toBeCloseTo(1, 5);
  });
});

// Both ends attach on their Right side: source's control point faces the
// target (the "natural"/curvature-independent branch of xyflow's
// calculateControlOffset), while target's control point faces *away* from
// the source (the curvature-dependent branch) — an asymmetric control-point
// pair, same as a real feedback-loop CLD edge, so t=0.5 is genuinely
// curvature-sensitive instead of collapsing back onto the chord midpoint.
const loopback: EdgePathParams = {
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  sourcePosition: Position.Right,
  targetPosition: Position.Right,
};

describe('edgePoint / edgeTangent — curved', () => {
  it('starts exactly at the source at t=0', () => {
    expect(edgePoint('curved', loopback, 0.55, 0)).toEqual({ x: 0, y: 0 });
  });

  it('ends exactly at the target at t=1', () => {
    expect(edgePoint('curved', loopback, 0.55, 1)).toEqual({ x: 100, y: 0 });
  });

  it('bows off the straight chord more as curvature increases', () => {
    const straightMid = { x: 50, y: 0 }; // lerp(source, target, 0.5)
    const bowAt = (curvature: number) => {
      const p = edgePoint('curved', loopback, curvature, 0.5);
      return Math.hypot(p.x - straightMid.x, p.y - straightMid.y);
    };
    const low = bowAt(0.1);
    const high = bowAt(0.6);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });

  it('the tangent at the midpoint is a unit vector', () => {
    const tan = edgeTangent('curved', loopback, 0.55, 0.5);
    expect(Math.hypot(tan.x, tan.y)).toBeCloseTo(1, 5);
  });
});

// Symmetric bow: unlike 'curved' (which depends on which side each handle
// faces), the bow only depends on the chord between the two endpoints — a
// perpendicular offset off the straight line, independent of source/target
// Position. Used for CLD, where floating anchors make xyflow's curvature
// param inert (facing handles collapse the bezier to a straight chord).
const facing: EdgePathParams = {
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
};

// perpendicular distance from `p` to the infinite line through `a`→`b`
function perpDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // 2D cross product magnitude / chord length
  return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}

describe('edgePoint / edgeTangent — bow', () => {
  it('starts exactly at the source at t=0', () => {
    const p = edgePoint('bow', facing, 0.55, 0);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('ends exactly at the target at t=1', () => {
    const p = edgePoint('bow', facing, 0.55, 1);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('bows off the straight chord at the midpoint', () => {
    const mid = edgePoint('bow', facing, 0.55, 0.5);
    const dist = perpDistance(mid, { x: facing.sourceX, y: facing.sourceY }, { x: facing.targetX, y: facing.targetY });
    expect(dist).toBeGreaterThan(0);
  });

  it('grows the bow as curvature increases', () => {
    const distAt = (curvature: number) => {
      const mid = edgePoint('bow', facing, curvature, 0.5);
      return perpDistance(mid, { x: facing.sourceX, y: facing.sourceY }, { x: facing.targetX, y: facing.targetY });
    };
    const low = distAt(0.5);
    const high = distAt(1.0);
    expect(high).toBeGreaterThan(low);
  });

  it('flips to the opposite side of the chord when source/target are reversed', () => {
    const reversed: EdgePathParams = {
      ...facing,
      sourceX: facing.targetX,
      sourceY: facing.targetY,
      targetX: facing.sourceX,
      targetY: facing.sourceY,
    };
    const forwardMid = edgePoint('bow', facing, 0.55, 0.5);
    const reversedMid = edgePoint('bow', reversed, 0.55, 0.5);
    // same chord, opposite travel direction → offsets land on opposite sides
    expect(Math.sign(forwardMid.y)).not.toBe(0);
    expect(Math.sign(reversedMid.y)).toBe(-Math.sign(forwardMid.y));
  });

  it('degenerates to a point when source and target coincide (no NaN)', () => {
    const coincident: EdgePathParams = { ...facing, targetX: facing.sourceX, targetY: facing.sourceY };
    const mid = edgePoint('bow', coincident, 0.55, 0.5);
    expect(mid.x).toBeCloseTo(facing.sourceX, 5);
    expect(mid.y).toBeCloseTo(facing.sourceY, 5);
  });

  it('flips the bulge to the opposite side of the chord when side="right"', () => {
    // Same edge direction, only the bulge side changes: the perpendicular
    // offset mirrors across the chord (equal magnitude, opposite sign).
    const left = edgePoint('bow', facing, 0.55, 0.5, 'left');
    const right = edgePoint('bow', facing, 0.55, 0.5, 'right');
    expect(Math.sign(left.y)).not.toBe(0);
    expect(right.y).toBeCloseTo(-left.y, 5);
    // endpoints are unchanged by the flip
    expect(edgePoint('bow', facing, 0.55, 0, 'right')).toEqual(edgePoint('bow', facing, 0.55, 0, 'left'));
  });
});

describe('nearestT', () => {
  it('finds the midpoint of a straight edge and a signed perpendicular', () => {
    const params = { sourceX: 0, sourceY: 0, targetX: 100, targetY: 0, sourcePosition: Position.Right, targetPosition: Position.Left };
    const at = nearestT('straight', params, undefined, { x: 50, y: 0 });
    expect(at.t).toBeCloseTo(0.5, 1);
    const above = nearestT('straight', params, undefined, { x: 50, y: -20 });
    expect(above.perp).toBeGreaterThan(0); // above the line
    const below = nearestT('straight', params, undefined, { x: 50, y: 20 });
    expect(below.perp).toBeLessThan(0);
  });
});

describe('bowPath', () => {
  it('returns an SVG cubic path string from source to target', () => {
    const path = bowPath(facing, 0.55);
    expect(path.startsWith('M')).toBe(true);
    expect((path.match(/C/g) ?? []).length).toBe(1);
  });
});
