// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import { useLayoutApi } from './useLayoutApi';
import type { LayoutApi } from './view-types';

describe('useLayoutApi at 80 px a day', () => {
  // what the studio saves from (Freeze layout, Re-layout, a toolbar add at the
  // centre, a card dropped into a box) comes out in 20 px-a-day units
  function api() {
    const layoutApiRef = { current: null as LayoutApi | null };
    const wrapper = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) } as HTMLDivElement;
    const reactFlow = {
      screenToFlowPosition: (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y }),
      getInternalNode: () => ({
        internals: { positionAbsolute: { x: 800, y: 10 } },
        measured: { width: 400, height: 40 },
      }),
    } as unknown as ReactFlowInstance;
    renderHook(() =>
      useLayoutApi({
        layoutApiRef,
        reactFlow,
        rfNodesRef: { current: [{ id: 'a', position: { x: 400, y: 30 }, data: {} } as Node] },
        compiledRef: { current: compileView(model('m').toJSON(), {}) },
        geometryRef: { current: new Map<string, NodeGeometry>([['a', { x: 400, y: 30, width: 100, height: 40 }]]) },
        wrapperRef: { current: wrapper },
        strokesRef: { current: [] },
        viewShiftRef: { current: new Map() },
        savedFrameRef: { current: new Map() },
        scaleRef: { current: 4 },
        legendReserveRef: { current: null },
      }),
    );
    return layoutApiRef.current!;
  }
  it('snapshots and auto positions', () => {
    expect(api().snapshotPositions()).toEqual({ a: { x: 100, y: 30 } });
    expect(api().autoPositions()).toEqual({ a: { x: 100, y: 30 } });
  });
  it('the viewport centre and a box: x and width', () => {
    expect(api().viewportCenter()).toEqual({ x: 250, y: 300 });
    expect(api().nodeBounds('a')).toEqual({ x: 200, y: 10, width: 100, height: 40 });
  });
});
