// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDrawings, emptyLayout, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import { defaultHost, setHost } from '../host';
import type { EditorSession } from '../session/reducer';
import type { EditorApi } from '../session/useEditor';
import type { LoadedArtifact } from './artifacts';
import { useDiagramView, type UseDiagramViewOptions } from './useDiagramView';

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
const artifacts: Record<string, LoadedArtifact> = {
  one: { name: 'one', model: model('one'), layout, issues: [] },
  two: { name: 'two', model: model('two'), issues: [] },
};

/** a host whose raw-source GET is answered when the test says so */
function holdSource() {
  let answer: (r: Response) => void = () => {};
  setHost({ ...defaultHost, apiFetch: () => new Promise<Response>((r) => (answer = r)) });
  return (r: Response) => answer(r);
}
afterEach(() => setHost(defaultHost));

function mount(start: Partial<UseDiagramViewOptions> = {}) {
  const enterEdit = vi.fn();
  const reportIssues = vi.fn();
  const dropLayoutPreview = vi.fn();
  const props: UseDiagramViewOptions = {
    artifacts,
    selected: 'one',
    editing: false,
    editor: { session: null } as EditorApi,
    enterEdit,
    reportIssues,
    dropLayoutPreview,
    ...start,
  };
  const hook = renderHook((p: UseDiagramViewOptions) => useDiagramView(p), { initialProps: props });
  return {
    enterEdit,
    reportIssues,
    dropLayoutPreview,
    get now() {
      return hook.result.current;
    },
    rerender: (patch: Partial<UseDiagramViewOptions>) => hook.rerender({ ...props, ...patch }),
  };
}

describe('useDiagramView', () => {
  // Breaks if view mode stops showing the open diagram's artifact, or edit mode
  // stops showing the session's model, layout and drawings.
  it("shows the artifact in view mode and the session's state while editing", () => {
    const t = mount();
    expect(t.now).toMatchObject({ current: artifacts['one'], model: model('one'), layout, drawings: undefined });
    const state = { model: model('edited'), layout: emptyLayout(), drawings: emptyDrawings() };
    const session = { name: 'one', state } as EditorSession;
    t.rerender({ editing: true, editor: { session } as EditorApi });
    expect(t.now).toMatchObject({ session, model: state.model, layout: state.layout, drawings: state.drawings });
  });

  // Breaks if Edit starts from the boot model instead of the raw source (an
  // umbrella's composed model would be saved into its source), or stops
  // dropping the preview that would mask the session's own layout.
  it('enters edit on the raw source and drops the preview', async () => {
    const answer = holdSource();
    const t = mount();
    let done: Promise<void> = Promise.resolve();
    act(() => void (done = t.now.enterEditFromSource()));
    await act(async () => {
      answer(new Response(JSON.stringify({ model: model('raw') })));
      await done;
    });
    expect(t.dropLayoutPreview).toHaveBeenCalledTimes(1);
    expect(t.enterEdit).toHaveBeenCalledWith('one', model('raw'), emptyLayout(), emptyDrawings());
  });

  // Breaks if a response that lands after the user switched diagrams still
  // opens a session (on a diagram the header no longer shows) or reports.
  it('drops a response that arrives after another diagram opened', async () => {
    for (const reply of [new Response(JSON.stringify({ model: model('raw') })), new Response('', { status: 500 })]) {
      const answer = holdSource();
      const t = mount();
      let done: Promise<void> = Promise.resolve();
      act(() => void (done = t.now.enterEditFromSource()));
      t.rerender({ selected: 'two' });
      await act(async () => {
        answer(reply);
        await done;
      });
      expect(t.enterEdit).not.toHaveBeenCalled();
      expect(t.dropLayoutPreview).not.toHaveBeenCalled();
      expect(t.reportIssues).not.toHaveBeenCalled();
    }
  });

  // Breaks if a failed load stops saying which diagram and why, or drops the
  // preview anyway.
  it('reports a source it could not load and keeps the preview', async () => {
    const answer = holdSource();
    const t = mount();
    let done: Promise<void> = Promise.resolve();
    act(() => void (done = t.now.enterEditFromSource()));
    await act(async () => {
      answer(new Response('', { status: 500 }));
      await done;
    });
    expect(t.reportIssues).toHaveBeenCalledWith([{ message: "Could not load 'one' for editing: HTTP 500" }]);
    expect(t.dropLayoutPreview).not.toHaveBeenCalled();
  });
});
