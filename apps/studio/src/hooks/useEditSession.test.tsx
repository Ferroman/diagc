// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useEditSession } from './useEditSession';

function setup(acts: boolean) {
  const thenWhat = vi.fn(() => acts);
  const hook = renderHook(() =>
    useEditSession({
      setDrafts: () => {},
      resetInspector: () => {},
      addNodeRef: useRef(() => {}),
      toolKeyRef: useRef(() => {}),
      leaveEditRef: useRef(() => true),
      thenWhatRef: useRef(thenWhat),
    }),
  );
  act(() => hook.result.current.setEditing(true));
  return thenWhat;
}
const press = (init: KeyboardEventInit) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};

describe('Tab in edit mode', () => {
  it('asks "and then what?", and keeps focus on the canvas only when something was added', () => {
    const acted = setup(true);
    expect(press({ key: 'Tab' }).defaultPrevented).toBe(true);
    expect(acted).toHaveBeenCalledTimes(1);
  });
  it('stays a plain Tab when there is nothing to extend, or with a modifier', () => {
    const idle = setup(false);
    expect(press({ key: 'Tab' }).defaultPrevented).toBe(false);
    expect(press({ key: 'Tab', shiftKey: true }).defaultPrevented).toBe(false);
    expect(idle).toHaveBeenCalledTimes(1); // Shift+Tab never asked
  });
});
