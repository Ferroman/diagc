import { describe, expect, it } from 'vitest';
import { dayOf } from '@diagc/core';
import { PLAN_LAYOUT, planX } from './plan-layout';
import { isoWeek, timeAxis, todayIso, weekday } from './time-axis';

const { DAY } = PLAN_LAYOUT;
const d = (iso: string) => dayOf(iso)!;

describe('todayIso', () => {
  it('formats the LOCAL calendar date, zero-padded', () => {
    // 23:30 local on 3 Feb must read as the 3rd whatever UTC says
    expect(todayIso(new Date(2026, 1, 3, 23, 30))).toBe('2026-02-03');
    expect(todayIso(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('weekday / isoWeek', () => {
  it('knows the epoch was a Thursday and reads ISO weeks across a year boundary', () => {
    expect(weekday(0)).toBe(4);
    expect(weekday(d('2026-01-05'))).toBe(1); // a Monday
    expect(isoWeek(d('2026-01-05'))).toBe(2);
    expect(isoWeek(d('2026-01-01'))).toBe(1);
    expect(isoWeek(d('2024-12-30'))).toBe(1); // belongs to 2025-W01
    expect(isoWeek(d('2021-01-03'))).toBe(53); // belongs to 2020-W53
  });
});

describe('timeAxis', () => {
  const origin = d('2026-01-01');
  const range = { start: d('2026-01-20'), end: d('2026-02-10') };
  it('draws a week of margin either side, in plan x', () => {
    const a = timeAxis(range, origin);
    expect(a.x0).toBe(planX(d('2026-01-13'), origin));
    expect(a.x1).toBe(planX(d('2026-02-18'), origin));
  });
  it('bands every month the drawn range touches, clipped to the range, labelled with month and year', () => {
    const a = timeAxis(range, origin);
    expect(a.months.map((m) => m.label)).toEqual(['Jan 2026', 'Feb 2026']);
    expect(a.months[0]).toMatchObject({ x: a.x0, width: planX(d('2026-02-01'), origin) - a.x0 });
    expect(a.months[1]).toMatchObject({ x: planX(d('2026-02-01'), origin), width: a.x1 - planX(d('2026-02-01'), origin) });
  });
  it('bands weeks from each Monday, labelling only those at least three days wide', () => {
    const a = timeAxis(range, origin);
    // drawn from Tue 13 Jan: a 6-day stub week, then full weeks from Mon 19 Jan
    expect(a.weeks[0]).toMatchObject({ x: a.x0, width: 6 * DAY, label: 'W03' });
    expect(a.weeks[1]).toMatchObject({ x: planX(d('2026-01-19'), origin), width: 7 * DAY, label: 'W04' });
    const last = a.weeks[a.weeks.length - 1]!;
    expect(last).toMatchObject({ x: planX(d('2026-02-16'), origin), width: 2 * DAY, label: '' }); // Mon 16 – Tue 17: too narrow
  });
});
