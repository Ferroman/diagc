// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useEditSession } from './useEditSession';

describe('useEditSession and the keyboard', () => {
  // The session used to own a keydown listener (N, Tab, P, E, Esc, undo/redo/save).
  // Shortcuts are the hotkeys dispatcher's now (hotkeys/useHotkeys); a second
  // listener here would run every one of them twice.
  it('listens to no keys of its own', () => {
    const hook = renderHook(() =>
      useEditSession({ setDrafts: () => {}, resetInspector: () => {}, leaveEditRef: useRef(() => true) }),
    );
    act(() => hook.result.current.setEditing(true));
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
