import { describe, expect, it } from 'vitest';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import { ELBOW_OUT, ELBOW_STUB, planElbow as elbowOf, type ElbowEnd } from './plan-elbow';

/** two zones: what every case below draws between */
const planElbow = (a: Omit<ElbowEnd, 'type'>, b: Omit<ElbowEnd, 'type'>) =>
  elbowOf({ ...a, type: 'plan-zone' }, { ...b, type: 'plan-zone' })!;

const { ROW_GAP } = PLAN_LAYOUT;
const S = ELBOW_STUB;
const OUT = ELBOW_OUT;

describe('planElbow', () => {
  it('finish to start: out of the end of the first bar, down to the gap below it, along it, into the start of the next', () => {
    const { points, label } = planElbow(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 200, y: 96, width: 80, height: 40 },
    );
    const gap = 40 + ROW_GAP / 2;
    expect(points).toEqual([
      { x: 100, y: 20 },
      { x: 100 + OUT, y: 20 },
      { x: 100 + OUT, y: gap },
      { x: 200 - S, y: gap },
      { x: 200 - S, y: 116 },
      { x: 200, y: 116 },
    ]);
    expect(label).toEqual({ x: (100 + OUT + 200 - S) / 2, y: gap });
  });

  it("turns down clear of the comments badge on the bar's bottom-right corner, and of the hit band around the line", () => {
    // the badge: an 18px pill at `bottom/right: -6px` (styles.css .dg-comment-badge);
    // the edge's widest hit band: React Flow's 20px interaction path
    const badgeRight = 100 + 6;
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 96, width: 80, height: 40 });
    expect(points[1]!.x - 10).toBeGreaterThan(badgeRight);
  });

  it('a one-day bar: it still leaves from its end', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 12, height: 40 }, { x: 200, y: 96, width: 80, height: 40 });
    expect(points[0]).toEqual({ x: 12, y: 20 });
  });

  it('a bar that starts before the first one ends: the run goes back left in the gap above it, clear of the first bar\'s corner badge', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 40 }, { x: 40, y: 96, width: 80, height: 40 });
    const gap = 96 - ROW_GAP / 2;
    expect(points).toEqual([
      { x: 100, y: 20 },
      { x: 100 + OUT, y: 20 },
      { x: 100 + OUT, y: gap },
      { x: 40 - S, y: gap },
      { x: 40 - S, y: 116 },
      { x: 40, y: 116 },
    ]);
  });

  it('the same, toward a bar above: back left in the gap below it', () => {
    const { points } = planElbow({ x: 0, y: 200, width: 100, height: 40 }, { x: 40, y: 0, width: 80, height: 40 });
    expect(points[2]!.y).toBe(40 + ROW_GAP / 2);
    expect(points[5]).toEqual({ x: 40, y: 20 });
  });

  it('a dependent bar above: out of the end, up to the gap above, along it', () => {
    const { points } = planElbow({ x: 0, y: 200, width: 100, height: 40 }, { x: 200, y: 0, width: 80, height: 40 });
    expect(points[0]).toEqual({ x: 100, y: 220 });
    expect(points[2]!.y).toBe(200 - ROW_GAP / 2);
  });

  it('an open zone (a tall box) leaves from its title row and drops below all its rows; it is entered at its title row', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 200 }, { x: 300, y: 300, width: 100, height: 160 });
    expect(points[0]).toEqual({ x: 100, y: PLAN_LAYOUT.BAR_H / 2 });
    expect(points[5]).toEqual({ x: 300, y: 300 + PLAN_LAYOUT.BAR_H / 2 });
    expect(points[2]!.y).toBe(200 + ROW_GAP / 2);
  });

  it('only between dated rows: a zone or an event at both ends, never a free-form box inside a zone', () => {
    const a = { x: 0, y: 0, width: 100, height: 40 };
    const b = { x: 200, y: 96, width: 80, height: 40 };
    expect(elbowOf({ ...a, type: 'plan-event' }, { ...b, type: 'plan-zone' })).toBeDefined();
    expect(elbowOf({ ...a, type: 'container' }, { ...b, type: 'plan-zone' })).toBeUndefined();
    expect(elbowOf({ ...a, type: 'plan-zone' }, { ...b })).toBeUndefined();
  });
});
