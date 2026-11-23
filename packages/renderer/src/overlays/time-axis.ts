import { isoOf, type PlanSpan } from '@diagc/core/internal';
import { PLAN_LAYOUT, planX } from '../layout/plan-layout';

export interface AxisBand {
  x: number;
  width: number;
  label: string;
}

/** one day of the day band: a bar's start and end read against these */
export interface DayBand {
  x: number;
  width: number;
  /** the day number (days since 1970-01-01), as `dayOf` gives it */
  day: number;
  /** the day of the month, no leading zero */
  date: string;
  /** the weekday's initial, `M` … `S` */
  weekday: string;
}

export interface TimeAxis {
  /** drawn extent, a week of margin before the first date and after the last */
  x0: number;
  x1: number;
  months: AxisBand[];
  weeks: AxisBand[];
  days: DayBand[];
  /** each run of Saturday and Sunday inside the extent, as one unlabelled band
   * (one day where the extent cuts a weekend), shaded down the chart */
  weekends: AxisBand[];
}

/** The drawn extent's margins, in days, either side of the dated range.
 * Exported because the today line has to agree with them: a rule drawn past
 * `x1` would hang off the axis it belongs to. */
export const MARGIN_BEFORE = 7;
/** exclusive — the axis runs UP TO `range.end + MARGIN_AFTER` */
export const MARGIN_AFTER = 8;
/** fixed English abbreviations: the axis reads the same on every machine, and
 * a locale name would not survive the PNG round trip as text anyway */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** indexed by `weekday()` (0 = Sunday), fixed English for the reason MONTHS is */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
/** a week label needs room for three characters at the band's font */
const MIN_LABELLED_WEEK = 3;
/** days a month label (`Dec 2026`, 11px) needs: a sliver of a month at the
 * extent's edge — an opened zone starting on the 7th — would print its name
 * over the next month's */
const MIN_LABELLED_MONTH = 4;

/** 0 = Sunday … 6 = Saturday; 1970-01-01 was a Thursday */
export const weekday = (day: number): number => (((day + 4) % 7) + 7) % 7;

const yearOf = (day: number): number => Number(isoOf(day).slice(0, 4));
const monthOf = (day: number): number => Number(isoOf(day).slice(5, 7)) - 1;
const dayOfIso = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** ISO-8601 week number: the week belongs to the year its Thursday falls in. */
export function isoWeek(day: number): number {
  const thursday = day + (3 - ((weekday(day) + 6) % 7));
  const year = yearOf(thursday);
  const jan4 = dayOfIso(`${String(year)}-01-04`);
  const week1Monday = jan4 - ((weekday(jan4) + 6) % 7);
  return Math.floor((thursday - week1Monday) / 7) + 1;
}

const firstOfNextMonth = (day: number): number => {
  const y = yearOf(day);
  const m = monthOf(day);
  return dayOfIso(m === 11 ? `${String(y + 1)}-01-01` : `${String(y)}-${String(m + 2).padStart(2, '0')}-01`);
};

export function timeAxis(range: PlanSpan, origin: number): TimeAxis {
  const from = range.start - MARGIN_BEFORE;
  const to = range.end + MARGIN_AFTER; // exclusive
  const x = (day: number): number => planX(day, origin);
  const months: AxisBand[] = [];
  for (let d = from; d < to; d = firstOfNextMonth(d)) {
    const end = Math.min(firstOfNextMonth(d), to);
    const label = end - d >= MIN_LABELLED_MONTH ? `${MONTHS[monthOf(d)]!} ${String(yearOf(d))}` : '';
    months.push({ x: x(d), width: x(end) - x(d), label });
  }
  const weeks: AxisBand[] = [];
  for (let d = from; d < to;) {
    const nextMonday = d + ((8 - weekday(d)) % 7 || 7);
    const end = Math.min(nextMonday, to);
    const width = end - d;
    weeks.push({
      x: x(d),
      width: width * PLAN_LAYOUT.DAY,
      label: width >= MIN_LABELLED_WEEK ? `W${String(isoWeek(d)).padStart(2, '0')}` : '',
    });
    d = end;
  }
  const days: DayBand[] = [];
  const weekends: AxisBand[] = [];
  for (let d = from; d < to; d++) {
    const wd = weekday(d);
    days.push({
      x: x(d),
      width: PLAN_LAYOUT.DAY,
      day: d,
      date: String(Number(isoOf(d).slice(8))),
      weekday: WEEKDAYS[wd]!,
    });
    if (wd !== 0 && wd !== 6) continue;
    // a Sunday extends the Saturday run just before it, unless the extent starts on it
    const last = weekends[weekends.length - 1];
    if (wd === 0 && last !== undefined && last.x + last.width === x(d)) last.width += PLAN_LAYOUT.DAY;
    else weekends.push({ x: x(d), width: PLAN_LAYOUT.DAY, label: '' });
  }
  return { x0: x(from), x1: x(to), months, weeks, days, weekends };
}

/** The reader's calendar date, `YYYY-MM-DD`, from the LOCAL clock: "today" is
 * the day on the wall, not the UTC day (a plan authored at 23:30 must not show
 * tomorrow's line). The one place a host reads the clock for a diagram. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
