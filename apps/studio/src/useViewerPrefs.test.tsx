// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { diagramStyleOf, useViewerPrefs } from './useViewerPrefs';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('useViewerPrefs', () => {
  // Breaks if the theme stops starting from the host's seed, or the document
  // stops following it (the published pages and the studio share the colours).
  it('starts from the seeded theme and paints the document with it', () => {
    const { result } = renderHook(() => useViewerPrefs('light'));
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  // Breaks if a toggle computes from the render it was made in rather than from
  // the latest value: two toggles in one batch must land back where they began.
  it('toggles from the latest value', () => {
    const { result } = renderHook(() => useViewerPrefs('dark'));
    act(() => {
      result.current.toggleTheme();
      result.current.toggleTheme();
      result.current.toggleSnap();
      result.current.toggleSnap();
    });
    expect(result.current.theme).toBe('dark');
    expect(result.current.snap).toBe(false);
  });

  // Breaks if the theme starts being stored: the host's seed would lose to it.
  it('never stores the theme', () => {
    const { result } = renderHook(() => useViewerPrefs('dark'));
    act(() => result.current.toggleTheme());
    expect(Object.keys(localStorage).filter((k) => k.includes('theme'))).toEqual([]);
  });

  // Breaks if the style key or its raw-string format changes.
  it('remembers the style preset as its raw id', () => {
    localStorage.setItem('diagc.style', 'pencil');
    const { result } = renderHook(() => useViewerPrefs('dark'));
    expect(result.current.style).toBe('pencil');
    act(() => result.current.setStyle('marker'));
    expect(localStorage.getItem('diagc.style')).toBe('marker');
  });

  // Breaks if snap stops defaulting off, stops reading only 'true' as on, or
  // stops writing 'true' / 'false'.
  it("remembers snap as 'true' or 'false'", () => {
    localStorage.setItem('diagc.snap', 'yes');
    const { result } = renderHook(() => useViewerPrefs('dark'));
    expect(result.current.snap).toBe(false);
    act(() => result.current.toggleSnap());
    expect(localStorage.getItem('diagc.snap')).toBe('true');
    localStorage.setItem('diagc.snap', 'true');
    expect(renderHook(() => useViewerPrefs('dark')).result.current.snap).toBe(true);
  });

  // Breaks if setStyle stops being the state's own setter: the style select's
  // handler is the only caller, but a stable identity is what it had.
  it('hands out a stable setStyle', () => {
    const { result, rerender } = renderHook(() => useViewerPrefs('dark'));
    const first = result.current.setStyle;
    act(() => result.current.toggleSnap());
    rerender();
    expect(result.current.setStyle).toBe(first);
  });
});

describe('diagramStyleOf', () => {
  // Breaks if a diagram's unknown style outranks the viewer's preference (a
  // retired preset would wedge the file), or a known one stops outranking it.
  it("is the diagram's own style when it names a known preset, else none", () => {
    const model = (style?: string) => ({
      version: 1 as const,
      id: 'm',
      name: 'm',
      ...(style !== undefined ? { style } : {}),
      nodes: [],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    });
    expect(diagramStyleOf(model('clean'))).toBe('clean');
    expect(diagramStyleOf(model('retired-preset'))).toBeUndefined();
    expect(diagramStyleOf(model())).toBeUndefined();
    expect(diagramStyleOf(undefined)).toBeUndefined();
  });
});
