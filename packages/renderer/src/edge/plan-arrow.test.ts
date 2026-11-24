import { describe, expect, it } from 'vitest';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import { NAME_CLEAR, planArrow as arrowOf, type ArrowEnd } from './plan-arrow';

/** two zones: what every case below draws between */
const planArrow = (a: Omit<ArrowEnd, 'type'>, b: Omit<ArrowEnd, 'type'>) =>
  arrowOf({ ...a, type: 'plan-zone' }, { ...b, type: 'plan-zone' })!;

describe('planArrow', () => {
  it('finish to start: from the end of the first bar to the start of the next, each at its middle', () => {
    expect(planArrow({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 96, width: 80, height: 40 })).toEqual({
      from: { x: 100, y: 20 },
      to: { x: 200, y: 116 },
    });
  });

  it('a bar that starts before the first one ends: still end to start', () => {
    expect(planArrow({ x: 0, y: 0, width: 100, height: 40 }, { x: 40, y: 96, width: 80, height: 40 })).toEqual({
      from: { x: 100, y: 20 },
      to: { x: 40, y: 116 },
    });
  });

  it('an open zone (a tall box) is left and entered at its title row, not its middle', () => {
    const { from, to } = planArrow({ x: 0, y: 0, width: 100, height: 200 }, { x: 300, y: 300, width: 100, height: 160 });
    expect(from).toEqual({ x: 100, y: PLAN_LAYOUT.BAR_H / 2 });
    expect(to).toEqual({ x: 300, y: 300 + PLAN_LAYOUT.BAR_H / 2 });
  });

  it('a name hung right of the first bar: the arrow leaves the end below it toward a row below, above it toward a row above', () => {
    const bar = { x: 0, y: 200, width: 100, height: 40, nameSide: 'right' as const };
    expect(planArrow(bar, { x: 200, y: 296, width: 80, height: 40 }).from).toEqual({ x: 100, y: 240 - NAME_CLEAR });
    expect(planArrow(bar, { x: 200, y: 96, width: 80, height: 40 }).from).toEqual({ x: 100, y: 200 + NAME_CLEAR });
  });

  it('a name hung left of the dependent bar: the arrow enters its start above it from a row above, below it from a row below', () => {
    const bar = { x: 200, y: 200, width: 80, height: 40, nameSide: 'left' as const };
    expect(planArrow({ x: 0, y: 96, width: 100, height: 40 }, bar).to).toEqual({ x: 200, y: 200 + NAME_CLEAR });
    expect(planArrow({ x: 0, y: 296, width: 100, height: 40 }, bar).to).toEqual({ x: 200, y: 240 - NAME_CLEAR });
  });

  it('a name on the side the arrow does not use, or an open zone (its name titles its band), keeps the middle', () => {
    const a = { x: 0, y: 0, width: 100, height: 40, nameSide: 'left' as const };
    const b = { x: 200, y: 96, width: 80, height: 40, nameSide: 'right' as const };
    expect(planArrow(a, b)).toEqual({ from: { x: 100, y: 20 }, to: { x: 200, y: 116 } });
    const open = { x: 0, y: 0, width: 100, height: 200, nameSide: 'right' as const };
    expect(planArrow(open, b).from).toEqual({ x: 100, y: PLAN_LAYOUT.BAR_H / 2 });
  });

  it('only between dated rows: a zone or an event at both ends, never a free-form box inside a zone', () => {
    const a = { x: 0, y: 0, width: 100, height: 40 };
    const b = { x: 200, y: 96, width: 80, height: 40 };
    expect(arrowOf({ ...a, type: 'plan-event' }, { ...b, type: 'plan-zone' })).toBeDefined();
    expect(arrowOf({ ...a, type: 'container' }, { ...b, type: 'plan-zone' })).toBeUndefined();
    expect(arrowOf({ ...a, type: 'plan-zone' }, { ...b })).toBeUndefined();
  });
});
