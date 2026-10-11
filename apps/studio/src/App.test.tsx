// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramView } from '@diagc/renderer';
import { App } from './App';

// The props App last passed DiagramView. A connect is a React Flow drag jsdom
// cannot drive, so the connect-gesture case below calls the `edit` callbacks
// the canvas would. The wrapper renders the real view, so every other case in
// this file runs through it unaffected.
const viewCapture = vi.hoisted(() => ({ props: null as Parameters<typeof DiagramView>[0] | null }));
vi.mock('@diagc/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@diagc/renderer')>();
  const Actual = actual.DiagramView;
  function CapturingDiagramView(props: Parameters<typeof DiagramView>[0]) {
    viewCapture.props = props;
    return <Actual {...props} />;
  }
  return { ...actual, DiagramView: CapturingDiagramView };
});

// Mirrors the fixture shape in editor/shell.test.tsx: two diagrams, no planes,
// so the layout preview resolves to the 'default' key throughout. `drillModel`
// adds the one thing the others lack — a container to drill into — so a deep
// link can put the app in the drilled state the pen is refused in.
const { sketchModel, twoModel, drillModel, pairModel } = vi.hoisted(() => ({
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
  drillModel: {
    version: 1,
    id: 'drill',
    name: 'drill',
    nodes: [
      { id: 'sys', name: 'sys', type: 'system' },
      { id: 'a', name: 'a', type: 'service' },
    ],
    containment: [{ parent: 'sys', child: 'a' }],
    relations: [],
    layers: [],
    planes: [],
  },
  pairModel: {
    version: 1,
    id: 'pair',
    name: 'pair',
    nodes: [
      { id: 'p', name: 'pee', type: 'service' },
      { id: 'q', name: 'queue', type: 'service' },
    ],
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
      vi.fn(async (url: string, init?: RequestInit) => {
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
        if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }), { status: 200 });
        // Edit starts from the raw source (Task 7); neither fixture has an
        // include, so its raw source is just its own model.
        if (
          url === '/api/diagrams/sketch' &&
          (init === undefined || init.method === undefined || init.method === 'GET')
        ) {
          return new Response(JSON.stringify({ model: sketchModel }), { status: 200 });
        }
        if (url === '/api/diagrams/two' && (init === undefined || init.method === undefined || init.method === 'GET')) {
          return new Response(JSON.stringify({ model: twoModel }), { status: 200 });
        }
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

  // Body of the most recent layouts POST, parsed.
  const lastLayoutBody = () => {
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, init]) => String(url).startsWith('/api/layouts/') && (init as RequestInit | undefined)?.method === 'POST',
    );
    const last = calls[calls.length - 1];
    if (last === undefined) throw new Error('no layouts POST yet');
    return JSON.parse(String((last[1] as RequestInit).body)) as {
      planes: Record<string, Record<string, { x: number; y: number }>>;
      manual?: Record<string, true>;
    };
  };

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
    // Edit now starts from an async raw-source fetch: the view-mode Layout
    // algorithm select (same aria-label) is still mounted until it resolves,
    // so wait for an edit-only landmark first or the change below would land
    // on the stale view-mode control instead of the editor.
    await screen.findByRole('button', { name: /^save$/i });
    const inEdit = screen.getByLabelText('Layout algorithm');
    fireEvent.change(inEdit, { target: { value: 'mrtree' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(layoutPosts()).toContain('/api/layouts/sketch'));

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    // A leftover 'force' preview would win over the freshly-saved 'mrtree' —
    // it must not resurface, and the Reset chip must not still be offered.
    await waitFor(() => expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('mrtree'));
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
  });

  it('a pen stroke becomes an add-stroke that autosaves to /api/drawings with the active plane bucket', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pen' }));
    const pane = await waitFor(() => {
      const el = document.querySelector('.react-flow__pane');
      if (el === null) throw new Error('pane not rendered');
      return el as HTMLElement;
    });
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 60, clientY: 30 });
    fireEvent.pointerUp(pane, { pointerId: 1, clientX: 60, clientY: 30 });
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, init]) => String(url) === '/api/drawings/sketch' && (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse(String((post![1] as RequestInit).body)) as { planes: Record<string, { id: string }[]> };
      expect(body.planes['default']?.[0]?.id).toBe('k1');
    });
  });

  it('drops the preview when a hashchange switches diagrams', async () => {
    render(<App />);
    const algorithm = await screen.findByLabelText('Layout algorithm');
    fireEvent.change(algorithm, { target: { value: 'force' } });
    expect(await screen.findByRole('button', { name: /reset layout/i })).toBeDefined();

    // 'default' is a key every diagram resolves to, so a stray preview here
    // would silently re-lay out whatever diagram comes up next.
    window.location.hash = '#/two';
    fireEvent(window, new HashChangeEvent('hashchange'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Diagram: two' })).toBeDefined());
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
    expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('layered');
  });

  it('bails out of entering edit when the diagram switches while the raw-source fetch is in flight', async () => {
    // Hold the GET for sketch's raw source open until the test releases it, so
    // a diagram switch can land inside the async gap between the click and the
    // response.
    let releaseSketchFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSketchFetch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
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
        if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }), { status: 200 });
        if (
          url === '/api/diagrams/sketch' &&
          (init === undefined || init.method === undefined || init.method === 'GET')
        ) {
          await gate;
          return new Response(JSON.stringify({ model: sketchModel }), { status: 200 });
        }
        if (url === '/api/diagrams/two' && (init === undefined || init.method === undefined || init.method === 'GET')) {
          return new Response(JSON.stringify({ model: twoModel }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    render(<App />);
    // 'sketch' sorts first, so it is the default selection this click targets.
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    // Switch to 'two' while the sketch fetch is still pending.
    window.location.hash = '#/two';
    fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Diagram: two' })).toBeDefined());

    releaseSketchFetch?.();
    // Let the now-resolved fetch's promise chain run.
    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));

    // The stale response must never open an edit session on 'sketch' — the
    // header still shows 'two', and no edit-only control ever appears.
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^done$/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Diagram: two' })).toBeDefined();
  });

  it('keeps the layout preview on a failed raw-source fetch, unlike the old synchronous drop', async () => {
    render(<App />);
    const algorithm = await screen.findByLabelText('Layout algorithm');
    fireEvent.change(algorithm, { target: { value: 'force' } });
    expect(await screen.findByRole('button', { name: /reset layout/i })).toBeDefined();

    // Fail exactly the next fetch — the raw-source GET the Edit click triggers.
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => new Response('', { status: 500 }));
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    await screen.findByText(/Could not load 'sketch' for editing/);

    // A failed entry never reached the point of dropping the preview.
    expect((screen.getByLabelText('Layout algorithm') as HTMLSelectElement).value).toBe('force');
    expect(screen.getByRole('button', { name: /reset layout/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('Freeze layout pins a snapshot with the manual flag; a second click clears the flag only; a pending drag survives thaw but not freeze', async () => {
    render(<App />);
    // the snapshot reads React Flow's node copy — wait for the canvas to have one
    await waitFor(() => expect(document.querySelector('.react-flow__node')).not.toBeNull());

    // A view-mode drag pending BEFORE freeze: the freeze POST's body IS the
    // current on-screen snapshot, so this drag rides along in that very
    // write — the "Save positions" chip must clear once it succeeds.
    const node = await screen.findByText('a');
    fireEvent.click(node);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    await screen.findByRole('button', { name: /save positions/i }, { timeout: 2000 });

    fireEvent.click(await screen.findByRole('button', { name: /freeze layout/i }));
    await waitFor(() => expect(layoutPosts()).toEqual(['/api/layouts/sketch']));
    const frozen = lastLayoutBody();
    expect(frozen.manual).toEqual({ default: true });
    expect(frozen.planes['default']).toBeDefined();

    // the POST succeeded, so the chip now reflects the frozen state
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /freeze layout/i }).getAttribute('aria-pressed')).toBe('true'),
    );
    // freeze's snapshot body absorbed the pending drag — the chip clears
    await waitFor(() => expect(screen.queryByRole('button', { name: /save positions/i })).toBeNull(), {
      timeout: 2000,
    });

    // A second drag, still pending when we thaw: the thaw POST carries no
    // positions at all, so this one must stay unsaved — the chip must NOT be
    // cleared just because the plane went back to automatic.
    fireEvent.keyDown(node, { key: 'ArrowLeft' });
    await screen.findByRole('button', { name: /save positions/i }, { timeout: 2000 });

    fireEvent.click(screen.getByRole('button', { name: /freeze layout/i }));
    await waitFor(() => expect(layoutPosts()).toHaveLength(2));
    const thawed = lastLayoutBody();
    expect(thawed.manual).toBeUndefined();
    expect(thawed.planes['default']).toEqual(frozen.planes['default']); // positions kept

    // the drag pending before thaw is still pending after it
    expect(screen.getByRole('button', { name: /save positions/i })).toBeDefined();
  });

  // A failed view-mode layout write lands in the view-mode banner and leaves the
  // "Save positions" chip up for a retry. Only the layouts POST fails; boot and
  // every other request keep the shared stub's answers.
  const failLayoutPost = (respond: () => Promise<Response>) => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const shared = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      String(url).startsWith('/api/layouts/') && init?.method === 'POST' ? respond() : shared(url, init),
    );
  };

  const savePositionsAfterDrag = async () => {
    await waitFor(() => expect(document.querySelector('.react-flow__node')).not.toBeNull());
    const node = await screen.findByText('a');
    fireEvent.click(node);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('button', { name: /save positions/i }, { timeout: 2000 }));
    await waitFor(() => expect(layoutPosts()).toEqual(['/api/layouts/sketch']));
  };

  it('Save positions reports a rejected request in the banner and keeps the chip', async () => {
    failLayoutPost(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<App />);
    await savePositionsAfterDrag();

    expect(await screen.findByText('Failed to fetch')).toBeDefined();
    expect(screen.getByRole('button', { name: /save positions/i })).toBeDefined();
  });

  it('Save positions reports an error body that is not JSON as a failed layout save', async () => {
    failLayoutPost(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    render(<App />);
    await savePositionsAfterDrag();

    expect(await screen.findByText('Could not save layout')).toBeDefined();
    expect(screen.getByRole('button', { name: /save positions/i })).toBeDefined();
  });

  it("Save positions shows the server's issues from a JSON error body", async () => {
    failLayoutPost(
      async () => new Response(JSON.stringify({ issues: [{ message: 'layout: bad plane key' }] }), { status: 400 }),
    );
    render(<App />);
    await savePositionsAfterDrag();

    expect(await screen.findByText('layout: bad plane key')).toBeDefined();
    expect(screen.getByRole('button', { name: /save positions/i })).toBeDefined();
  });

  it('the Snap chip toggles and persists as a viewer preference', async () => {
    render(<App />);
    const chip = await screen.findByRole('button', { name: /snap/i });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('diagc.snap')).toBe('true');
    expect(layoutPosts()).toEqual([]); // a preference, never written to the diagram
  });

  it('the Group chip appears from a canvas multi-selection of two nodes', async () => {
    // A dedicated fetch stub, not the shared list above: 'pair' sorts before
    // 'sketch'/'two' (useDiagramBoot's `names` is alphabetical), so adding it
    // to the shared list would silently become the OTHER tests' default
    // diagram whenever they render without an explicit hash.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'pair', model: pairModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }), { status: 200 });
        if (
          url === '/api/diagrams/pair' &&
          (init === undefined || init.method === undefined || init.method === 'GET')
        ) {
          return new Response(JSON.stringify({ model: pairModel }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    window.location.hash = '#/pair'; // deep-link form: #/<diagram>, as the drill test above uses
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: /^save$/i });
    fireEvent.click(await screen.findByText('pee'));
    expect(screen.queryByRole('button', { name: /⊞ Group/ })).toBeNull();
    // React Flow's multi-select gate is a real key-press hook (keydown/keyup
    // on window), not the click event's own `shiftKey` flag — see the
    // renderer's shift-click test for the same requirement.
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    // Selecting 'pee' opens its Properties panel, whose "Add parent" select
    // lists 'queue' as a candidate container — ignore <option> text so this
    // click targets the canvas node, not that dropdown entry.
    fireEvent.click(screen.getByText('queue', { ignore: 'option' }), { shiftKey: true });
    expect(await screen.findByRole('button', { name: /⊞ Group 2/ })).toBeDefined();
  });
});

// Its own boot stub, and its own describe: `names` is sorted, so folding 'drill'
// into the list above would make it the default selection and pull the preview
// and pen tests onto the wrong diagram.
describe('drilled-in canvas tools', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'drill', model: drillModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }), { status: 200 });
        // Edit starts from the raw source (Task 7); drillModel has no include,
        // so its raw source is just its own model.
        if (
          url === '/api/diagrams/drill' &&
          (init === undefined || init.method === undefined || init.method === 'GET')
        ) {
          return new Response(JSON.stringify({ model: drillModel }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores the pen key while drilled in, so the chip cannot read pressed while disabled', async () => {
    window.location.hash = '#/drill/sys'; // deep-link straight into the container
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    const pen = (await screen.findByRole('button', { name: 'Pen' })) as HTMLButtonElement;
    // The toolbar disabling Pen is how we know the drill actually took effect:
    // it is driven by the same `enteredPath` the key gate reads.
    await waitFor(() => expect(pen.disabled).toBe(true));

    fireEvent.keyDown(window, { key: 'p' });

    expect(pen.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('disables Freeze layout while drilled — a drilled snapshot only covers the subtree, not the whole plane', async () => {
    window.location.hash = '#/drill/sys'; // view mode, deep-linked straight into the container
    render(<App />);
    await waitFor(() => expect(document.querySelector('.react-flow__node')).not.toBeNull());
    const freeze = (await screen.findByRole('button', { name: /freeze layout/i })) as HTMLButtonElement;
    expect(freeze.disabled).toBe(true);
  });
});

describe('connect gesture', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'pair', model: pairModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }), { status: 200 });
        if (
          url === '/api/diagrams/pair' &&
          (init === undefined || init.method === undefined || init.method === 'GET')
        ) {
          return new Response(JSON.stringify({ model: pairModel }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const edit = () => {
    const api = viewCapture.props?.edit;
    if (api === undefined) throw new Error('DiagramView has no edit callbacks: not in edit mode');
    return api;
  };
  // The edge panel's own control: present exactly while a relation is selected.
  const edgePanelOpen = () => screen.queryByRole('button', { name: /add label/i }) !== null;

  it('selects the relation a connect draws, even when its id repeats a deleted one', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: /^save$/i });

    act(() => edit().onConnect?.('p', 'q'));
    await waitFor(() => expect(edgePanelOpen()).toBe(true));

    // The canvas Delete key: the relation goes, and so does the selection.
    act(() => edit().onDeleteSelection?.({ nodeIds: [], relationIds: ['p->q#0'] }));
    await waitFor(() => expect(edgePanelOpen()).toBe(false));

    // Drawn again, the relation is minted the same id, p->q#0.
    act(() => edit().onConnect?.('p', 'q'));
    await waitFor(() => expect(edgePanelOpen()).toBe(true));
  });
});

describe('theme seeding', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') return new Response(JSON.stringify({ diagrams: [] }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults dark, and a host-provided initialTheme seeds light', async () => {
    // The Obsidian pane passes the vault's scheme (view.tsx); the browser
    // studio renders <App /> with no prop and keeps the dark default.
    const first = render(<App />);
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBe('dark'));
    first.unmount();
    render(<App initialTheme="light" />);
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBe('light'));
  });
});
