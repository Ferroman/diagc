// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeverageFocus } from '@diagc/renderer';
import { useCausalLoopAnalysis, type UseCausalLoopAnalysisOptions } from './useCausalLoopAnalysis';

const viewing: UseCausalLoopAnalysisOptions = {
  editing: false,
  loopAnalysis: true,
  selection: { kind: 'node', id: 'a' },
  groupSel: [],
};
const mount = (initial: Partial<UseCausalLoopAnalysisOptions> = {}) =>
  renderHook((props: UseCausalLoopAnalysisOptions) => useCausalLoopAnalysis(props), {
    initialProps: { ...viewing, ...initial },
  });
const row: LeverageFocus = { key: 'loop-1', nodes: ['a', 'b'], edges: ['a->b#0'] };

describe('useCausalLoopAnalysis: comparing two variables', () => {
  // Breaks if a ctrl-click stops comparing the clicked node with the selected
  // one, stops toggling off on a second click, or keeps a row highlight that no
  // longer matches what is compared.
  it('compares a second node with the selected one, and a second click undoes it', () => {
    const { result } = mount();
    act(() => result.current.focusLeverage(row));
    act(() => result.current.compareSelect('b'));
    expect(result.current.compareId).toBe('b');
    expect(result.current.leverageFocus).toBeNull();
    act(() => result.current.compareSelect('b'));
    expect(result.current.compareId).toBeNull();
  });

  // Breaks if a comparison can start while editing, off a loop-analysing
  // notation, without a single node selected, or against the node itself.
  it('compares only in view mode, on a loop notation, from another selected node', () => {
    for (const props of [
      { ...viewing, editing: true },
      { ...viewing, loopAnalysis: false },
      { ...viewing, selection: { kind: 'edge' as const, id: 'r' } },
      { ...viewing, selection: null },
    ]) {
      const { result } = mount(props);
      act(() => result.current.compareSelect('b'));
      expect(result.current.compareId).toBeNull();
    }
    const { result } = mount();
    act(() => result.current.compareSelect('a'));
    expect(result.current.compareId).toBeNull();
  });

  // Breaks if a selection move stops dropping both the row and the comparison.
  it('drops the row and the comparison together', () => {
    const { result } = mount();
    act(() => result.current.compareSelect('b'));
    act(() => result.current.focusLeverage(row));
    act(() => result.current.dropFocus());
    expect(result.current).toMatchObject({ compareId: null, leverageFocus: null });
    act(() => result.current.compareSelect('b'));
    act(() => result.current.clearCompare());
    expect(result.current.compareId).toBeNull();
  });
});

describe('useCausalLoopAnalysis: the canvas highlight', () => {
  // Breaks if the highlight's precedence changes: while editing only a
  // multi-selection of two or more glows; in view mode a focused report row
  // beats the compared pair.
  it('glows the multi-selection while editing, else the row, else the pair', () => {
    const editing = mount({ editing: true, groupSel: ['a'] });
    expect(editing.result.current.externalHighlight).toBeNull();
    editing.rerender({ ...viewing, editing: true, groupSel: ['a', 'b'] });
    expect(editing.result.current.externalHighlight).toEqual({ nodes: ['a', 'b'], edges: [] });

    const { result } = mount();
    expect(result.current.externalHighlight).toBeNull();
    act(() => result.current.compareSelect('c'));
    expect(result.current.externalHighlight).toEqual({ nodes: ['a', 'c'], edges: [] });
    act(() => result.current.focusLeverage(row));
    expect(result.current.externalHighlight).toBe(row);
  });
});

describe('useCausalLoopAnalysis: the signed graph', () => {
  // Breaks if handleCldEdges changes identity between renders: DiagramView
  // reports the graph through it from an effect, and a new one on every render
  // re-renders the loop overlay forever. Also the LeveragePanel's onFocus.
  it('takes the reported graph through stable callbacks', () => {
    const { result, rerender } = mount();
    const first = result.current;
    const edges = [{ id: 'a->b#0', from: 'a', to: 'b', polarity: '+' as const }];
    act(() => first.handleCldEdges(edges));
    rerender(viewing);
    expect(result.current.cldEdges).toBe(edges);
    expect(result.current.handleCldEdges).toBe(first.handleCldEdges);
    expect(result.current.focusLeverage).toBe(first.focusLeverage);
  });
});
