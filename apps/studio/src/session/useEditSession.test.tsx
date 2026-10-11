// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { emptyDrawings, emptyLayout, model, type EditorState } from '@diagc/core/internal';
import { defaultHost, setHost } from '../host';
import { useEditSession } from './useEditSession';

const state = (name = 'd'): EditorState => {
  const m = model(name);
  m.node('a', { type: 'service' });
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
};
const mount = () => {
  const putDraft = vi.fn();
  const hook = renderHook(() =>
    useEditSession({
      store: { putDraft, replaceDraftModel: () => {} },
      resetInspector: () => {},
      leaveEditRef: useRef(() => true),
    }),
  );
  return { hook, putDraft };
};

afterEach(() => setHost(defaultHost));

describe('useEditSession and the keyboard', () => {
  // The session used to own a keydown listener (N, Tab, P, E, Esc, undo/redo/save).
  // Shortcuts are the hotkeys dispatcher's now (hotkeys/useHotkeys); a second
  // listener here would run every one of them twice.
  it('listens to no keys of its own', () => {
    const { hook } = mount();
    act(() => hook.result.current.startEditing('d', state()));
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('useEditSession operations', () => {
  // Breaks if starting a session on a diagram just written (New, Duplicate)
  // starts clearing the banner the way entering edit does, or entering edit
  // stops clearing it.
  it('starts editing a new diagram with the banner as it was; entering edit clears it', () => {
    const { hook } = mount();
    act(() => hook.result.current.reportIssues([{ message: 'Could not save layout' }]));
    act(() => hook.result.current.startEditing('d', state()));
    expect(hook.result.current.editing).toBe(true);
    expect(hook.result.current.editor.session?.name).toBe('d');
    expect(hook.result.current.saveIssues).toEqual([{ message: 'Could not save layout' }]);

    act(() => void hook.result.current.leaveEdit());
    act(() => hook.result.current.reportIssues([{ message: 'Could not load' }]));
    const s = state('e');
    act(() => hook.result.current.enterEdit('e', s.model, s.layout, s.drawings));
    expect(hook.result.current.saveIssues).toBeNull();
  });

  // Breaks if reportIssues changes identity between renders: the view chips'
  // layout save is a callback that depends on it.
  it('hands out a stable reportIssues', () => {
    const { hook } = mount();
    const first = hook.result.current.reportIssues;
    act(() => hook.result.current.startEditing('d', state()));
    expect(hook.result.current.reportIssues).toBe(first);
  });

  // Breaks if leaving a session with unsaved edits stops shadowing them as the
  // diagram's draft, so view mode would show the model from before the session.
  it('leaves a dirty session as a draft and posts the last edits', async () => {
    const posts: string[] = [];
    setHost({
      ...defaultHost,
      apiFetch: async (url, init) => {
        if (init?.method === 'POST') posts.push(url);
        return new Response('{}');
      },
    });
    const { hook, putDraft } = mount();
    act(() => hook.result.current.startEditing('d', state()));
    act(() => hook.result.current.editor.dispatch({ type: 'rename-node', id: 'a', name: 'renamed' }));
    await act(async () => void hook.result.current.leaveEdit());
    expect(putDraft).toHaveBeenCalledTimes(1);
    expect(putDraft.mock.calls[0]?.[0]).toBe('d');
    expect(hook.result.current.editing).toBe(false);
    expect(posts).toContain('/api/diagrams/d');
  });
});
