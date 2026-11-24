// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { dayOf, isoOf, model } from '@diagc/core/internal';
import { PLAN_LAYOUT, planX } from '../layout/plan-layout';
import { MARGIN_AFTER, MARGIN_BEFORE } from './time-axis';

const rfNodes: {
  id: string;
  position: { x: number; y: number };
  parentId?: string;
  measured?: { width: number; height: number };
}[] = [];
vi.mock('@xyflow/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...mod,
    useNodes: () => rfNodes,
    ViewportPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
const { TimeAxisOverlay } = await import('./TimeAxisOverlay');

const { DAY, HEADER_H, PAD, EVENT, MONTH_H, WEEK_H, DAY_H } = PLAN_LAYOUT;
const bottom = 40 + PAD; // the content bottom seed() gives: max(y + h) + PAD
const origin = dayOf('2026-01-01')!;

function plan() {
  const m = model('p');
  const p = m.plan();
  p.zone('z', { start: '2026-01-20', end: '2026-02-10' });
  p.event('e', { at: '2026-02-02' });
  return m.toJSON();
}

function seed() {
  rfNodes.length = 0;
  rfNodes.push(
    {
      id: 'z',
      position: { x: planX(dayOf('2026-01-20')!, origin, DAY), y: 0 },
      measured: { width: 22 * DAY, height: 40 },
    },
    {
      id: 'e',
      position: { x: planX(dayOf('2026-02-02')!, origin, DAY) + DAY / 2 - EVENT / 2, y: -(DAY_H + WEEK_H) - EVENT / 2 },
      measured: { width: EVENT, height: EVENT },
    },
  );
}

describe('TimeAxisOverlay', () => {
  it('draws month and week bands above y = 0, a grid line per week to the content bottom, and a rule per root event', () => {
    seed();
    const { container } = render(<TimeAxisOverlay model={plan()} plane="plan" />);
    const months = [...container.querySelectorAll('.dg-time-axis-month')].map((t) => t.textContent);
    expect(months).toEqual(['Jan 2026', 'Feb 2026']);
    const weeks = [...container.querySelectorAll('.dg-time-axis-week')].map((t) => t.textContent);
    expect(weeks).toContain('W04');
    // each band in its own strip, top to bottom: months, weeks, days
    const monthY = Number(container.querySelector('.dg-time-axis-month')!.getAttribute('y'));
    expect(monthY).toBeGreaterThan(-HEADER_H);
    expect(monthY).toBeLessThan(-HEADER_H + MONTH_H);
    const weekY = Number(container.querySelector('.dg-time-axis-week')!.getAttribute('y'));
    expect(weekY).toBeGreaterThan(-DAY_H - WEEK_H);
    expect(weekY).toBeLessThan(-DAY_H);
    const days = [...container.querySelectorAll('.dg-time-axis-day')];
    expect(days).toHaveLength(dayOf('2026-02-18')! - dayOf('2026-01-13')!);
    expect(days[0]!.textContent).toBe('13');
    expect(container.querySelector('.dg-time-axis-weekday')!.textContent).toBe('T');
    for (const t of [days[0]!, container.querySelector('.dg-time-axis-weekday')!]) {
      const y = Number(t.getAttribute('y'));
      expect(y).toBeGreaterThan(-DAY_H);
      expect(y).toBeLessThan(0);
    }
    const frame = container.querySelector('.dg-time-axis-frame')!;
    expect(frame.getAttribute('y')).toBe(String(-HEADER_H));
    expect(frame.getAttribute('height')).toBe(String(HEADER_H));
    const grid = container.querySelectorAll('.dg-time-axis-grid');
    expect(grid.length).toBeGreaterThan(3);
    expect(grid[0]!.getAttribute('y2')).toBe(String(bottom));
    const rule = container.querySelector('.dg-time-axis-event')!;
    expect(rule.getAttribute('x1')).toBe(String(planX(dayOf('2026-02-02')!, origin, DAY) + DAY / 2));
    expect(container.querySelector('.dg-time-axis-today')).toBeNull();
  });
  it('shades weekends from the day band down to the content bottom, under the grid', () => {
    seed();
    const { container } = render(<TimeAxisOverlay model={plan()} plane="plan" />);
    const shades = [...container.querySelectorAll('.dg-time-axis-weekend')];
    expect(shades).toHaveLength(5); // Tue 13 Jan – Tue 17 Feb holds five weekends
    expect(shades[0]!.getAttribute('x')).toBe(String(planX(dayOf('2026-01-17')!, origin, DAY)));
    expect(shades[0]!.getAttribute('width')).toBe(String(2 * DAY));
    expect(shades[0]!.getAttribute('y')).toBe(String(-DAY_H));
    expect(shades[0]!.getAttribute('height')).toBe(String(DAY_H + bottom));
    const grid = container.querySelector('.dg-time-axis-grid')!;
    expect(shades[shades.length - 1]!.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('backs the header with an opaque rect first, so the canvas dots never show between the day digits', () => {
    seed();
    const { container } = render(<TimeAxisOverlay model={plan()} plane="plan" />);
    const svg = container.querySelector('.dg-time-axis')!;
    const backing = svg.firstElementChild!;
    expect(backing.getAttribute('class')).toBe('dg-time-axis-backing');
    const frame = container.querySelector('.dg-time-axis-frame')!;
    for (const k of ['x', 'y', 'width', 'height']) expect(backing.getAttribute(k)).toBe(frame.getAttribute(k));
    expect(backing.getAttribute('y')).toBe(String(-HEADER_H));
  });
  it('draws today as its day cell, its line running down from the day band', () => {
    seed();
    const inside = render(<TimeAxisOverlay model={plan()} plane="plan" today="2026-01-28" />);
    const cell = inside.container.querySelector('.dg-time-axis-today-day')!;
    expect(cell.getAttribute('x')).toBe(String(planX(dayOf('2026-01-28')!, origin, DAY)));
    expect(cell.getAttribute('width')).toBe(String(DAY));
    expect(cell.getAttribute('y')).toBe(String(-DAY_H));
    const line = inside.container.querySelector('.dg-time-axis-today')!;
    expect(line.getAttribute('x1')).toBe(String(planX(dayOf('2026-01-28')!, origin, DAY) + DAY / 2));
    expect(line.getAttribute('y1')).toBe(String(-DAY_H));
    expect(inside.container.querySelector('.dg-time-axis-today-label')).toBeNull();
    inside.unmount();
    const outside = render(<TimeAxisOverlay model={plan()} plane="plan" today="2026-06-01" />);
    expect(outside.container.querySelector('.dg-time-axis-today')).toBeNull();
    outside.unmount();
    const none = render(<TimeAxisOverlay model={plan()} plane="plan" today={null} />);
    expect(none.container.querySelector('.dg-time-axis-today')).toBeNull();
  });
  it('draws today over a weekend', () => {
    seed();
    const { container } = render(<TimeAxisOverlay model={plan()} plane="plan" today="2026-01-31" />); // a Saturday
    const cell = container.querySelector('.dg-time-axis-today-day')!;
    expect(cell).not.toBeNull();
    const shades = container.querySelectorAll('.dg-time-axis-weekend');
    expect(shades.length).toBeGreaterThan(0);
    for (const shade of shades)
      expect(shade.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('the today line reaches the axis margins exactly, and stops one day past them', () => {
    seed();
    // the drawn extent is [range.start - MARGIN_BEFORE, range.end + MARGIN_AFTER),
    // the same two numbers timeAxis lays the bands out with — derive, never repeat
    const start = dayOf('2026-01-20')!;
    const end = dayOf('2026-02-10')!;
    const cases: [number, boolean][] = [
      [start - MARGIN_BEFORE, true],
      [start - MARGIN_BEFORE - 1, false],
      [end + MARGIN_AFTER - 1, true], // the last day inside the exclusive end
      [end + MARGIN_AFTER, false],
    ];
    for (const [day, drawn] of cases) {
      const r = render(<TimeAxisOverlay model={plan()} plane="plan" today={isoOf(day)} />);
      expect([isoOf(day), r.container.querySelector('.dg-time-axis-today') !== null]).toEqual([isoOf(day), drawn]);
      r.unmount();
    }
  });
  it('scopes the header, the rules and today to a zone opened on its own', () => {
    const m = model('p');
    const p = m.plan();
    const z = p.zone('z', { start: '2026-01-20', end: '2026-02-10' });
    z.zone('r', { start: '2026-01-26', end: '2026-01-30' }).event('in', { at: '2026-01-28' });
    p.event('e', { at: '2026-02-02' });
    rfNodes.length = 0;
    rfNodes.push({ id: 'r', position: { x: 0, y: 0 }, measured: { width: 100, height: 40 } });
    // 9 Feb: inside the whole plan's drawn extent, outside r's (26 – 30 Jan, + 8 days)
    const { container } = render(<TimeAxisOverlay model={m.toJSON()} plane="plan" root="r" today="2026-02-09" />);
    const firstDay = container.querySelector('.dg-time-axis-day')!;
    expect(firstDay.textContent).toBe(String(26 - MARGIN_BEFORE));
    const rules = [...container.querySelectorAll('.dg-time-axis-event')].map((l) => Number(l.getAttribute('x1')));
    expect(rules).toEqual([planX(dayOf('2026-01-28')!, origin, DAY) + DAY / 2]); // r's own event, not the plan's
    expect(container.querySelector('.dg-time-axis-today')).toBeNull();
  });

  it('shades a period that interrupts nothing from the day band to the content bottom; one that interrupts a row, not', () => {
    seed();
    const m = model('p');
    const p = m.plan();
    const z = p.zone('z', { start: '2026-01-20', end: '2026-02-10' });
    p.period('everyone', { start: '2026-01-26', end: '2026-01-28' });
    p.period('rows', { start: '2026-02-02', end: '2026-02-03', interrupts: [z] });
    const { container } = render(<TimeAxisOverlay model={m.toJSON()} plane="plan" />);
    const shades = container.querySelectorAll('.dg-time-axis-period');
    expect(shades).toHaveLength(1);
    const shade = shades[0]!;
    expect(shade.getAttribute('x')).toBe(String(planX(dayOf('2026-01-26')!, origin, DAY)));
    expect(shade.getAttribute('width')).toBe(String(3 * DAY));
    expect(shade.getAttribute('y')).toBe(String(-DAY_H));
    expect(shade.getAttribute('height')).toBe(String(DAY_H + bottom));
  });

  it('hatches, over the whole opened view, a period that interrupts the zone opened on its own', () => {
    // the opened zone is not drawn in its own view, so its stripe has no bar to
    // sit on: the pause is drawn across the chart instead, clipped to its days
    seed();
    const m = model('p');
    const p = m.plan();
    const z = p.zone('z', { start: '2026-01-20', end: '2026-02-10' });
    z.zone('in', { start: '2026-01-22', end: '2026-02-05' });
    p.period('freeze', { start: '2026-02-01', end: '2026-02-20', interrupts: [z] });
    p.period('other', {
      start: '2026-01-24',
      end: '2026-01-25',
      interrupts: [p.zone('y', { start: '2026-01-20', end: '2026-01-30' })],
    });
    const { container } = render(<TimeAxisOverlay model={m.toJSON()} plane="plan" root="z" />);
    const hatches = container.querySelectorAll('.dg-time-axis-period.dg-time-axis-period-hatched');
    expect(hatches).toHaveLength(1);
    const h = hatches[0]!;
    expect(h.getAttribute('x')).toBe(String(planX(dayOf('2026-02-01')!, origin, DAY)));
    expect(h.getAttribute('width')).toBe(String(10 * DAY)); // 1 – 10 Feb, z's last day
    expect(h.getAttribute('height')).toBe(String(DAY_H + bottom));
    // the whole plan's view hatches nothing across the chart: z's own bar carries it
    const whole = render(<TimeAxisOverlay model={m.toJSON()} plane="plan" />);
    expect(whole.container.querySelector('.dg-time-axis-period-hatched')).toBeNull();
  });

  it('draws the today line mid-day, and the days, at 40 px per day', () => {
    seed();
    const { container } = render(<TimeAxisOverlay model={plan()} plane="plan" today="2026-02-02" dayWidth={2 * DAY} />);
    const line = container.querySelector('.dg-time-axis-today')!;
    expect(Number(line.getAttribute('x1'))).toBe(planX(dayOf('2026-02-02')!, origin, 2 * DAY) + DAY);
    const rule = container.querySelector('.dg-time-axis-event')!;
    expect(Number(rule.getAttribute('x1'))).toBe(planX(dayOf('2026-02-02')!, origin, 2 * DAY) + DAY);
  });

  it('renders nothing for a plan with no dates', () => {
    rfNodes.length = 0;
    const m = model('empty');
    m.plan();
    const { container } = render(<TimeAxisOverlay model={m.toJSON()} plane="plan" />);
    expect(container.querySelector('.dg-time-axis')).toBeNull();
  });
});
