// @vitest-environment jsdom
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileView, model, type DiagramModel } from '@diagc/core';
import { notationProfile } from './notations';
import { useLoopOverlay, type LoopOverlayInput } from './useLoopOverlay';

/** a → b (+), b → c (−), c → a (+): one signed triangle, all nodes top-level */
function fixture(): DiagramModel {
  const m = model('cld');
  const a = m.node('a');
  const b = m.node('b');
  const c = m.node('c');
  m.relate(a, b, { kind: 'influence', polarity: '+' });
  m.relate(b, c, { kind: 'influence', polarity: '-' });
  m.relate(c, a, { kind: 'influence', polarity: '+' });
  return m.toJSON();
}

function inputFor(over: Partial<LoopOverlayInput> = {}): LoopOverlayInput {
  const m = fixture();
  return {
    profile: notationProfile('causal-loop'),
    compiled: compileView(m, {}),
    model: m,
    plane: undefined,
    externalHighlight: undefined,
    onCldEdges: undefined,
    ...over,
  };
}

describe('useLoopOverlay', () => {
  it('derives signed loop edges from the drawn view and reports them upward', () => {
    const onCldEdges = vi.fn();
    const { result } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), {
      initialProps: inputFor({ onCldEdges }),
    });
    expect(result.current.cld).toBe(true);
    expect(result.current.loopEdges).toEqual([
      expect.objectContaining({ from: 'a', to: 'b', polarity: '+' }),
      expect.objectContaining({ from: 'b', to: 'c', polarity: '-' }),
      expect.objectContaining({ from: 'c', to: 'a', polarity: '+' }),
    ]);
    expect(onCldEdges).toHaveBeenCalledWith(result.current.loopEdges);
  });

  it('yields no loop edges outside the CLD notation', () => {
    const { result } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), {
      initialProps: inputFor({ profile: notationProfile() }),
    });
    expect(result.current.cld).toBe(false);
    expect(result.current.loopEdges).toBeNull();
  });

  it('selecting a node focuses its one-edge neighborhood as the gentle variant', () => {
    const { result } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), { initialProps: inputFor() });
    expect(result.current.loopHighlight.active).toBe(false);
    expect(result.current.loopHighlight.focusId).toBeNull();
    act(() => result.current.setSelectedNode('a'));
    const hl = result.current.loopHighlight;
    expect(hl.active).toBe(true);
    expect(hl.variant).toBe('focus');
    expect([...hl.nodes].sort()).toEqual(['a', 'b', 'c']); // a→b out, c→a in
    expect(hl.edges.size).toBe(2);
    expect(hl.focusId).toBe('a');
    act(() => result.current.setSelectedNode(null));
    expect(result.current.loopHighlight.focusId).toBeNull();
  });

  it("unions the notation's own `related` into the neighbourhood, alongside the edge-derived one", () => {
    // a stand-in profile with a `related` hook, the shape a plan's is: it
    // adds 'z' to whatever node is selected, with no edge behind it at all
    const related = notationProfile('causal-loop');
    const withRelated = { ...related, related: (_m: DiagramModel, _p: string | undefined, id: string) => (id === 'a' ? ['z'] : []) };
    const { result } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), {
      initialProps: inputFor({ profile: withRelated }),
    });
    act(() => result.current.setSelectedNode('a'));
    const hl = result.current.loopHighlight;
    // 'b' and 'c' from the edges (as above), 'z' from `related` alone
    expect([...hl.nodes].sort()).toEqual(['a', 'b', 'c', 'z']);
    expect(hl.focusId).toBe('a');
  });

  it('a toggled loop badge glows its set; toggling the same key clears it', () => {
    const { result } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), { initialProps: inputFor() });
    act(() => result.current.loopHighlight.toggle('loop-1', ['a', 'b'], ['e1']));
    expect(result.current.loopHighlight.activeKey).toBe('loop-1');
    expect(result.current.loopHighlight.variant).toBe('loop');
    expect([...result.current.loopHighlight.nodes].sort()).toEqual(['a', 'b']);
    act(() => result.current.loopHighlight.toggle('loop-1', ['a', 'b'], ['e1']));
    expect(result.current.loopHighlight.activeKey).toBeNull();
    expect(result.current.loopHighlight.active).toBe(false);
  });

  it('a host-driven highlight outranks the badge and the node focus', () => {
    const { result, rerender } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), {
      initialProps: inputFor(),
    });
    act(() => result.current.setSelectedNode('a'));
    rerender(inputFor({ externalHighlight: { nodes: ['b'], edges: [] } }));
    expect(result.current.loopHighlight.variant).toBe('loop');
    expect([...result.current.loopHighlight.nodes]).toEqual(['b']);
  });

  it('a recompile clears the ephemeral loop and node selection', () => {
    const { result, rerender } = renderHook((p: LoopOverlayInput) => useLoopOverlay(p), {
      initialProps: inputFor(),
    });
    act(() => {
      result.current.setSelectedNode('a');
      result.current.loopHighlight.toggle('loop-1', ['a'], []);
    });
    expect(result.current.selectedNode).toBe('a');
    rerender(inputFor()); // fresh compiled object = plane/zoom/edit recompile
    expect(result.current.selectedNode).toBeNull();
    expect(result.current.loopHighlight.activeKey).toBeNull();
  });
});
