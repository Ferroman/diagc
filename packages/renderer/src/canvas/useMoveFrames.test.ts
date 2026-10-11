// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import { useMoveFrames } from './useMoveFrames';

/** an open system at (100, 50) holding a service at (10, 20), and a client beside it */
function scene() {
  const m = model('frames');
  m.node('sys', { type: 'system' }).contains(m.node('api', { type: 'service' }));
  m.node('client', { type: 'service' });
  const compiled = compileView(m.toJSON(), { pins: { sys: 'expanded' } });
  const geometry = new Map<string, NodeGeometry>([
    ['sys', { x: 100, y: 50, width: 300, height: 200 }],
    ['api', { x: 10, y: 20, width: 120, height: 50 }],
    ['client', { x: 500, y: 50, width: 120, height: 50 }],
  ]);
  return { compiled, geometry };
}

describe('useMoveFrames', () => {
  it("records each open container's origin, before the shift the fit pass gave it", () => {
    const { compiled, geometry } = scene();
    const shifts = new Map([['sys', { dx: 5, dy: 8 }]]);
    const { result } = renderHook(() => useMoveFrames(compiled, geometry, shifts));
    expect([...result.current.containerBasesRef.current]).toEqual([['sys', { x: 95, y: 42 }]]);
    expect(result.current.containerShiftsRef.current).toBe(shifts);
    expect(result.current.arrangedRef.current).toBe(geometry);
  });

  it('has no frames before the layout lands', () => {
    const { compiled } = scene();
    const { result } = renderHook(() => useMoveFrames(compiled, null, new Map()));
    expect(result.current.containerBasesRef.current.size).toBe(0);
    expect(result.current.arrangedRef.current).toBeNull();
  });

  it('keeps the refs themselves across a re-layout, with the new frames in them', () => {
    const { compiled, geometry } = scene();
    const { result, rerender } = renderHook((g: Map<string, NodeGeometry>) => useMoveFrames(compiled, g, new Map()), {
      initialProps: geometry,
    });
    const refs = result.current;
    const moved = new Map(geometry).set('sys', { x: 0, y: 0, width: 300, height: 200 });
    rerender(moved);
    expect(result.current.containerBasesRef).toBe(refs.containerBasesRef);
    expect(result.current.containerBasesRef.current.get('sys')).toEqual({ x: 0, y: 0 });
  });
});
