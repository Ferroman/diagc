// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactFlowInstance } from '@xyflow/react';
import { compileView, model, type CompiledView } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import { REVEAL_DURATION_MS, REVEAL_PAD, useRevealOnUnfold, type RevealInput } from './useRevealOnUnfold';
import type { RootFit } from './useDrillNavigation';

function nested() {
  const m = model('reveal');
  const box = m.node('box', { name: 'Box' });
  box.contains(m.node('inner', { name: 'Inner' }));
  return m.toJSON();
}
const open = compileView(nested(), { pins: { box: 'expanded' } });
const shut = compileView(nested(), {});
/** the box off the right edge of an 800px frame, its child inside it */
const geometry = new Map<string, NodeGeometry>([
  ['box', { x: 1000, y: 0, width: 300, height: 200 }],
  ['inner', { x: 20, y: 40, width: 100, height: 40 }],
]);

function setup(
  pending: string | null,
  compiled: CompiledView,
  camera = { x: 0, y: 0, zoom: 1 },
  rootFit: RootFit | null = null,
) {
  const reactFlow = { getViewport: () => camera, setViewport: vi.fn() } as unknown as ReactFlowInstance;
  const pendingRevealRef = { current: pending };
  const pendingRootFitRef = { current: rootFit };
  const wrapperRef = {
    current: { getBoundingClientRect: () => ({ width: 800, height: 600 }) } as unknown as HTMLDivElement,
  };
  const view = renderHook(
    ({
      settledFor,
      arranged,
    }: {
      settledFor: CompiledView | null;
      arranged: RevealInput['layout']['arrangedGeometry'];
    }) =>
      useRevealOnUnfold({
        pendingRevealRef,
        pendingRootFitRef,
        compiled,
        layout: { arrangedGeometry: arranged, settledFor },
        reactFlow,
        wrapperRef,
      }),
    {
      initialProps: {
        settledFor: null as CompiledView | null,
        arranged: geometry as RevealInput['layout']['arrangedGeometry'],
      },
    },
  );
  return { setViewport: reactFlow.setViewport as ReturnType<typeof vi.fn>, pendingRevealRef, rerender: view.rerender };
}

describe('useRevealOnUnfold', () => {
  it('brings the opened box into view once the layout of the scene it is open in has landed', () => {
    const { setViewport, pendingRevealRef, rerender } = setup('box', open);
    expect(setViewport).not.toHaveBeenCalled();
    rerender({ settledFor: open, arranged: geometry });
    // the box's right edge (1300) comes to one pad inside the 800px frame, and
    // its top edge, on the frame's edge, one pad down
    expect(setViewport).toHaveBeenCalledWith({ x: 776 - 1300, y: 24, zoom: 1 }, { duration: REVEAL_DURATION_MS });
    expect(pendingRevealRef.current).toBeNull();
    expect(REVEAL_PAD).toBe(24);
  });

  it('measures the box where it stands, inside its own open parents', () => {
    const outer = model('deep');
    const a = outer.node('a', { name: 'A' });
    const b = outer.node('b', { name: 'B' });
    b.contains(outer.node('c', { name: 'C' }));
    a.contains(b);
    const view = compileView(outer.toJSON(), { pins: { a: 'expanded', b: 'expanded' } });
    const deep = new Map<string, NodeGeometry>([
      ['a', { x: 500, y: 0, width: 600, height: 400 }],
      ['b', { x: 400, y: 100, width: 150, height: 150 }],
      ['c', { x: 20, y: 40, width: 100, height: 40 }],
    ]);
    const { setViewport, rerender } = setup('b', view);
    rerender({ settledFor: view, arranged: deep });
    // b sits at 900..1050 on the page: its right edge comes to 776
    expect(setViewport).toHaveBeenCalledWith({ x: 776 - 1050, y: 0, zoom: 1 }, { duration: REVEAL_DURATION_MS });
  });

  it('leaves the camera alone for a box already in view, and forgets the request', () => {
    const { setViewport, pendingRevealRef, rerender } = setup('box', open, { x: -900, y: 50, zoom: 1 });
    rerender({ settledFor: open, arranged: geometry });
    expect(setViewport).not.toHaveBeenCalled();
    expect(pendingRevealRef.current).toBeNull();
  });

  it('stands down while a whole-scene fit is pending: that fit shows the box too', () => {
    const { setViewport, pendingRevealRef, rerender } = setup('box', open, { x: 0, y: 0, zoom: 1 }, 'glide');
    rerender({ settledFor: open, arranged: geometry });
    expect(setViewport).not.toHaveBeenCalled();
    expect(pendingRevealRef.current).toBeNull();
  });

  it('reveals nothing for a box the view did not open (a host that ignored the chip)', () => {
    const { setViewport, pendingRevealRef, rerender } = setup('box', shut);
    rerender({ settledFor: shut, arranged: geometry });
    expect(setViewport).not.toHaveBeenCalled();
    expect(pendingRevealRef.current).toBeNull();
  });

  it('does nothing nobody asked for', () => {
    const { setViewport, rerender } = setup(null, open);
    rerender({ settledFor: open, arranged: geometry });
    expect(setViewport).not.toHaveBeenCalled();
  });
});
