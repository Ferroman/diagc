// @vitest-environment jsdom
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compileView, model, type DiagramModel } from '@diagc/core';
import { createKindRegistry, createTypeRegistry } from './registry';
import { useLegendState, type LegendStateInput } from './useLegendState';

function fixture(withLegend = true): DiagramModel {
  const m = model('shop');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'database' });
  m.relate(a, b, { kind: 'sync' });
  const json = m.toJSON();
  if (withLegend) json.legend = {};
  return json;
}

function inputFor(m: DiagramModel, over: Partial<LegendStateInput> = {}): LegendStateInput {
  return {
    model: m,
    plane: undefined,
    compiled: compileView(m, {}),
    drillRoot: undefined,
    activeLayers: undefined,
    typeRegistry: createTypeRegistry(),
    kindRegistry: createKindRegistry(),
    canToggleLayers: false,
    strokes: [],
    drawingsVisible: false,
    ...over,
  };
}

describe('useLegendState', () => {
  it('shows the legend when the model opts in and builds rows for the drawn view', () => {
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), { initialProps: inputFor(fixture()) });
    expect(result.current.showLegend).toBe(true);
    expect(result.current.legendRowList.length).toBeGreaterThan(0);
  });

  it('stays hidden with no legend config and yields no rows', () => {
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), { initialProps: inputFor(fixture(false)) });
    expect(result.current.showLegend).toBe(false);
    expect(result.current.legendRowList).toEqual([]);
  });

  it('re-seeds the local show/hide override when the diagram changes', () => {
    const { result, rerender } = renderHook((p: LegendStateInput) => useLegendState(p), {
      initialProps: inputFor(fixture()),
    });
    act(() => result.current.setShowLegend(false));
    expect(result.current.showLegend).toBe(false);
    const other = fixture();
    other.id = 'other';
    rerender(inputFor(other));
    expect(result.current.showLegend).toBe(true);
  });

  it('reserves viewport space only while a measured legend is visible', () => {
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), { initialProps: inputFor(fixture()) });
    expect(result.current.legendReserveRef.current).toBeNull(); // not measured yet
    act(() => result.current.setLegendSize({ width: 200, height: 80 }));
    expect(result.current.legendReserveRef.current).toEqual({ side: 'bottom', px: 96 });
    act(() => result.current.setShowLegend(false));
    expect(result.current.legendReserveRef.current).toBeNull();
  });

  it('reserves the top edge for a top-positioned legend', () => {
    const m = fixture();
    m.legend = { position: 'top-left' };
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), { initialProps: inputFor(m) });
    act(() => result.current.setLegendSize({ width: 100, height: 40 }));
    expect(result.current.legendReserveRef.current).toEqual({ side: 'top', px: 56 });
  });

  // ---- a legend nobody declared ------------------------------------------------
  function wordless(withLegend = false): DiagramModel {
    const m = model('claim');
    const act = m.activity('claim', { name: 'Expense claim' });
    const lane = act.lane('finance', { name: 'Finance' });
    act.flow(lane.start(), lane.end());
    const json = m.toJSON();
    if (withLegend) json.legend = {};
    return json;
  }
  const expanded = (m: DiagramModel) =>
    compileView(m, { pins: Object.fromEntries(m.containment.map((c) => [c.parent, 'expanded' as const])) });

  it('offers a legend, hidden, on a diagram of wordless shapes that declared none', () => {
    const m = wordless();
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), { initialProps: inputFor(m, { compiled: expanded(m) }) });
    // rows to show are what puts the button on the canvas; hidden is what keeps
    // an undeclared legend out of an export, which has no button to press
    expect(result.current.legendRowList.map((r) => r.label)).toEqual(['Control flow', 'Start', 'End']);
    expect(result.current.showLegend).toBe(false);
    expect(result.current.legendReserveRef.current).toBeNull();
    act(() => result.current.setShowLegend(true));
    expect(result.current.showLegend).toBe(true);
  });

  it('starts that legend shown once the diagram declares it', () => {
    const m = wordless(true);
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), { initialProps: inputFor(m, { compiled: expanded(m) }) });
    expect(result.current.showLegend).toBe(true);
  });

  it('hands the notation colours to the rows', () => {
    const m = model('reset');
    const tm = m.threatModel();
    tm.boundary('dmz', 'DMZ').contains(tm.process('auth', 'Auth'));
    const json = m.toJSON();
    const { result } = renderHook((p: LegendStateInput) => useLegendState(p), {
      initialProps: inputFor(json, { compiled: expanded(json), nodeColors: new Map([['dmz', '#c62828']]) }),
    });
    expect(result.current.legendRowList.find((r) => r.id === 'types:tm-boundary')?.swatch).toMatchObject({ color: '#c62828' });
  });
});
