// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { centredViewport, nextDayWidth, useCentreDayPan } from './useDayWidth';

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
