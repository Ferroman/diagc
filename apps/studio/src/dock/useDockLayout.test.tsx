// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDockLayout } from './useDockLayout';

beforeEach(() => localStorage.clear());

describe('useDockLayout', () => {
  // Breaks if a default changes: both docks open, at their default widths, on
  // the Properties tab.
  it('opens both docks at their default widths on Properties', () => {
    const { result } = renderHook(() => useDockLayout());
    expect(result.current).toMatchObject({
      leftCollapsed: false,
      rightCollapsed: false,
      leftWidth: 300,
      rightWidth: 320,
      leftTab: 'properties',
    });
  });

  // Breaks if a collapse stops being stored as 'collapsed' / 'expanded' under
  // its own side's key.
  it("stores each dock's collapse under its own key", () => {
    const { result } = renderHook(() => useDockLayout());
    act(() => result.current.toggleRight());
    expect(result.current.rightCollapsed).toBe(true);
    expect(localStorage.getItem('diagc.rightDock')).toBe('collapsed');
    expect(localStorage.getItem('diagc.leftDock')).toBe('expanded');
    act(() => result.current.toggleLeft());
    expect(localStorage.getItem('diagc.leftDock')).toBe('collapsed');
  });

  // Breaks if a stored width stops being clamped to its side's range, or a
  // garbage one stops falling back to the default.
  it('clamps stored widths and ignores unreadable ones', () => {
    localStorage.setItem('diagc.leftDockWidth', '10');
    localStorage.setItem('diagc.rightDockWidth', 'wide');
    const { result } = renderHook(() => useDockLayout());
    expect(result.current.leftWidth).toBe(220);
    expect(result.current.rightWidth).toBe(320);
    act(() => result.current.setRightWidth(400));
    expect(localStorage.getItem('diagc.rightDockWidth')).toBe('400');
  });

  // Breaks if asking for an inspector tab stops opening a folded left dock (the
  // tab would change out of sight), or a plain tab change starts opening it.
  it('opens the left dock when a tab is asked for, but not on a plain tab change', () => {
    localStorage.setItem('diagc.leftDock', 'collapsed');
    const { result } = renderHook(() => useDockLayout());
    act(() => result.current.selectTab('library'));
    expect(result.current).toMatchObject({ leftTab: 'library', leftCollapsed: true });
    act(() => result.current.showInspectorTab('properties'));
    expect(result.current).toMatchObject({ leftTab: 'properties', leftCollapsed: false, rightCollapsed: false });
  });

  // Breaks if the Library tab's search moves back into the panel, where it
  // resets on every trip to Properties and back.
  it('keeps the library view across tab changes', () => {
    const { result } = renderHook(() => useDockLayout());
    act(() => result.current.libraryView[1]((v) => ({ ...v, query: 'queue' })));
    act(() => result.current.selectTab('library'));
    act(() => result.current.selectTab('properties'));
    expect(result.current.libraryView[0].query).toBe('queue');
  });

  // Breaks if the handlers given to Dock and InspectorTabs as props change
  // identity between renders.
  it('hands out stable width and tab setters', () => {
    const { result, rerender } = renderHook(() => useDockLayout());
    const first = result.current;
    act(() => result.current.toggleLeft());
    rerender();
    expect(result.current.setLeftWidth).toBe(first.setLeftWidth);
    expect(result.current.setRightWidth).toBe(first.setRightWidth);
    expect(result.current.selectTab).toBe(first.selectTab);
  });
});
