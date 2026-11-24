// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { model } from '@diagc/core/internal';
import {
  centredViewport,
  nextDayWidth,
  openedZoneWidth,
  useCentreDayPan,
  useDayWidth,
  useOpenedZoneStretch,
} from './useDayWidth';

describe('nextDayWidth', () => {
  it('steps through 20, 30, 40, 60, 80, and from between two steps to the nearer one that way', () => {
    expect(nextDayWidth(20, 1)).toBe(30);
    expect(nextDayWidth(60, 1)).toBe(80);
    expect(nextDayWidth(80, 1)).toBe(80);
    expect(nextDayWidth(20, -1)).toBe(20);
    expect(nextDayWidth(45, 1)).toBe(60);
    expect(nextDayWidth(45, -1)).toBe(40);
  });
});

describe('centredViewport', () => {
  it('keeps the flow x under the canvas centre on the same day when the width changes', () => {
    // a 1000 px canvas at zoom 0.5, viewport x 100: the centre shows flow x (500 - 100) / 0.5 = 800
    const vp = centredViewport({ x: 100, y: 7, zoom: 0.5 }, 1000, 20, 40);
    // that day is now at flow x 1600, and must still sit under the centre
    expect((500 - vp.x) / vp.zoom).toBe(1600);
    expect(vp).toMatchObject({ y: 7, zoom: 0.5 });
  });
});

describe('useCentreDayPan', () => {
  it('pans once the stretched layout lands, not before, and only for the width it waited for', () => {
    const setViewport = vi.fn();
    const reactFlow = { getViewport: () => ({ x: 100, y: 0, zoom: 1 }), setViewport };
    const wrapperRef = { current: { clientWidth: 1000 } as HTMLElement };
    const pendingPanRef = { current: { from: 20, to: 40 } as { from: number; to: number } | null };
    const days = (width: number) => ({ width, set: vi.fn(), step: vi.fn(), pendingPanRef });
    const { rerender } = renderHook(
      (p: { width: number; geometry: unknown }) =>
        useCentreDayPan({ days: days(p.width), geometry: p.geometry, reactFlow, wrapperRef }),
      { initialProps: { width: 20, geometry: 'old' } },
    );
    expect(setViewport).not.toHaveBeenCalled(); // still the old width
    rerender({ width: 40, geometry: 'new' });
    expect(setViewport).toHaveBeenCalledWith({ x: 500 - 400 * 2, y: 0, zoom: 1 });
    expect(pendingPanRef.current).toBeNull();
  });
});

describe('openedZoneWidth', () => {
  it("fills nine tenths of the canvas with the zone's days, clamped to 20 – 80", () => {
    expect(openedZoneWidth(1000, 20)).toBe(45);
    expect(openedZoneWidth(1000, 200)).toBe(20);
    expect(openedZoneWidth(1000, 3)).toBe(80);
  });
});

describe('useOpenedZoneStretch', () => {
  function plan() {
    const m = model('p');
    const z = m.plan().zone('z', { start: '2026-01-01', end: '2026-01-20' }); // 20 days
    z.zone('in', { start: '2026-01-01', end: '2026-01-05' });
    return m.toJSON();
  }
  const json = plan();
  function setup() {
    return renderHook(
      ({ path }: { path: string[] }) => {
        const days = useDayWidth({ model: json });
        const intended = useOpenedZoneStretch({
          days,
          path,
          model: json,
          plane: 'plan',
          stretches: true,
          canvasWidth: () => 1000,
        });
        return { days, intended };
      },
      { initialProps: { path: [] as string[] } },
    );
  }

  it('opening a 20-day zone on a 1000 px canvas sets 45 px per day; leaving restores 30', () => {
    const { result, rerender } = setup();
    act(() => result.current.days.set(30));
    rerender({ path: ['z'] });
    expect(result.current.days.width).toBe(45);
    rerender({ path: [] });
    expect(result.current.days.width).toBe(30);
  });

  it('stretching while opened, then leaving, restores the width from before opening', () => {
    const { result, rerender } = setup();
    act(() => result.current.days.set(30));
    rerender({ path: ['z'] });
    act(() => result.current.days.step(1));
    expect(result.current.days.width).toBe(60);
    rerender({ path: [] });
    expect(result.current.days.width).toBe(30);
  });

  it('reports the width the transition lands on in the same render, before the width itself moves', () => {
    const { result, rerender } = setup();
    rerender({ path: ['z'] });
    expect(result.current.intended).toBe(45);
  });

  it('going deeper stretches again, and coming back out restores each level in turn', () => {
    const { result, rerender } = setup();
    rerender({ path: ['z'] });
    rerender({ path: ['z', 'in'] }); // 5 days → 180, clamped to 80
    expect(result.current.days.width).toBe(80);
    rerender({ path: ['z'] });
    expect(result.current.days.width).toBe(45);
    rerender({ path: [] });
    expect(result.current.days.width).toBe(20);
  });
});
