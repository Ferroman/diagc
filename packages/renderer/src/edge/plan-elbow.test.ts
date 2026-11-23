import { describe, expect, it } from 'vitest';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import { ELBOW_STUB, planElbow } from './plan-elbow';

const { ROW_GAP } = PLAN_LAYOUT;
const S = ELBOW_STUB;

describe('planElbow', () => {
  it('finish to start: out of the end of the first bar, along the gap below it, into the start of the next', () => {
    const { points, label } = planElbow(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 200, y: 96, width: 80, height: 40 },
    );
    const gap = 40 + ROW_GAP / 2;
    expect(points).toEqual([
      { x: 100, y: 20 },
      { x: 100 + S, y: 20 },
      { x: 100 + S, y: gap },
      { x: 200 - S, y: gap },
      { x: 200 - S, y: 116 },
      { x: 200, y: 116 },
    ]);
    expect(label).toEqual({ x: (100 + S + 200 - S) / 2, y: gap });
  });

  it('a bar that starts before the first one ends: the gap run goes back left, the head still enters from the left', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 40 }, { x: 40, y: 96, width: 80, height: 40 });
    expect(points[3]!.x).toBeLessThan(points[2]!.x);
    const [a, b] = points.slice(-2);
    expect(a!.y).toBe(b!.y);
    expect(b!.x).toBeGreaterThan(a!.x);
    expect(b).toEqual({ x: 40, y: 116 });
  });

  it('a dependent bar above runs in the gap above the first one', () => {
    const { points } = planElbow({ x: 0, y: 200, width: 100, height: 40 }, { x: 200, y: 0, width: 80, height: 40 });
    expect(points[2]!.y).toBe(200 - ROW_GAP / 2);
  });

  it('an open zone (a tall box) leaves from and enters at its title row, not its middle', () => {
    const { points } = planElbow({ x: 0, y: 0, width: 100, height: 200 }, { x: 300, y: 300, width: 100, height: 160 });
    expect(points[0]).toEqual({ x: 100, y: PLAN_LAYOUT.BAR_H / 2 });
    expect(points[5]).toEqual({ x: 300, y: 300 + PLAN_LAYOUT.BAR_H / 2 });
    expect(points[2]!.y).toBe(200 + ROW_GAP / 2);
  });
});
