// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactFlowInstance } from '@xyflow/react';
import { compileView, model, type CompiledView } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { RootFit } from './useDrillNavigation';
import { useRootFit, widthFitViewport, type RootFitInput } from './useRootFit';

const compiled = compileView(model('fit').toJSON(), {});
const laidOut = new Map();

function setup(fit: RootFit | null) {
  const reactFlow = { fitView: vi.fn() } as unknown as ReactFlowInstance;
  const pendingRootFitRef = { current: fit };
  const view = renderHook(
    ({
      settledFor,
      arranged,
    }: {
      settledFor: CompiledView | null;
      arranged: RootFitInput['layout']['arrangedGeometry'];
    }) => useRootFit({ pendingRootFitRef, compiled, layout: { arrangedGeometry: arranged, settledFor }, reactFlow }),
    {
      initialProps: {
        settledFor: null as CompiledView | null,
        arranged: laidOut as RootFitInput['layout']['arrangedGeometry'],
      },
    },
  );
  return { fitView: reactFlow.fitView as ReturnType<typeof vi.fn>, pendingRootFitRef, rerender: view.rerender };
}

describe('useRootFit', () => {
  it("waits for the layout of the scene it fits, not the last scene's", () => {
    const { fitView, pendingRootFitRef, rerender } = setup('glide');
    expect(fitView).not.toHaveBeenCalled();
    rerender({ settledFor: compiled, arranged: laidOut });
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith({ padding: 0.15, duration: 500 });
    expect(pendingRootFitRef.current).toBeNull();
  });

  it('jumps without a glide to a different diagram', () => {
    const { fitView, rerender } = setup('jump');
    rerender({ settledFor: compiled, arranged: laidOut });
    expect(fitView).toHaveBeenCalledWith(undefined);
  });

  it('fits nothing nobody asked for, and nothing before there is an arrangement', () => {
    const none = setup(null);
    none.rerender({ settledFor: compiled, arranged: laidOut });
    expect(none.fitView).not.toHaveBeenCalled();
    const unarranged = setup('glide');
    unarranged.rerender({ settledFor: compiled, arranged: null });
    expect(unarranged.fitView).not.toHaveBeenCalled();
  });

  it('a plan-zone drill waits for the layout at the width it stretches to, then fits the width, not both axes', () => {
    // React Flow's own nodes still hold the LAST scene when the new one has
    // settled (a whole plan, a year wide): the fit measures the arranged boxes
    const reactFlow = {
      fitView: vi.fn(),
      setViewport: vi.fn(),
      getNodes: () => [],
      getNodesBounds: () => ({ x: 0, y: -300, width: 20000, height: 900 }),
    } as unknown as ReactFlowInstance;
    const opened = compileView(
      {
        ...model('o').toJSON(),
        nodes: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
      {},
    );
    const arranged = new Map([
      ['a', { x: 100, y: -50, width: 200, height: 40 }],
      ['b', { x: 400, y: 100, width: 200, height: 1900 }],
    ]);
    const pendingRootFitRef = { current: 'glide' as RootFit | null };
    const { rerender } = renderHook(
      ({ settledWidth }: { settledWidth: number }) =>
        useRootFit({
          pendingRootFitRef,
          compiled: opened,
          layout: { arrangedGeometry: arranged, settledFor: opened, settledWidth },
          reactFlow,
          dayWidth: 45,
          widthFit: { canvas: () => ({ width: 1000, height: 600 }) },
        }),
      { initialProps: { settledWidth: 20 } },
    );
    expect(reactFlow.setViewport).not.toHaveBeenCalled(); // laid out at the old width
    rerender({ settledWidth: 45 });
    expect(reactFlow.fitView).not.toHaveBeenCalled();
    expect(reactFlow.setViewport).toHaveBeenCalledWith(
      widthFitViewport({ x: 100, y: -50, width: 500, height: 2050 }, 1000),
      {
        duration: 500,
      },
    );
  });
});

describe('widthFitViewport', () => {
  it('fits the width at zoom 1 at most, centred, with the header and the top rows in view', () => {
    const vp = widthFitViewport({ x: 100, y: -50, width: 500, height: 2000 }, 1000);
    expect(vp.zoom).toBe(1);
    expect(vp.x).toBe((1000 - 500) / 2 - 100);
    // the header sits above every box (y = -HEADER_H): the top is whichever is higher
    expect(vp.y).toBe(56 + PLAN_LAYOUT.HEADER_H); // clear of the breadcrumb
  });
  it('zooms out for a zone wider than the canvas', () => {
    const vp = widthFitViewport({ x: 0, y: -200, width: 1904, height: 100 }, 1000);
    expect(vp.zoom).toBe(0.5);
    expect(vp.y).toBe(56 + 200 * 0.5);
  });
});
