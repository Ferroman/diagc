// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, LayoutOverlay } from '@diagc/core/internal';
import { defaultHost, setHost } from '../host';
import type { LoadedArtifact } from './artifacts';
import { useDiagramBoot } from './useDiagramBoot';

const model = (name: string): DiagramModel => ({
  version: 1,
  id: name,
  name,
  nodes: [{ id: 'a', name: 'a', type: 'service' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});
const layout: LayoutOverlay = { version: 1, planes: { default: { a: { x: 1, y: 2 } } } };

/** a host answering the three boot requests; `fail` names the ones that answer 500 */
function serve(fail: ('diagrams' | 'layouts' | 'drawings')[] = [], throws = false) {
  const apiFetch = vi.fn(async (url: string) => {
    if (throws) throw new TypeError('offline');
    const kind = url.slice('/api/'.length) as 'diagrams' | 'layouts' | 'drawings';
    if (fail.includes(kind)) return new Response('{}', { status: 500 });
    if (kind === 'diagrams')
      return new Response(
        JSON.stringify({
          diagrams: [
            { name: 'zeta', model: model('zeta'), issues: [], editable: true },
            { name: 'alpha', model: model('alpha'), issues: [], editable: false },
          ],
        }),
      );
    if (kind === 'layouts') return new Response(JSON.stringify({ layouts: { zeta: layout } }));
    return new Response(JSON.stringify({ drawings: {} }));
  });
  setHost({ ...defaultHost, apiFetch });
  return apiFetch;
}

afterEach(() => setHost(defaultHost));

const art = (name: string, tag: string): LoadedArtifact => ({ name, model: { ...model(name), id: tag }, issues: [] });

describe('useDiagramBoot', () => {
  // Breaks if the boot stops loading the three resources together, stops
  // flagging the editable names, or stops sorting the names.
  it('loads the models and layouts once, marks the editable ones, and settles', async () => {
    const apiFetch = serve();
    const { result } = renderHook(() => useDiagramBoot());
    expect(result.current.booted).toBe(false);
    expect(result.current.canDesign).toBe(false);
    await waitFor(() => expect(result.current.booted).toBe(true));
    expect(apiFetch.mock.calls.map(([url]) => url)).toEqual(['/api/diagrams', '/api/layouts', '/api/drawings']);
    expect(result.current.names).toEqual(['alpha', 'zeta']);
    expect([...result.current.ownedNames]).toEqual(['zeta']);
    expect(result.current.canDesign).toBe(true);
    expect(result.current.artifacts['zeta']?.layout).toEqual(layout);
  });

  // Breaks if a failed layouts or drawings request stops the models loading.
  it('loads the models without the sidecars it could not fetch', async () => {
    serve(['layouts', 'drawings']);
    const { result } = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(result.current.booted).toBe(true));
    expect(result.current.names).toEqual(['alpha', 'zeta']);
    expect(result.current.artifacts['zeta']?.layout).toBeUndefined();
  });

  // Breaks if a failed or unreachable API stops settling `booted` (the deep
  // link's fallback would never run) or leaves the studio offering New.
  it('settles read-only and empty when there is no API', async () => {
    serve(['diagrams']);
    const failed = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(failed.result.current.booted).toBe(true));
    expect(failed.result.current.names).toEqual([]);
    expect(failed.result.current.canDesign).toBe(false);

    serve([], true);
    const offline = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(offline.result.current.booted).toBe(true));
    expect(offline.result.current.canDesign).toBe(false);
  });

  // Breaks if a draft (the newest in-memory edits, or a diagram just written)
  // stops outranking the boot model, or a new draft stops being listed.
  it('lets a draft shadow the boot model', async () => {
    serve();
    const { result } = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(result.current.booted).toBe(true));
    act(() => result.current.putDraft('zeta', art('zeta', 'draft')));
    act(() => result.current.putDraft('beta', art('beta', 'draft')));
    expect(result.current.artifacts['zeta']?.model?.id).toBe('draft');
    expect(result.current.names).toEqual(['alpha', 'beta', 'zeta']);
  });

  // Breaks if a rename misses a store (the diagram would keep its old name under
  // the draft or the boot copy), keeps the model's old id, or leaves ownership
  // under the old name.
  it('moves a renamed diagram in every store, ownership included', async () => {
    serve();
    const { result } = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(result.current.booted).toBe(true));
    act(() => result.current.putDraft('zeta', art('zeta', 'zeta')));
    act(() => result.current.rename('zeta', 'omega'));
    expect(result.current.names).toEqual(['alpha', 'omega']);
    expect(result.current.loaded['omega']?.model).toMatchObject({ id: 'omega', name: 'omega' });
    expect(result.current.drafts['omega']?.model).toMatchObject({ id: 'omega', name: 'omega' });
    expect(result.current.loaded['omega']?.layout).toEqual(layout);
    expect([...result.current.ownedNames]).toEqual(['omega']);
  });

  // Breaks if a saved layout stops reaching the boot copy (a plane switch would
  // drop it until a reload), or lands under a name that was never loaded.
  it('folds a saved layout into the boot copy of a loaded diagram only', async () => {
    serve();
    const { result } = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(result.current.booted).toBe(true));
    const saved: LayoutOverlay = { version: 1, planes: {}, manual: { default: true } };
    act(() => result.current.putLayout('alpha', saved));
    act(() => result.current.putLayout('nowhere', saved));
    expect(result.current.artifacts['alpha']?.layout).toBe(saved);
    expect(result.current.names).toEqual(['alpha', 'zeta']);
  });

  // Breaks if a re-composed model creates a draft where there was none (a
  // finished session that never saved would suddenly shadow the boot model).
  it('swaps the model of an existing draft only', async () => {
    serve();
    const { result } = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(result.current.booted).toBe(true));
    act(() => result.current.replaceDraftModel('zeta', model('composed')));
    expect(result.current.drafts).toEqual({});
    act(() => result.current.putDraft('zeta', { ...art('zeta', 'raw'), layout }));
    act(() => result.current.replaceDraftModel('zeta', model('composed')));
    expect(result.current.drafts['zeta']).toEqual({ name: 'zeta', model: model('composed'), layout, issues: [] });
  });

  // Breaks if owning or giving up a name touches any other.
  it('marks names owned and gives them up one at a time', async () => {
    serve();
    const { result } = renderHook(() => useDiagramBoot());
    await waitFor(() => expect(result.current.booted).toBe(true));
    act(() => result.current.markOwned('alpha'));
    expect([...result.current.ownedNames].sort()).toEqual(['alpha', 'zeta']);
    act(() => result.current.disown('zeta'));
    expect([...result.current.ownedNames]).toEqual(['alpha']);
  });
});
