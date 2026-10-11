// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDockLayout } from '../dock/useDockLayout';
import { useCanvasSelection, type UseCanvasSelectionOptions } from './useCanvasSelection';

const mount = (initial: Partial<UseCanvasSelectionOptions> = {}) => {
  const onSelect = vi.fn();
  const hook = renderHook((props: UseCanvasSelectionOptions) => useCanvasSelection(props), {
    initialProps: { editing: true, lastRelation: undefined, onSelect, ...initial },
  });
  return {
    hook,
    onSelect,
    get now() {
      return hook.result.current;
    },
  };
};

describe('useCanvasSelection: select', () => {
  // Breaks if a selection the user makes stops dropping the loop analysis's
  // highlight and comparison, or drops them more than once.
  it('sets the selection and drops what hangs off the old one', () => {
    const t = mount();
    act(() => t.now.select({ kind: 'edge', id: 'r1' }));
    expect(t.now.selection).toEqual({ kind: 'edge', id: 'r1' });
    expect(t.onSelect).toHaveBeenCalledTimes(1);
  });

  // Breaks if moving off the node being renamed keeps its Name field armed, or
  // re-selecting that node disarms it.
  it('ends the rename moment anywhere but on the node being renamed', () => {
    const t = mount();
    act(() => t.now.selectNodeForRename('n1'));
    act(() => t.now.select({ kind: 'node', id: 'n1' }));
    expect(t.now.renameId).toBe('n1');
    act(() => t.now.select({ kind: 'node', id: 'n2' }));
    expect(t.now.renameId).toBeNull();
  });

  // Breaks if a selection starts clearing the canvas multi-selection, which only
  // the renderer's report sets.
  it('leaves the multi-selection to the canvas', () => {
    const t = mount();
    act(() => t.now.multiSelect(['a', 'b']));
    act(() => t.now.select(null));
    expect(t.now.groupSel).toEqual(['a', 'b']);
  });

  // Breaks if a canvas selection starts switching the inspector tab: placing
  // from the Library would cost a trip back to the palette for every node.
  it('never moves the inspector tab', () => {
    const { result } = renderHook(() => ({
      dock: useDockLayout(),
      sel: useCanvasSelection({ editing: true, lastRelation: undefined, onSelect: () => {} }),
    }));
    act(() => result.current.dock.selectTab('library'));
    act(() => result.current.sel.select({ kind: 'node', id: 'a' }));
    act(() => result.current.sel.select({ kind: 'edge', id: 'x' }));
    expect(result.current.dock.leftTab).toBe('library');
  });
});

describe("useCanvasSelection: the studio's own selections", () => {
  // Breaks if selecting a node the studio just made starts dropping the loop
  // analysis or the rename moment the way a user's selection does.
  it('selects a new node and nothing else', () => {
    const t = mount();
    act(() => t.now.selectNodeForRename('n1'));
    expect(t.now).toMatchObject({ selection: { kind: 'node', id: 'n1' }, renameId: 'n1' });
    act(() => t.now.selectNode('n2'));
    expect(t.now).toMatchObject({ selection: { kind: 'node', id: 'n2' }, renameId: 'n1' });
    expect(t.onSelect).not.toHaveBeenCalled();
  });

  // Breaks if a repeated request for the same node stops re-arming the canvas
  // editor (the nonce must change every time).
  it('re-arms the label and threat requests every time, even for the same target', () => {
    const t = mount();
    act(() => t.now.requestLabelEdit('n1'));
    const first = t.now.labelRequest;
    act(() => t.now.requestLabelEdit('n1'));
    expect(t.now.labelRequest).toEqual({ id: 'n1', nonce: (first?.nonce ?? 0) + 1 });
    act(() => t.now.requestThreatEdit({ node: 'n1' }, 't1'));
    act(() => t.now.requestThreatEdit({ node: 'n1' }, 't1'));
    expect(t.now.threatRequest).toEqual({ target: { node: 'n1' }, id: 't1', nonce: 2 });
  });
});

describe('useCanvasSelection: the connect gesture', () => {
  // Breaks if the relation a connect draws stops being selected (its panel would
  // not open), if it keeps a pending rename, or if the effect keys on the id
  // alone: a relation drawn again after a delete repeats its id, not its nonce.
  it('selects each relation a connect draws while editing', () => {
    const t = mount();
    act(() => t.now.selectNodeForRename('n1'));
    t.hook.rerender({ editing: true, lastRelation: { id: 'a->b#0', nonce: 1 }, onSelect: t.onSelect });
    expect(t.now).toMatchObject({ selection: { kind: 'edge', id: 'a->b#0' }, renameId: null });
    act(() => t.now.select(null));
    t.hook.rerender({ editing: true, lastRelation: { id: 'a->b#0', nonce: 2 }, onSelect: t.onSelect });
    expect(t.now.selection).toEqual({ kind: 'edge', id: 'a->b#0' });
  });

  // Breaks if a relation from a session that has ended is selected in view mode.
  it('ignores the last relation outside edit mode', () => {
    const t = mount({ editing: false });
    t.hook.rerender({ editing: false, lastRelation: { id: 'a->b#0', nonce: 1 }, onSelect: t.onSelect });
    expect(t.now.selection).toBeNull();
  });
});

describe('useCanvasSelection: the multi-selection', () => {
  // Breaks if a re-report of the same set hands out a new array (everything
  // reading the multi-selection would re-render on every report the renderer
  // makes), or multiSelect changes identity (DiagramView holds it).
  it('keeps the same array for a re-report of the same set, through a stable callback', () => {
    const t = mount();
    const multiSelect = t.now.multiSelect;
    act(() => multiSelect(['a', 'b']));
    const set = t.now.groupSel;
    act(() => multiSelect(['a', 'b']));
    expect(t.now.groupSel).toBe(set);
    act(() => multiSelect(['b', 'a']));
    expect(t.now.groupSel).toEqual(['b', 'a']);
    expect(t.now.multiSelect).toBe(multiSelect);
  });
});
