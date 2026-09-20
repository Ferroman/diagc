// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDrawings, emptyLayout, model, type EditorState } from '@diagc/core';
import { useEditor } from './useEditor';

function state(): EditorState {
  const m = model('draft');
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a);
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEditor.save', () => {
  it('posts an edit dispatched in the same tick as the save', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditor());
    act(() => {
      result.current.start('draft', state());
    });

    // Capture the api from the render *before* the edit; save must still read the
    // live session (via the ref) rather than this render's stale closure.
    const api = result.current;
    act(() => {
      api.dispatch({ type: 'rename-node', id: 'a', name: 'Alpha' });
    });
    await act(async () => {
      await api.save();
    });

    const diagCall = fetchMock.mock.calls.find((c) => String(c[0]).startsWith('/api/diagrams/'));
    expect(diagCall).toBeDefined();
    expect(String(diagCall?.[0])).toBe('/api/diagrams/draft');
    expect(String(diagCall?.[1]?.body)).toContain('Alpha');
  });

  it('keeps the session dirty for edits dispatched during an in-flight save', async () => {
    let releaseFirstPost: ((res: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    const gate = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      releaseFirstPost = resolve;
    });
    const fetchMock = vi.fn();
    // The diagrams POST hangs on the gate; the layouts POST resolves immediately.
    fetchMock.mockImplementationOnce(() => gate).mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditor());
    act(() => {
      result.current.start('draft', state());
    });

    // Begin saving S0 (the clean started state). save() only touches React state
    // after both POSTs resolve, so no act() is needed until we release the gate.
    const savePromise = result.current.save();

    // While the diagrams POST is pending, land another edit.
    act(() => {
      result.current.dispatch({ type: 'rename-node', id: 'a', name: 'Later' });
    });

    await act(async () => {
      releaseFirstPost?.({ ok: true, json: async () => ({}) });
      await savePromise;
    });

    // savedState is S0's state (what was posted); current state carries 'Later' -> dirty.
    expect(result.current.dirty).toBe(true);
    expect(result.current.session?.savedState.model.nodes.find((n) => n.id === 'a')?.name).toBe('a');
    expect(result.current.session?.state.model.nodes.find((n) => n.id === 'a')?.name).toBe('Later');
  });

  it('returns validation issues without fetching when the model is invalid', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const valid = state();
    const invalid: EditorState = {
      ...valid,
      model: { ...valid.model, relations: [{ id: 'r-x', from: 'a', to: 'nowhere', kind: 'sync' }] },
    };

    const { result } = renderHook(() => useEditor());
    act(() => {
      result.current.start('draft', invalid);
    });

    let res: { ok: boolean; issues?: { message: string }[] } | undefined;
    await act(async () => {
      res = await result.current.save();
    });

    expect(res?.ok).toBe(false);
    expect(res?.issues?.length ?? 0).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts drawings only when they changed since the last save', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useEditor());
    act(() => {
      result.current.start('draft', state());
    });
    act(() => {
      result.current.dispatch({ type: 'rename-node', id: 'a', name: 'Alpha' });
    });
    await act(async () => {
      await result.current.save();
    });
    const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls().some((u) => u.startsWith('/api/drawings/'))).toBe(false);

    act(() => {
      result.current.dispatch({ type: 'add-stroke', stroke: { id: 'k1', points: [1, 2, 3, 4] } });
    });
    await act(async () => {
      await result.current.save();
    });
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/drawings/draft');
    expect(call).toBeDefined();
    expect(String(call?.[1]?.body)).toContain('"k1"');
  });
});

describe('useEditor.peek', () => {
  it('reflects a dispatch made this tick, unlike the render-bound session', () => {
    const { result } = renderHook(() => useEditor());
    act(() => {
      result.current.start('draft', state());
    });
    // The api captured before the dispatch: its `session` is this render's stale
    // closure, while `peek()` must read the synchronous ref.
    const api = result.current;
    act(() => {
      api.dispatch({ type: 'add-node', node: { id: 'image', name: 'logo', type: 'image', image: 'x.png' } });
      expect(api.session?.state.model.nodes.some((n) => n.id === 'image')).toBe(false);
      expect(api.peek()?.state.model.nodes.some((n) => n.id === 'image')).toBe(true);
    });
  });
});
