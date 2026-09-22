// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { dayOf, model } from '@diagc/core';
import { PLAN_LAYOUT, planX } from './plan-layout';

const rfNodes: { id: string; position: { x: number; y: number }; parentId?: string; measured?: { width: number; height: number } }[] = [];
vi.mock('@xyflow/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@xyflow/react')>();
  return { ...mod, useNodes: () => rfNodes, ViewportPortal: ({ children }: { children: ReactNode }) => <>{children}</> };
});
const { TimeAxisOverlay } = await import('./TimeAxisOverlay');

const { DAY, HEADER_H, PAD, EVENT } = PLAN_LAYOUT;
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
    { id: 'z', position: { x: planX(dayOf('2026-01-20')!, origin), y: 0 }, measured: { width: 22 * DAY, height: 40 } },
    { id: 'e', position: { x: planX(dayOf('2026-02-02')!, origin) + DAY / 2 - EVENT / 2, y: -HEADER_H / 2 - EVENT / 2 }, measured: { width: EVENT, height: EVENT } },
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
    const frame = container.querySelector('.dg-time-axis-frame')!;
    expect(frame.getAttribute('y')).toBe(String(-HEADER_H));
    expect(frame.getAttribute('height')).toBe(String(HEADER_H));
    const grid = container.querySelectorAll('.dg-time-axis-grid');
    expect(grid.length).toBeGreaterThan(3);
    expect(grid[0]!.getAttribute('y2')).toBe(String(40 + PAD)); // content bottom = max(y + h) + PAD
    const rule = container.querySelector('.dg-time-axis-event')!;
    expect(rule.getAttribute('x1')).toBe(String(planX(dayOf('2026-02-02')!, origin) + DAY / 2));
    expect(container.querySelector('.dg-time-axis-today')).toBeNull();
  });
  it('draws the today line only when today is inside the drawn range', () => {
    seed();
    const inside = render(<TimeAxisOverlay model={plan()} plane="plan" today="2026-01-28" />);
    const line = inside.container.querySelector('.dg-time-axis-today')!;
    expect(line.getAttribute('x1')).toBe(String(planX(dayOf('2026-01-28')!, origin) + DAY / 2));
    expect(inside.container.querySelector('.dg-time-axis-today-label')?.textContent).toBe('today');
    inside.unmount();
    const outside = render(<TimeAxisOverlay model={plan()} plane="plan" today="2026-06-01" />);
    expect(outside.container.querySelector('.dg-time-axis-today')).toBeNull();
    outside.unmount();
    const none = render(<TimeAxisOverlay model={plan()} plane="plan" today={null} />);
    expect(none.container.querySelector('.dg-time-axis-today')).toBeNull();
  });
  it('renders nothing for a plan with no dates', () => {
    rfNodes.length = 0;
    const m = model('empty');
    m.plan();
    const { container } = render(<TimeAxisOverlay model={m.toJSON()} plane="plan" />);
    expect(container.querySelector('.dg-time-axis')).toBeNull();
  });
});
