import { describe, expect, it } from 'vitest';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import { ELBOW_INSET, ELBOW_STUB, planElbow as elbowOf, type ElbowEnd } from './plan-elbow';

/** two zones: what every case below draws between */
const planElbow = (a: Omit<ElbowEnd, 'type'>, b: Omit<ElbowEnd, 'type'>) =>
  elbowOf({ ...a, type: 'plan-zone' }, { ...b, type: 'plan-zone' })!;

const { ROW_GAP } = PLAN_LAYOUT;
const S = ELBOW_STUB;
const IN = ELBOW_INSET;

describe('planElbow', () => {
  it('finish to start: down out of the end of the first bar, along the gap below it, into the start of the next', () => {
    const { points, label } = planElbow(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 200, y: 96, width: 80, height: 40 },
    );
    const gap = 40 + ROW_GAP / 2;
    // it leaves through the bar's bottom edge, inside its end: a name drawn
    // beside the bar is never crossed
    expect(points).toEqual([
      { x: 100 - IN, y: 40 },
      { x: 100 - IN, y: gap },
      { x: 200 - S, y: gap },
      { x: 200 - S, y: 116 },
      { x: 200, y: 116 },
    ]);
    expect(label).toEqual({ x: (100 - IN + 200 - S) / 2, y: gap });
  });

  it("leaves clear of the comments badge on the bar's bottom-right corner, and of the hit band around the line", () => {
    // the badge: an 18px pill at `bottom/right: -6px` (styles.css .dg-comment-badge);
    // the edge's widest hit band: React Flow's 20px interaction path
    const badgeLeft = 100 + 6 - 18;
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 96, width: 80, height: 40 });
    expect(points[0]!.x + 10).toBeLessThan(badgeLeft);
  });

  it('a one-day bar: it leaves from the middle of the bar', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 12, height: 40 }, { x: 200, y: 96, width: 80, height: 40 });
    expect(points[0]).toEqual({ x: 6, y: 40 });
  });

  it('a bar that starts before the first one ends: the gap run goes back left, the head still enters from the left', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 40 }, { x: 40, y: 96, width: 80, height: 40 });
    expect(points[2]!.x).toBeLessThan(points[1]!.x);
    const [a, b] = points.slice(-2);
    expect(a!.y).toBe(b!.y);
    expect(b!.x).toBeGreaterThan(a!.x);
    expect(b).toEqual({ x: 40, y: 116 });
  });

  it('a dependent bar above: it leaves through the top edge and runs in the gap above', () => {
    const { points } = planElbow({ x: 0, y: 200, width: 100, height: 40 }, { x: 200, y: 0, width: 80, height: 40 });
    expect(points[0]).toEqual({ x: 100 - IN, y: 200 });
    expect(points[1]!.y).toBe(200 - ROW_GAP / 2);
  });

  it('an open zone (a tall box) leaves through its bottom and is entered at its title row, not its middle', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 200 }, { x: 300, y: 300, width: 100, height: 160 });
    expect(points[0]).toEqual({ x: 100 - IN, y: 200 });
    expect(points[4]).toEqual({ x: 300, y: 300 + PLAN_LAYOUT.BAR_H / 2 });
    expect(points[1]!.y).toBe(200 + ROW_GAP / 2);
  });

  it('only between dated rows: a zone or an event at both ends, never a free-form box inside a zone', () => {
    const a = { x: 0, y: 0, width: 100, height: 40 };
    const b = { x: 200, y: 96, width: 80, height: 40 };
    expect(elbowOf({ ...a, type: 'plan-event' }, { ...b, type: 'plan-zone' })).toBeDefined();
    expect(elbowOf({ ...a, type: 'container' }, { ...b, type: 'plan-zone' })).toBeUndefined();
    expect(elbowOf({ ...a, type: 'plan-zone' }, { ...b })).toBeUndefined();
  });
});
