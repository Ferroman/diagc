// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactFlowInstance } from '@xyflow/react';
import { compileView, model, type CompiledView } from '@diagc/core/internal';
import type { RootFit } from './useDrillNavigation';
import { useRootFit, type RootFitInput } from './useRootFit';

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
});
