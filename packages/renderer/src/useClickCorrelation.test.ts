// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClickCorrelation } from './useClickCorrelation';

function setup() {
  const { result } = renderHook(() => useClickCorrelation());
  return result.current;
}

describe('useClickCorrelation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes a node drill on the SAME node within the window (detail>=2)', () => {
    const c = setup();
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    expect(c.consumeNodeDrill('a', { clientX: 12, clientY: 12 }, 2)).toBe(true);
    // consumed: a third click can't re-trigger
    expect(c.consumeNodeDrill('a', { clientX: 12, clientY: 12 }, 2)).toBe(false);
  });

  it('a different node, a detail-1 click, or an expired window do not drill', () => {
    const c = setup();
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    expect(c.consumeNodeDrill('b', { clientX: 12, clientY: 12 }, 2)).toBe(false);
    expect(c.consumeNodeDrill('a', { clientX: 12, clientY: 12 }, 1)).toBe(false);
    expect(c.consumeNodeDrill('a', { clientX: 12, clientY: 12 }, 2)).toBe(true); // still pending
    // expired window
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500); // window is strict (< 500ms)
    expect(c.consumeNodeDrill('a', { clientX: 12, clientY: 12 }, 2)).toBe(false);
    // too far away
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    expect(c.consumeNodeDrill('a', { clientX: 10, clientY: 60 }, 2)).toBe(false); // 50px > 40px
  });

  it('the pane guard completes a node drill with a real second click (detail>=2)', () => {
    const c = setup();
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    expect(c.takePaneNodeDrill({ clientX: 13, clientY: 13 }, 2)).toBe('a');
    // consumed / cleared
    expect(c.takePaneNodeDrill({ clientX: 13, clientY: 13 }, 2)).toBeNull();
    // detail 1 (a click-then-click-elsewhere deselect) must NOT drill
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    expect(c.takePaneNodeDrill({ clientX: 13, clientY: 13 }, 1)).toBeNull();
  });

  it('same-edge continuation and the pane guard share the exact window predicate', () => {
    // The "exact complement" invariant: a click that consumed by the edge
    // wrapper must also be consumable by the pane guard (and vice versa). Both
    // run the identical withinAddWindow check — a boundary click either opens
    // the editor on the edge or on the pane it fell through to, never both and
    // never neither (no stray node, no missed add).
    const c = setup();
    const first = { clientX: 30, clientY: 30 };
    c.recordEdgeClick('e1', first);
    expect(c.consumeEdgeAdd('e1', { clientX: 31, clientY: 31 })).toBe(true);

    c.recordEdgeClick('e1', first);
    expect(c.takePaneEdgeAdd({ clientX: 31, clientY: 31 })).toBe('e1');

    c.recordEdgeClick('e1', first);
    vi.advanceTimersByTime(500);
    expect(c.consumeEdgeAdd('e1', { clientX: 31, clientY: 31 })).toBe(false);
    expect(c.takePaneEdgeAdd({ clientX: 31, clientY: 31 })).toBeNull();
  });

  it('a different edge does not consume, leaving the record for the pane guard', () => {
    const c = setup();
    c.recordEdgeClick('e1', { clientX: 10, clientY: 10 });
    expect(c.consumeEdgeAdd('e2', { clientX: 12, clientY: 12 })).toBe(false);
    // the same record is still pending — the pane the second click fell
    // through to can complete it
    expect(c.takePaneEdgeAdd({ clientX: 12, clientY: 12 })).toBe('e1');
  });

  it('pane deselect-style clearAll breaks both protocols', () => {
    const c = setup();
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    c.recordEdgeClick('e1', { clientX: 10, clientY: 10 });
    c.clearAll();
    expect(c.consumeNodeDrill('a', { clientX: 10, clientY: 10 }, 2)).toBe(false);
    expect(c.consumeEdgeAdd('e1', { clientX: 10, clientY: 10 })).toBe(false);
  });

  it('an edge click breaks a pending node drill, and vice versa', () => {
    const c = setup();
    c.recordNodeClick('a', { clientX: 10, clientY: 10 });
    c.clearNodeClick();
    expect(c.consumeNodeDrill('a', { clientX: 10, clientY: 10 }, 2)).toBe(false);

    c.recordEdgeClick('e1', { clientX: 10, clientY: 10 });
    c.clearEdgeClick();
    expect(c.consumeEdgeAdd('e1', { clientX: 10, clientY: 10 })).toBe(false);
  });
});