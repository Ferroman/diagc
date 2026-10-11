// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveKeymap } from './keymap';
import { useHotkeyPrefs } from './useHotkeyPrefs';

beforeEach(() => localStorage.clear());

describe('useHotkeyPrefs', () => {
  // Breaks if the stored overrides stop reaching the keymap, or the key or its
  // JSON format changes (everyone's rebound keys would reset).
  it('applies the stored overrides and stores the next ones as JSON', () => {
    localStorage.setItem('diagc.hotkeys', JSON.stringify({ 'window.snap': ['Q'] }));
    const { result } = renderHook(() => useHotkeyPrefs());
    expect(result.current.overrides).toEqual({ 'window.snap': ['Q'] });
    expect(result.current.keymap['window.snap']).toEqual(['Q']);
    act(() => result.current.setOverrides({ 'canvas.laser': ['K'] }));
    expect(localStorage.getItem('diagc.hotkeys')).toBe(JSON.stringify({ 'canvas.laser': ['K'] }));
    expect(result.current.keymap).toEqual(resolveKeymap({ 'canvas.laser': ['K'] }));
  });

  // Breaks if the keymap is rebuilt on every render: it feeds the hotkeys
  // context, whose consumers would all re-render with it.
  it('keeps the keymap while the overrides stand', () => {
    const { result, rerender } = renderHook(() => useHotkeyPrefs());
    const first = result.current;
    act(() => result.current.openDialog());
    rerender();
    expect(result.current.keymap).toBe(first.keymap);
    expect(result.current.mac).toBe(first.mac);
    expect(result.current.setOverrides).toBe(first.setOverrides);
  });

  // Breaks if closing stops handing focus back to the ⚙ button, which leaves a
  // keyboard user nowhere once the dialog unmounts.
  it('opens the dialog, and closing it returns focus to the button that opened it', () => {
    const gear = document.createElement('button');
    document.body.append(gear);
    const { result } = renderHook(() => useHotkeyPrefs());
    result.current.gearRef.current = gear;
    expect(result.current.dialogOpen).toBe(false);
    act(() => result.current.openDialog());
    expect(result.current.dialogOpen).toBe(true);
    act(() => result.current.closeDialog());
    expect(result.current.dialogOpen).toBe(false);
    expect(document.activeElement).toBe(gear);
    gear.remove();
  });
});
