// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import type { LayoutApi } from '@diagc/renderer';
import { defaultHost, setHost } from '../host';
import { useViewArrangement, type UseViewArrangementOptions } from './useViewArrangement';

function diagram(): DiagramModel {
  const m = model('d');
  m.plane('main', { name: 'Main' });
  m.node('a', { type: 'service' });
  m.node('b', { type: 'service' });
  return m.toJSON();
}
const saved: LayoutOverlay = { version: 1, planes: { main: { a: { x: 1, y: 1 } } } };

interface Post {
  url: string;
  body: LayoutOverlay;
}
/** a host whose layout POSTs answer `reply` (default 200) and are recorded */
function serve(reply: () => Response | Promise<Response> = () => new Response('{}')) {
  const posts: Post[] = [];
  setHost({
    ...defaultHost,
    apiFetch: async (url, init) => {
      posts.push({ url, body: JSON.parse(String(init?.body)) as LayoutOverlay });
      return reply();
    },
  });
  return posts;
}
afterEach(() => setHost(defaultHost));

function mount(start: Partial<UseViewArrangementOptions> = {}) {
  const putLayout = vi.fn();
  const reportIssues = vi.fn();
  const snapshot = { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } };
  const layoutApiRef = { current: { snapshotPositions: () => snapshot } as unknown as LayoutApi };
  const props: UseViewArrangementOptions = {
    model: diagram(),
    layout: saved,
    editing: false,
    selected: 'd',
    activePlane: undefined,
    activePlaneManual: false,
    pins: {},
    savedUnfoldedKey: '',
    layoutApiRef,
    putLayout,
    reportIssues,
    ...start,
  };
  const hook = renderHook((p: UseViewArrangementOptions) => useViewArrangement(p), { initialProps: props });
  return {
    hook,
    putLayout,
    reportIssues,
    snapshot,
    get now() {
      return hook.result.current;
    },
    rerender: (patch: Partial<UseViewArrangementOptions>) => hook.rerender({ ...props, ...patch }),
  };
}

describe('useViewArrangement: the preview', () => {
  // Breaks if view mode stops laying the preview over the saved settings, or
  // edit mode starts (its settings are commands on the undo stack).
  it('lays the preview over the saved layout in view mode only', () => {
    const t = mount();
    expect(t.now.viewLayout).toBe(saved);
    act(() => t.now.previewLayoutSettings({ direction: 'RIGHT' }));
    expect(t.now.viewLayout?.settings?.['main']).toEqual({ direction: 'RIGHT' });
    expect(t.now.planePreviewed).toBe(true);
    t.rerender({ editing: true });
    expect(t.now.viewLayout).toBe(saved);
  });

  // Breaks if Reset layout drops more than the plane on screen's preview, or a
  // full drop (a view reset, entering edit) leaves any behind.
  it("drops the plane's preview, or all of it", () => {
    const t = mount();
    act(() => t.now.previewLayoutSettings({ direction: 'RIGHT' }));
    t.rerender({ activePlane: 'other' });
    act(() => t.now.previewLayoutSettings({ direction: 'DOWN' }));
    act(() => t.now.dropPlanePreview());
    expect(t.now.planePreviewed).toBe(false);
    t.rerender({ activePlane: undefined });
    expect(t.now.planePreviewed).toBe(true);
    act(() => t.now.dropPreview());
    expect(t.now.planePreviewed).toBe(false);
  });

  // Breaks if a diagram switch stops dropping the preview and Auto-arrange: a
  // leftover preview keyed like every diagram's default plane would re-lay out
  // the next one.
  it('drops the preview and Auto-arrange when another diagram opens', () => {
    const t = mount();
    act(() => t.now.previewLayoutSettings({ direction: 'RIGHT' }));
    act(() => t.now.toggleAutoArrange());
    expect(t.now.autoArrange).toBe(true);
    t.rerender({ selected: 'e' });
    expect(t.now).toMatchObject({ autoArrange: false, planePreviewed: false });
  });
});

describe('useViewArrangement: what Save positions would write', () => {
  // Breaks if a moved box, a moved label or a changed fold stops raising the
  // Save positions chip, or a fold that matches the saved one raises it.
  it('counts moved boxes and labels, and folds that differ from the saved ones', () => {
    const t = mount();
    expect(t.now.unsavedView).toBe(false);
    act(() => t.now.setMovedPositions({ a: { x: 5, y: 5 } }));
    expect(t.now.unsavedView).toBe(true);
    act(() => t.now.setMovedPositions({}));
    act(() => t.now.setMovedLabels({ 'a->b#0': { l1: { t: 0.3 } } } as never));
    expect(t.now.unsavedView).toBe(true);
    act(() => t.now.setMovedLabels({}));
    t.rerender({ pins: { a: 'expanded' } });
    expect(t.now.unsavedView).toBe(true);
    t.rerender({ pins: { a: 'expanded' }, savedUnfoldedKey: 'a' });
    expect(t.now.unsavedView).toBe(false);
  });

  // Breaks if Save positions stops posting the moved boxes into the saved
  // overlay, or stops clearing the chip and folding the saved file into the
  // store on success.
  it('posts the moved boxes, then clears them and keeps the saved file', async () => {
    const posts = serve();
    const t = mount();
    act(() => t.now.setMovedPositions({ b: { x: 7, y: 8 } }));
    await act(async () => t.now.savePositions());
    expect(posts.map((p) => p.url)).toEqual(['/api/layouts/d']);
    expect(posts[0]?.body.planes['main']).toEqual({ a: { x: 1, y: 1 }, b: { x: 7, y: 8 } });
    expect(t.putLayout).toHaveBeenCalledWith('d', posts[0]?.body);
    expect(t.reportIssues).toHaveBeenLastCalledWith(null);
    expect(t.now.unsavedView).toBe(false);
  });

  // Breaks if a failed save loses the drags (there is no retry then), reports
  // nothing, or lets a rejection escape as an unhandled one.
  it('keeps the drags and reports why when the save fails', async () => {
    serve(() => new Response(JSON.stringify({ issues: [{ message: 'read-only' }] }), { status: 403 }));
    const t = mount();
    act(() => t.now.setMovedPositions({ b: { x: 7, y: 8 } }));
    await act(async () => t.now.savePositions());
    expect(t.reportIssues).toHaveBeenLastCalledWith([{ message: 'read-only' }]);
    expect(t.now.unsavedView).toBe(true);
    expect(t.putLayout).not.toHaveBeenCalled();

    serve(() => new Response('<html>', { status: 502 }));
    await act(async () => t.now.savePositions());
    expect(t.reportIssues).toHaveBeenLastCalledWith([{ message: 'Could not save layout' }]);

    serve(() => Promise.reject(new TypeError('offline')));
    await act(async () => t.now.savePositions());
    expect(t.reportIssues).toHaveBeenLastCalledWith([{ message: 'offline' }]);
    expect(t.now.savingPositions).toBe(false);
  });

  // Breaks if the chips stop showing the save in flight.
  it('reads saving while the request is out', async () => {
    let answer: (r: Response) => void = () => {};
    serve(() => new Promise<Response>((r) => (answer = r)));
    const t = mount();
    act(() => t.now.setMovedPositions({ b: { x: 7, y: 8 } }));
    act(() => void t.now.savePositions());
    expect(t.now.savingPositions).toBe(true);
    await act(async () => answer(new Response('{}')));
    await waitFor(() => expect(t.now.savingPositions).toBe(false));
  });
});

describe('useViewArrangement: Freeze layout', () => {
  // Breaks if freezing stops saving the on-screen snapshot with the manual
  // flag (boxes would jump), or stops clearing the drags it covered.
  it('freezes the boxes where they are and clears the drags', async () => {
    const posts = serve();
    const t = mount();
    act(() => t.now.setMovedPositions({ b: { x: 7, y: 8 } }));
    await act(async () => t.now.toggleFreeze());
    expect(posts[0]?.body.manual).toEqual({ main: true });
    expect(posts[0]?.body.planes['main']).toEqual(t.snapshot);
    expect(t.now.unsavedView).toBe(false);
  });

  // Breaks if thawing discards pending drags: its body carries no positions.
  it('thaws without discarding pending drags', async () => {
    const posts = serve();
    const t = mount({ activePlaneManual: true, layout: { ...saved, manual: { main: true } } });
    act(() => t.now.setMovedPositions({ b: { x: 7, y: 8 } }));
    await act(async () => t.now.toggleFreeze());
    expect(posts[0]?.body.manual).toBeUndefined();
    expect(t.now.unsavedView).toBe(true);
  });
});

describe('useViewArrangement: identities', () => {
  // Breaks if the renderer's moved-position and moved-label reports stop being
  // the raw setters (it holds them in effect and memo dependencies), or the
  // layout save is rebuilt on a render that changed nothing it reads — the
  // store's operations are new on every render.
  it('keeps the setters and the saves stable across renders', () => {
    const t = mount();
    const first = t.now;
    t.rerender({ putLayout: vi.fn(), reportIssues: t.reportIssues });
    expect(t.now.setMovedPositions).toBe(first.setMovedPositions);
    expect(t.now.setMovedLabels).toBe(first.setMovedLabels);
    expect(t.now.savePositions).toBe(first.savePositions);
    expect(t.now.toggleFreeze).toBe(first.toggleFreeze);
    expect(t.now.previewLayoutSettings).toBe(first.previewLayoutSettings);
  });

  // Breaks if the save reads the store operation of the render it was built
  // in rather than the newest one.
  it('folds the saved file in through the newest store operation', async () => {
    serve();
    const t = mount();
    const newest = vi.fn();
    t.rerender({ putLayout: newest, reportIssues: t.reportIssues });
    act(() => t.now.setMovedPositions({ b: { x: 7, y: 8 } }));
    await act(async () => t.now.savePositions());
    expect(newest).toHaveBeenCalledTimes(1);
    expect(t.putLayout).not.toHaveBeenCalled();
  });
});
