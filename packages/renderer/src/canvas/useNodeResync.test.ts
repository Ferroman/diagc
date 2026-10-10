// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { useNodeResync, type NodeResyncInput } from './useNodeResync';
import type { Positions } from './useNudge';

const box = (id: string, x = 0): Node => ({ id, position: { x, y: 0 }, data: {} });

/** a resync against a copy that holds `prev`; returns what the copy becomes */
function resync(over: Partial<NodeResyncInput>, prev: Node[] = []): { next: Node[]; claim: string | null } {
  let next: Node[] = prev;
  const selectOnAppearRef = over.selectOnAppearRef ?? { current: null };
  const allNodes = over.allNodes ?? [box('a'), box('b')];
  renderHook(() =>
    useNodeResync({
      allNodes,
      derivedNodes: over.derivedNodes ?? allNodes,
      setRfNodes: (u) => {
        next = typeof u === 'function' ? u(next) : u;
      },
      selectOnAppearRef,
      pendingRef: over.pendingRef ?? { current: {} },
    }),
  );
  return { next, claim: selectOnAppearRef.current };
}

describe('useNodeResync', () => {
  it('hands React Flow the derived nodes themselves when nothing is selected or pending', () => {
    const allNodes = [box('a'), box('b')];
    expect(resync({ allNodes }).next).toBe(allNodes);
  });

  it('keeps the selection React Flow holds on its copy', () => {
    const { next } = resync({}, [{ ...box('a'), selected: true }, box('b')]);
    expect(next.map((n) => n.selected === true)).toEqual([true, false]);
  });

  it('keeps a pending arrow-key move on screen until it is committed', () => {
    const pendingRef = { current: { b: { x: 40, y: 5 } } as Positions };
    const { next } = resync({ pendingRef });
    expect(next.find((n) => n.id === 'b')?.position).toEqual({ x: 40, y: 5 });
    expect(next.find((n) => n.id === 'a')?.position).toEqual({ x: 0, y: 0 });
  });

  it('hands the selection to a claimed box once it arrives, and clears the claim', () => {
    const { next, claim } = resync({ selectOnAppearRef: { current: 'b' } }, [{ ...box('a'), selected: true }]);
    expect(next.filter((n) => n.selected === true).map((n) => n.id)).toEqual(['b']);
    expect(claim).toBeNull();
  });

  it('keeps a claim for a box not laid out yet, and the selection where it is', () => {
    const { next, claim } = resync({ selectOnAppearRef: { current: 'fresh' } }, [{ ...box('a'), selected: true }]);
    expect(next.filter((n) => n.selected === true).map((n) => n.id)).toEqual(['a']);
    expect(claim).toBe('fresh');
  });

  it('checks a claim against the boxes, never the notes', () => {
    const note = box('note:node:a');
    const { claim } = resync({
      allNodes: [box('a'), note],
      derivedNodes: [box('a')],
      selectOnAppearRef: { current: 'note:node:a' },
    });
    expect(claim).toBe('note:node:a');
  });
});
