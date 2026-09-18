import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import {
  bowPath,
  edgePoint,
  edgeTangent,
  nearestOnCurve,
  nearestOnRoute,
  nearestT,
  roundedRoute,
  routeCurve,
  routeEndSides,
  shapeCurve,
  snapRouteEnds,
  tidyRoute,
  type EdgePathParams,
} from './edge-geometry';

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

// A Z-shaped route: a 10px stub, a 100px jog, a 90px leg — 200px in all.
const Z = [
  { x: 0, y: 0 },
  { x: 0, y: 10 },
  { x: 100, y: 10 },
  { x: 100, y: 100 },
];

describe('routeCurve', () => {
  it('is parametrised by arc length, not by waypoint', () => {
    const c = routeCurve(Z);
    expect(c.point(0)).toEqual({ x: 0, y: 0 });
    expect(c.point(1)).toEqual({ x: 100, y: 100 });
    // halfway along 200px is 90px into the jog — NOT the middle waypoint
    expect(c.point(0.5)).toEqual({ x: 90, y: 10 });
    expect(c.point(0.025)).toEqual({ x: 0, y: 5 });
  });

  it('gives the unit tangent of the leg t falls on', () => {
    const c = routeCurve(Z);
    expect(c.tangent(0.01)).toEqual({ x: 0, y: 1 });
    expect(c.tangent(0.5)).toEqual({ x: 1, y: 0 });
    expect(c.tangent(0.99)).toEqual({ x: 0, y: 1 });
  });

  it('survives degenerate routes', () => {
    expect(routeCurve([{ x: 3, y: 4 }]).point(0.5)).toEqual({ x: 3, y: 4 });
    const flat = routeCurve([{ x: 3, y: 4 }, { x: 3, y: 4 }]);
    expect(flat.point(0.5)).toEqual({ x: 3, y: 4 });
    expect(flat.tangent(0.5)).toEqual({ x: 0, y: 0 });
    // a zero-length leg in the middle is skipped, not divided by
    const c = routeCurve([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(c.point(0.5)).toEqual({ x: 5, y: 0 });
  });
});

describe('nearestOnCurve', () => {
  it('projects onto a route and reports which side of it the point is on', () => {
    const hit = nearestOnCurve(routeCurve(Z), { x: 50, y: 0 }, 200);
    expect(hit.t).toBeCloseTo(0.3, 2); // 60px of 200 along
    expect(hit.perp).toBeCloseTo(10, 5); // above the jog
    expect(nearestOnCurve(routeCurve(Z), { x: 50, y: 25 }, 200).perp).toBeCloseTo(-15, 5);
  });

  it('agrees with nearestT on a floating shape', () => {
    const viaCurve = nearestOnCurve(shapeCurve('straight', horizontal, undefined), { x: 40, y: -12 });
    expect(viaCurve).toEqual(nearestT('straight', horizontal, undefined, { x: 40, y: -12 }));
  });
});

describe('nearestOnRoute', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 200, y: 100 },
  ];
  it('drops a point beside a leg straight onto it', () => {
    expect(nearestOnRoute(route, { x: 11, y: 40 })).toEqual({ x: 0, y: 40 });
    expect(nearestOnRoute(route, { x: 120, y: 93 })).toEqual({ x: 120, y: 100 });
  });
  it('is exact, not sampled: a point already on the line comes back unchanged', () => {
    expect(nearestOnRoute(route, { x: 0, y: 33.3 })).toEqual({ x: 0, y: 33.3 });
  });
  it('clamps to the ends of the route', () => {
    expect(nearestOnRoute(route, { x: -5, y: -30 })).toEqual({ x: 0, y: 0 });
    expect(nearestOnRoute(route, { x: 260, y: 110 })).toEqual({ x: 200, y: 100 });
  });
  it('survives a zero-length leg and an empty route', () => {
    expect(nearestOnRoute([{ x: 5, y: 5 }, { x: 5, y: 5 }], { x: 9, y: 9 })).toEqual({ x: 5, y: 5 });
    expect(nearestOnRoute([], { x: 9, y: 9 })).toEqual({ x: 9, y: 9 });
  });
});

describe('roundedRoute', () => {
  it('draws two points as a straight line', () => {
    expect(roundedRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }], 28)).toBe('M0,0 L10,0');
  });

  it('caps the corner radius at half of either leg, so a short jog becomes one S-curve', () => {
    // the first corner sits between a 10px stub and a 100px jog: radius 5
    expect(roundedRoute(Z, 28)).toBe('M0,0 L0,5 Q0,10 5,10 L72,10 Q100,10 100,38 L100,100');
  });
});

describe('snapRouteEnds', () => {
  const route = [
    { x: 50, y: 40 },
    { x: 50, y: 70 },
    { x: 150, y: 70 },
    { x: 150, y: 100 },
  ];

  it('slides each end along its own leg onto the box as drawn', () => {
    // elk thought the source was 40 tall and the target started at 100; drawn: 46 and 96
    const out = snapRouteEnds(route, { x: 0, y: 0, width: 100, height: 46 }, { x: 100, y: 96, width: 100, height: 50 });
    expect(out[0]).toEqual({ x: 50, y: 46 });
    expect(out[3]).toEqual({ x: 150, y: 96 });
    expect(route[0]).toEqual({ x: 50, y: 40 }); // never mutates the cached route
  });

  it('a route that continues INSIDE the box (container → own child) keeps the border it started on', () => {
    const inner = [
      { x: 69, y: 0 },
      { x: 69, y: 36 },
    ];
    const out = snapRouteEnds(inner, { x: 0, y: 2, width: 200, height: 160 }, undefined);
    expect(out[0]).toEqual({ x: 69, y: 2 });
  });

  it('leaves an end alone when its leg does not point at the box', () => {
    const out = snapRouteEnds(route, { x: 500, y: 500, width: 10, height: 10 }, undefined);
    expect(out[0]).toEqual({ x: 50, y: 40 });
  });
});

describe('tidyRoute', () => {
  it('straightens a hairline sidestep in the middle of a straight run', () => {
    // down 80, a 2px sidestep where the edge crossed a container wall, down again
    const kinked = [
      { x: 470, y: 250 },
      { x: 470, y: 320 },
      { x: 468, y: 320 },
      { x: 468, y: 960 },
    ];
    expect(tidyRoute(kinked)).toEqual([
      { x: 468, y: 250 },
      { x: 468, y: 960 },
    ]);
    expect(kinked[0]).toEqual({ x: 470, y: 250 }); // the cached route is not touched
  });

  it('keeps the leg BEFORE the run attached: only points on the moved line move', () => {
    const route = [
      { x: 0, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 50 },
      { x: 103, y: 50 },
      { x: 103, y: 200 },
    ];
    expect(tidyRoute(route)).toEqual([
      { x: 0, y: 10 },
      { x: 103, y: 10 },
      { x: 103, y: 200 },
    ]);
  });

  it('leaves a real jog, and a route too short to have one, alone', () => {
    expect(tidyRoute(Z)).toEqual(Z);
    const two = [{ x: 0, y: 0 }, { x: 0, y: 9 }];
    expect(tidyRoute(two)).toEqual(two);
  });
});

describe('routeEndSides', () => {
  it('reads each end\'s side off the direction of its own leg', () => {
    // Z leaves downward and arrives from above
    expect(routeEndSides(Z)).toEqual({ from: 'bottom', to: 'top' });
    expect(routeEndSides([{ x: 0, y: 5 }, { x: 40, y: 5 }])).toEqual({ from: 'right', to: 'left' });
  });

  it('says nothing about a diagonal or degenerate leg', () => {
    expect(routeEndSides([{ x: 0, y: 0 }, { x: 5, y: 9 }])).toEqual({ from: undefined, to: undefined });
    expect(routeEndSides([{ x: 1, y: 1 }])).toEqual({ from: undefined, to: undefined });
  });
});
