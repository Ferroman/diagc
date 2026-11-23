import { describe, expect, it } from 'vitest';
import { dayOf } from '@diagc/core/internal';
import { PLAN_LAYOUT, planX } from '../layout/plan-layout';
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
  it('leaves a month too narrow for its name unlabelled', () => {
    // 7 Dec – 14 Jan: the extent opens on Mon 30 Nov, one day of November
    const a = timeAxis({ start: d('2026-12-07'), end: d('2027-01-14') }, origin);
    expect(a.months[0]).toMatchObject({ width: DAY, label: '' });
    expect(a.months[1]!.label).toBe('Dec 2026');
  });

  it('draws a week of margin either side, in plan x', () => {
    const a = timeAxis(range, origin);
    expect(a.x0).toBe(planX(d('2026-01-13'), origin));
    expect(a.x1).toBe(planX(d('2026-02-18'), origin));
  });
  it('bands every month the drawn range touches, clipped to the range, labelled with month and year', () => {
    const a = timeAxis(range, origin);
    expect(a.months.map((m) => m.label)).toEqual(['Jan 2026', 'Feb 2026']);
    expect(a.months[0]).toMatchObject({ x: a.x0, width: planX(d('2026-02-01'), origin) - a.x0 });
    expect(a.months[1]).toMatchObject({
      x: planX(d('2026-02-01'), origin),
      width: a.x1 - planX(d('2026-02-01'), origin),
    });
  });
  it('bands every day of the drawn extent with its date and weekday letter', () => {
    const a = timeAxis(range, origin);
    expect(a.days).toHaveLength(d('2026-02-18') - d('2026-01-13'));
    expect(a.days[0]).toEqual({ x: a.x0, width: DAY, day: d('2026-01-13'), date: '13', weekday: 'T' }); // a Tuesday
    expect(a.days.find((b) => b.day === d('2026-01-19'))).toMatchObject({ date: '19', weekday: 'M' });
  });
  it('numbers days across a year boundary', () => {
    const a = timeAxis({ start: d('2026-12-28'), end: d('2027-01-05') }, origin);
    const i = a.days.findIndex((b) => b.day === d('2027-01-01'));
    expect(a.days[i]).toMatchObject({ date: '1', weekday: 'F' });
    expect(a.days[i - 1]).toMatchObject({ date: '31', weekday: 'T' });
  });
  it('shades each weekend as one run', () => {
    const a = timeAxis(range, origin);
    expect(a.weekends[0]).toEqual({ x: planX(d('2026-01-17'), origin), width: 2 * DAY, label: '' }); // Sat 17, Sun 18
    expect(a.weekends.every((w) => w.width === 2 * DAY)).toBe(true); // extent Tue 13 Jan – Tue 17 Feb: no clipped run
    expect(a.weekends).toHaveLength(5);
  });
  it('clips a weekend run to the drawn extent', () => {
    // range starting Sun 25 Jan: the extent starts a week earlier, on Sun 18 Jan
    const a = timeAxis({ start: d('2026-01-25'), end: d('2026-02-10') }, origin);
    expect(a.x0).toBe(planX(d('2026-01-18'), origin));
    expect(a.weekends[0]).toEqual({ x: a.x0, width: DAY, label: '' });
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
