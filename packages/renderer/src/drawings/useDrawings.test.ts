// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { layoutPlaneKey, model, type DiagramModel, type Drawings } from '@diagc/core/internal';
import { useDrawings } from './useDrawings';

const json = model('ink').toJSON();
const drawings: Drawings = {
  version: 1,
  planes: { [layoutPlaneKey(json, undefined)]: [{ id: 'k1', points: [0, 0, 40, 40] }] },
};

describe('useDrawings', () => {
  it("draws the active plane's strokes, and none for a plane that has none", () => {
    expect(renderHook(() => useDrawings({ drawings, model: json })).result.current.strokes.map((s) => s.id)).toEqual([
      'k1',
    ]);
    expect(renderHook(() => useDrawings({ model: json })).result.current.strokes).toEqual([]);
  });

  it('keeps strokesRef current every render', () => {
    const { result } = renderHook(() => useDrawings({ drawings, model: json }));
    expect(result.current.strokesRef.current).toBe(result.current.strokes);
  });

  it('shows the ink again on another diagram', () => {
    const { result, rerender } = renderHook((m: DiagramModel) => useDrawings({ drawings, model: m }), {
      initialProps: json,
    });
    act(() => result.current.setDrawingsVisible(false));
    rerender({ ...json, nodes: [...json.nodes] });
    expect(result.current.drawingsVisible).toBe(false);
    rerender(model('other').toJSON());
    expect(result.current.drawingsVisible).toBe(true);
  });
});
