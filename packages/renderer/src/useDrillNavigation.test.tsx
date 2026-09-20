// @vitest-environment jsdom
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel } from '@diagramming/core';
import { useDrillNavigation, type DrillNavigationInput } from './useDrillNavigation';

/** sys > svc > inner, plus a free-standing `other` */
function fixture(): DiagramModel {
  const m = model('nav');
  const sys = m.node('sys', { type: 'system' });
  const svc = m.node('svc', { type: 'service' });
  const inner = m.node('inner', { type: 'service' });
  m.node('other', { type: 'service' });
  sys.contains(svc);
  svc.contains(inner);
  return m.toJSON();
}

function inputFor(over: Partial<DrillNavigationInput> = {}): DrillNavigationInput {
  return {
    model: fixture(),
    plane: undefined,
    enteredPathProp: undefined,
    onEnteredPathChange: undefined,
    visibleRef: { current: [] },
    onPlaneSwitch: () => {},
    isAlwaysExpanded: () => false,
    ...over,
  };
}

describe('useDrillNavigation', () => {
  it('enterNode drills to the full containment chain and reports it upward', () => {
    const onEnteredPathChange = vi.fn();
    const { result } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), {
      initialProps: inputFor({ onEnteredPathChange }),
    });
    expect(result.current.drillRoot).toBeUndefined();
    act(() => result.current.enterNode('inner'));
    expect(result.current.enteredPath).toEqual(['sys', 'svc', 'inner']);
    expect(result.current.drillRoot).toBe('inner');
    expect(result.current.pendingRootFitRef.current).toBe('glide');
    expect(onEnteredPathChange).toHaveBeenLastCalledWith(['sys', 'svc', 'inner']);
  });

  it('exitTo truncates to a breadcrumb; null exits to the bird\'s-eye', () => {
    const { result } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), { initialProps: inputFor() });
    act(() => result.current.enterNode('inner'));
    act(() => result.current.exitTo('sys'));
    expect(result.current.enteredPath).toEqual(['sys']);
    act(() => result.current.exitTo(null));
    expect(result.current.enteredPath).toEqual([]);
    expect(result.current.drillRoot).toBeUndefined();
  });

  it('refuses to drill into an always-expanded container or an unknown id', () => {
    const { result } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), {
      initialProps: inputFor({ isAlwaysExpanded: (id) => id === 'svc' }),
    });
    act(() => result.current.enterNode('svc'));
    expect(result.current.enteredPath).toEqual([]);
    act(() => result.current.enterNode('ghost'));
    expect(result.current.enteredPath).toEqual([]);
  });

  it('a different diagram resets navigation and the visible snapshot', () => {
    const visibleRef = { current: ['svc'] };
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), {
      initialProps: inputFor({ visibleRef }),
    });
    act(() => result.current.enterNode('svc'));
    const other = fixture();
    other.id = 'elsewhere';
    rerender(inputFor({ model: other, visibleRef }));
    expect(result.current.enteredPath).toEqual([]);
    expect(visibleRef.current).toEqual([]);
  });

  it('a different diagram asks for a fresh fit — a jump, the way a first open lands', () => {
    // React Flow's `fitView` prop fits on mount only, and the studio swaps the
    // model without remounting: unasked, the next diagram would open under the
    // last one's pan and zoom.
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), { initialProps: inputFor() });
    expect(result.current.pendingRootFitRef.current).toBeNull();
    const other = fixture();
    other.id = 'elsewhere';
    rerender(inputFor({ model: other }));
    expect(result.current.pendingRootFitRef.current).toBe('jump');
  });

  it('a deep link into a different diagram still jumps: the drill it carries does not turn the open into a glide', () => {
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), { initialProps: inputFor() });
    const other = fixture();
    other.id = 'elsewhere';
    rerender(inputFor({ model: other, enteredPathProp: ['sys'] }));
    expect(result.current.enteredPath).toEqual(['sys']);
    expect(result.current.pendingRootFitRef.current).toBe('jump');
  });

  it('an edit of the same diagram leaves the camera alone', () => {
    // same id, new object: an edit, or the compile watcher's reload — neither
    // may move the view out from under whoever is reading it
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), { initialProps: inputFor() });
    rerender(inputFor());
    expect(result.current.pendingRootFitRef.current).toBeNull();
  });

  it('an edit keeps the drill trail but prunes deleted nodes to the surviving prefix', () => {
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), {
      initialProps: inputFor(),
    });
    act(() => result.current.enterNode('inner'));
    const edited = fixture(); // same id, new object…
    edited.nodes = edited.nodes.filter((n) => n.id !== 'inner'); // …minus the node we are inside
    edited.containment = edited.containment.filter((e) => e.child !== 'inner');
    rerender(inputFor({ model: edited }));
    expect(result.current.enteredPath).toEqual(['sys', 'svc']);
    expect(result.current.drillRoot).toBe('svc');
  });

  it('a plane switch resets the trail and notifies the host', () => {
    const m = fixture();
    m.planes = [
      { id: 'arch', name: 'Architecture' },
      { id: 'infra', name: 'Infra' },
    ];
    const onPlaneSwitch = vi.fn();
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), {
      initialProps: inputFor({ model: m, plane: 'arch', onPlaneSwitch }),
    });
    act(() => result.current.enterNode('svc'));
    rerender(inputFor({ model: m, plane: 'infra', onPlaneSwitch }));
    expect(result.current.enteredPath).toEqual([]);
    expect(onPlaneSwitch).toHaveBeenCalledTimes(1);
  });

  it('applies a host-driven path (deep link), pruned to the model', () => {
    const { result, rerender } = renderHook((p: DrillNavigationInput) => useDrillNavigation(p), {
      initialProps: inputFor({ enteredPathProp: ['sys', 'svc', 'ghost'] }),
    });
    // seeded from the initial prop, unknown suffix dropped
    expect(result.current.enteredPath).toEqual(['sys', 'svc']);
    rerender(inputFor({ enteredPathProp: ['sys'] }));
    expect(result.current.enteredPath).toEqual(['sys']);
    expect(result.current.pendingRootFitRef.current).toBe('glide');
  });
});
