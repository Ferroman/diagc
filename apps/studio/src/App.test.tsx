// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

// Mirrors the fixture shape in editor/shell.test.tsx: two diagrams, no planes,
// so the layout preview resolves to the 'default' key throughout.
const { sketchModel, twoModel } = vi.hoisted(() => ({
  sketchModel: {
    version: 1,
    id: 'sketch',
    name: 'sketch',
    nodes: [{ id: 'a', name: 'a', type: 'service' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  },
  twoModel: {
    version: 1,
    id: 'two',
    name: 'two',
    nodes: [{ id: 'z', name: 'zed', type: 'service' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  },
}));

describe('view-mode layout preview', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({
              diagrams: [
                { name: 'sketch', model: sketchModel, issues: [], editable: true },
                { name: 'two', model: twoModel, issues: [], editable: true },
              ],
            }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The layouts POST call log, filtered from the shared fetch mock — a preview
  // must never appear here, in any of the scenarios below.
  const layoutPosts = () =>
    (fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([url]) => String(url))
      .filter((url) => url.startsWith('/api/layouts/'));

  it('reaches the controls in view mode, previews without a POST, and Reset undoes it', async () => {
    render(<App />);
    const algorithm = await screen.findByLabelText('Layout algorithm');
    expect((algorithm as HTMLSelectElement).value).toBe('layered');

    fireEvent.change(algorithm, { target: { value: 'force' } });
    expect(await screen.findByRole('button', { name: /reset layout/i })).toBeDefined();
    expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('force');
    expect(layoutPosts()).toEqual([]); // live preview only — never written to disk

    fireEvent.click(screen.getByRole('button', { name: /reset layout/i }));
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
    expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('layered');
    expect(layoutPosts()).toEqual([]);
  });

  it('drops the preview on entering edit, so a saved change is not masked on Done', async () => {
    render(<App />);
    const preview = await screen.findByLabelText('Layout algorithm');
    fireEvent.change(preview, { target: { value: 'force' } });
    expect(await screen.findByRole('button', { name: /reset layout/i })).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    const inEdit = await screen.findByLabelText('Layout algorithm');
    fireEvent.change(inEdit, { target: { value: 'stress' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(layoutPosts()).toContain('/api/layouts/sketch'));

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    // A leftover 'force' preview would win over the freshly-saved 'stress' —
    // it must not resurface, and the Reset chip must not still be offered.
    await waitFor(() => expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('stress'));
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
  });

  it('drops the preview when a hashchange switches diagrams', async () => {
    render(<App />);
    const algorithm = await screen.findByLabelText('Layout algorithm');
    fireEvent.change(algorithm, { target: { value: 'force' } });
    expect(await screen.findByRole('button', { name: /reset layout/i })).toBeDefined();

    // 'default' is a key every diagram resolves to (unlike the pin/plane state
    // that leaks on this same path today), so a stray preview here would
    // silently re-lay out whatever diagram comes up next.
    window.location.hash = '#/two';
    fireEvent(window, new HashChangeEvent('hashchange'));

    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Diagram' }) as HTMLSelectElement).value).toBe('two'),
    );
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
    expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('layered');
  });
});
