// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { defaultHost, setHost } from '../host';

// vi.mock is hoisted above module-level consts, so the shared fixture must live
// in vi.hoisted for the factory to reference it.
const { goodModel, twoModel } = vi.hoisted(() => ({
  goodModel: {
    version: 1,
    id: 'sketch',
    name: 'sketch',
    nodes: [
      { id: 'a', name: 'a', type: 'service' },
      { id: 'sys', name: 'sys', type: 'system' },
    ],
    containment: [{ parent: 'sys', child: 'a' }],
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

// An umbrella's raw source: only the include node, no grafted content — what
// GET /api/diagrams/<name> (and /composed's absence) represent for a
// still-unexpanded diagram. Shared by the raw-edit/duplicate/composed-refresh
// tests below.
const umbrellaRaw = {
  version: 1,
  id: 'umbrella',
  name: 'umbrella',
  nodes: [{ id: 'inc', name: 'inc', include: 'other' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

// The same umbrella, composed: what the boot list (and GET .../composed)
// serve — the grafted node is visible alongside the (now include-stripped)
// placeholder.
const umbrellaComposed = {
  ...umbrellaRaw,
  nodes: [
    { id: 'inc', name: 'inc' },
    { id: 'grafted', name: 'grafted', type: 'service' },
  ],
};

// Scope node-label lookups to the canvas: the panel's Name field is now a
// <textarea>, whose value is textContent, so an unscoped byText('node') also
// matches the panel (and the id <code>).
const canvas = () => within(document.querySelector('.dg-canvas') as HTMLElement);

interface DiagramFixture {
  name: string;
  model: unknown;
  issues: { message: string }[];
  editable: boolean;
}

// Route-driven fetch stub shared by every case below. `opts.extra` is tried
// FIRST, so a test can override any route below it (a failing POST, a custom
// raw-source/`/composed` response, an `/api/assets` upload, …); anything it
// leaves alone (returns undefined for) falls through to: GET /api/diagrams
// lists `diagrams`, GET /api/layouts serves `opts.layouts`, and (since Task 7)
// GET /api/diagrams/<name> — the raw source consumed by Edit and by
// duplicating an owned diagram — serves that entry's own `model`. None of
// these fixtures declare an `include`, so raw and composed coincide unless a
// test's `extra` says otherwise.
const stubFetch = (
  diagrams: DiagramFixture[],
  opts: { layouts?: unknown; extra?: (url: string, init?: RequestInit) => Response | undefined } = {},
) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const custom = opts.extra?.(url, init);
    if (custom !== undefined) return custom;
    if (url === '/api/diagrams') return new Response(JSON.stringify({ diagrams }), { status: 200 });
    if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: opts.layouts ?? {} }), { status: 200 });
    const rawMatch = /^\/api\/diagrams\/([^/]+)$/.exec(url);
    if (rawMatch !== null && (init === undefined || init.method === undefined || init.method === 'GET')) {
      const entry = diagrams.find((d) => d.name === rawMatch[1]);
      if (entry !== undefined) return new Response(JSON.stringify({ model: entry.model }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

describe('editor shell', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/'); // strip any hash from the previous case
    localStorage.clear(); // the last-open-diagram memory must not leak between cases
    // New-diagram flows prompt for a name; Add node no longer prompts at all.
    vi.spyOn(window, 'prompt').mockReturnValue('node');
    vi.stubGlobal(
      'fetch',
      stubFetch([
        { name: 'sketch', model: goodModel, issues: [], editable: true },
        { name: 'two', model: twoModel, issues: [], editable: false },
      ]),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('offers Edit for owned diagrams, dispatches edits, saves both files', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // edit mode renders one level at a time: the top-level container shows (children stay folded)
    expect(await screen.findByText('sys')).toBeDefined();
    // add a node from the Library tab (name comes from the stubbed prompt)
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    // save posts model + layout
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(calls).toContain('/api/diagrams/sketch');
      expect(calls).toContain('/api/layouts/sketch');
    });
  });

  it('remembers the open diagram across reloads', async () => {
    const { unmount } = render(<App />);
    // the open diagram is persisted so a fresh mount can restore it
    await waitFor(() => expect(localStorage.getItem('diagramming.selected')).toBe('sketch'));
    unmount();
    render(<App />);
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Diagram' }) as HTMLSelectElement).value).toBe('sketch'));
  });

  it('falls back to an existing diagram when the remembered one is gone', async () => {
    localStorage.setItem('diagramming.selected', 'deleted-diagram');
    render(<App />);
    // once the source list settles, the missing name is corrected to a real one
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Diagram' }) as HTMLSelectElement).value).toBe('sketch'));
    expect(await screen.findByRole('button', { name: /edit/i })).toBeDefined();
  });

  it('adds a node without prompting and focuses its name for renaming', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // Edit now starts from an async raw-source fetch: wait for the edit UI
    // before the next click, or it lands before the session exists.
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    // no prompt: the node lands as 'node' and its panel opens with the name focused
    expect(prompt).not.toHaveBeenCalled();
    const nameInput = (await screen.findByLabelText('Name')) as HTMLInputElement;
    expect(nameInput.value).toBe('node');
    await waitFor(() => expect(document.activeElement).toBe(nameInput));
  });

  it('adds a node via the N shortcut in edit mode', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // Edit now starts from an async raw-source fetch: the keydown listener only
    // subscribes once the session exists, so wait for the edit UI first.
    await screen.findByRole('button', { name: /^save$/i });
    fireEvent.keyDown(window, { key: 'n' });
    expect(await canvas().findByText('node')).toBeDefined();
  });

  it('undo reverts the last edit', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => expect(canvas().queryByText('node')).toBeNull());
  });

  it('refuses a New diagram whose name collides with an existing one', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'prompt').mockReturnValue('sketch');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /new diagram/i }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    // No create POST was fired for the colliding name.
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]) === '/api/diagrams/sketch' && (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });

  it('prefers the designer JSON source over a stale compiled artifact', async () => {
    // The compiled artifact for 'sketch' is the empty creation-time snapshot,
    // but the middleware serves the real saved source — the source must win.
    const freshModel = { ...goodModel, nodes: [...goodModel.nodes, { id: 'fresh', name: 'fresh', type: 'service' }] };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: freshModel, issues: [], editable: true }]));
    render(<App />);
    expect((await screen.findAllByText('fresh')).length).toBeGreaterThan(0);
  });

  it('offers New diagram from view mode even when no diagram is editable', async () => {
    // Middleware owns nothing (all artifacts TS-owned) — the header button must
    // still exist, or a fresh workspace has no way to create its first diagram.
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: goodModel, issues: [], editable: false }]));
    vi.spyOn(window, 'prompt').mockReturnValue('fresh');
    render(<App />);
    // read-only viewer for the TS-owned artifact, no Edit button
    expect(await screen.findByText(/read-only/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /new diagram/i }));
    // creates the source and lands in edit mode on the new empty diagram
    await waitFor(() => {
      const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => String(c[0]) === '/api/diagrams/fresh' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(posts).toHaveLength(1);
    });
    expect(await screen.findByRole('button', { name: /^save$/i })).toBeDefined();
  });

  it('creates a diagram through host.promptText even where window.prompt throws (Electron)', async () => {
    // The Obsidian fresh-vault repro: no diagrams at all, inside an Electron
    // renderer — where window.prompt THROWS ("prompt() is and will not be
    // supported."). Every name-entry flow must go through the host adapter's
    // promptText; one direct window.prompt call is a dead button in that host.
    vi.stubGlobal('fetch', stubFetch([]));
    vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('prompt() is and will not be supported.');
    });
    setHost({ ...defaultHost, promptText: async () => 'fresh' });
    try {
      render(<App />);
      // designable-but-empty workspace: invite creation instead of demanding a
      // compile step an Obsidian vault doesn't have
      expect(await screen.findByText(/no diagrams yet/i)).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: /new diagram/i }));
      await waitFor(() => {
        const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          (c) => String(c[0]) === '/api/diagrams/fresh' && (c[1] as RequestInit | undefined)?.method === 'POST',
        );
        expect(posts).toHaveLength(1);
      });
      expect(await screen.findByRole('button', { name: /^save$/i })).toBeDefined();
    } finally {
      setHost(defaultHost);
    }
  });

  it('keeps a saved node visible after leaving edit mode (no draft shadowing)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(calls).toContain('/api/diagrams/sketch');
    });
    // Leave edit mode; the saved model must shadow the compiled artifact in view.
    // (findAll: React Flow can briefly keep a stale duplicate while node sets swap.)
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect((await canvas().findAllByText('node')).length).toBeGreaterThan(0);
  });

  it('surfaces save issues raised by a failed save via Ctrl+S', async () => {
    // POSTs fail with a 500 carrying issues; the GETs (list + raw source) still succeed.
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'sketch', model: goodModel, issues: [], editable: true }], {
        extra: (_url, init) =>
          init?.method === 'POST'
            ? new Response(JSON.stringify({ issues: [{ message: 'disk on fire' }] }), { status: 500 })
            : undefined,
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(await screen.findByText(/disk on fire/i)).toBeDefined();
  });

  it('creates an image node from a canvas drop', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'sketch', model: goodModel, issues: [], editable: true }], {
        extra: (url) =>
          url === '/api/assets' ? new Response(JSON.stringify({ name: 'abc123def456.png' }), { status: 200 }) : undefined,
      }),
    );
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByText('sys');
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' });
    fireEvent.drop(canvas, { dataTransfer: { files: [file] }, clientX: 300, clientY: 200 });
    // node named after the file, body served from the assets endpoint
    const img = await screen.findByRole('img', { name: 'logo' });
    expect(img.getAttribute('src')).toBe('/api/assets/abc123def456.png');
  });

  it('creates one node per file on a multi-file drop', async () => {
    let uploads = 0;
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'sketch', model: goodModel, issues: [], editable: true }], {
        extra: (url) => {
          if (url !== '/api/assets') return undefined;
          uploads += 1;
          return new Response(JSON.stringify({ name: `hash${uploads}.png` }), { status: 200 });
        },
      }),
    );
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByText('sys');
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    const files = [
      new File(['png-1'], 'logo.png', { type: 'image/png' }),
      new File(['png-2'], 'icon.png', { type: 'image/png' }),
    ];
    fireEvent.drop(canvas, { dataTransfer: { files }, clientX: 300, clientY: 200 });
    // both files must land as distinct nodes; a stale model read would make the
    // second add-node collide with the first and silently drop it
    expect(await screen.findByRole('img', { name: 'logo' })).toBeDefined();
    expect(await screen.findByRole('img', { name: 'icon' })).toBeDefined();
  });

  it('creates a typeless node on double-click of the canvas', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByText('sys');
    const pane = container.querySelector('.react-flow__pane') as HTMLElement;
    fireEvent.click(pane, { detail: 2, clientX: 300, clientY: 200 });
    // the new node's name opens focused for renaming (rich box editor)
    const rename = (await screen.findByLabelText('Edit text')) as HTMLElement;
    expect(rename.textContent).toBe('node');
    // the canvas rename editor holds focus — no competing panel autofocus
    await waitFor(() => expect(document.activeElement).toBe(rename));
  });

  it('adds a typeless node from the toolbar (no service type)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    await canvas().findByText('node');
    // the node panel's Type field is empty for a typeless node
    const typeInput = (await screen.findByLabelText('Type')) as HTMLInputElement;
    expect(typeInput.value).toBe('');
  });

  it('autosaves shortly after an edit without an explicit Save', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    // No Save click: the debounced autosave must POST both model and layout on
    // its own (undo/redo makes any edit reversible, so saving eagerly is safe).
    await waitFor(() => {
      const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
        .map((c) => String(c[0]));
      expect(posts).toContain('/api/diagrams/sketch');
      expect(posts).toContain('/api/layouts/sketch');
    });
  });

  it('flushes the save and never prompts to discard when leaving edit mode dirty', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    // Leave while dirty: no discard confirmation (autosave replaces it), the
    // edit is flushed, and the node stays visible in view mode.
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(confirm).not.toHaveBeenCalled();
    expect((await canvas().findAllByText('node')).length).toBeGreaterThan(0);
    await waitFor(() => {
      const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
        .map((c) => String(c[0]));
      expect(posts).toContain('/api/diagrams/sketch');
    });
  });

  it('keeps the default (base) view reachable after a plane is added', async () => {
    // Regression: with planes present the switcher used to force plane[0], so the
    // base/no-plane view (and its plain look) became unreachable. A Default chip
    // must sit beside the plane chips and be selectable.
    const planed = { ...goodModel, planes: [{ id: 'infra', name: 'Infra' }] };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: planed, issues: [], editable: true }]));
    render(<App />);
    // Default is present and active on load; the plane chip sits beside it.
    const defaultChip = await screen.findByRole('button', { name: 'Default' });
    expect(defaultChip.className).toContain('active');
    expect(screen.getByRole('button', { name: 'Infra' }).className).not.toContain('active');
    // Switch to the plane…
    fireEvent.click(screen.getByRole('button', { name: 'Infra' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Infra' }).className).toContain('active'));
    expect(screen.getByRole('button', { name: 'Default' }).className).not.toContain('active');
    // …and back to Default (the whole point — it must be reachable again).
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Default' }).className).toContain('active'));
    expect(screen.getByRole('button', { name: 'Infra' }).className).not.toContain('active');
  });

  it('adds a node as view-local when a plane is active, and shared on Default', async () => {
    const planed = { ...goodModel, planes: [{ id: 'infra', name: 'Infra' }] };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: planed, issues: [], editable: true }]));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // switch to the Infra plane, then add a node — it must not appear on Default
    fireEvent.click(await screen.findByRole('button', { name: 'Infra' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    // the node's panel is open; its Scope shows "This plane"
    const scope = await screen.findByLabelText('Scope');
    expect((scope as HTMLSelectElement).value).toBe('local');
  });

  it('adds a node as shared (not view-local) when the active plane borrows containment', async () => {
    // A borrowing plane's membership is keyed to its base plane (compileView
    // resolves containmentOf), so tagging node.plane with the borrowing
    // plane's own id would mismatch and the node would vanish. Stage 1 guards
    // this by adding shared instead — provable by the node also showing on
    // Default (the base view), not just on the borrowing plane.
    const planed = {
      ...goodModel,
      planes: [
        { id: 'arch', name: 'Arch' },
        { id: 'borrow', name: 'Borrow', containmentOf: 'arch' },
      ],
    };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: planed, issues: [], editable: true }]));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Borrow' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    // Membership editing is disabled on a borrowing plane: no Scope control.
    expect(screen.queryByLabelText('Scope')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(await canvas().findByText('node')).toBeDefined();
  });

  it('creates a shared node from a canvas double-click when the active plane borrows containment', async () => {
    const planed = {
      ...goodModel,
      planes: [
        { id: 'arch', name: 'Arch' },
        { id: 'borrow', name: 'Borrow', containmentOf: 'arch' },
      ],
    };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: planed, issues: [], editable: true }]));
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Borrow' }));
    await screen.findByText('sys');
    const pane = container.querySelector('.react-flow__pane') as HTMLElement;
    fireEvent.click(pane, { detail: 2, clientX: 900, clientY: 900 });
    await screen.findByLabelText('Edit text');
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(await canvas().findByText('node')).toBeDefined();
  });

  it('toggles a shared node hidden on the active plane via the "Hidden here" checkbox', async () => {
    const planed = { ...goodModel, planes: [{ id: 'infra', name: 'Infra' }] };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: planed, issues: [], editable: true }]));
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Infra' }));
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    // select the shared node 'sys' by clicking its rendered box
    const nodeEl = (await within(canvas).findByText('sys')).closest('.react-flow__node') as HTMLElement;
    fireEvent.click(nodeEl);
    const hideToggle = (await screen.findByLabelText('Hidden here')) as HTMLInputElement;
    expect(hideToggle.checked).toBe(false);
    fireEvent.click(hideToggle);
    // hiding a shared node on the active plane must remove it from the canvas
    await waitFor(() => expect(within(canvas).queryByText('sys')).toBeNull());
  });

  it('changes the app style via the picker and persists it', async () => {
    const { container } = render(<App />);
    const select = (await screen.findByRole('combobox', { name: 'Style' })) as HTMLSelectElement;
    expect(container.querySelector('.dg-style-rough')).toBeNull();
    fireEvent.change(select, { target: { value: 'hand-drawn' } });
    await waitFor(() => expect(container.querySelector('.dg-style-hand-drawn')).not.toBeNull());
    expect(container.querySelector('.dg-style-rough')).not.toBeNull();
    expect(localStorage.getItem('diagramming.style')).toBe('hand-drawn');
  });

  it('restores the app style on reload, including legacy values', async () => {
    localStorage.setItem('diagramming.style', 'sketch');
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.dg-style-rough')).not.toBeNull());
  });

  it('keeps the style when the light/dark theme is toggled (independent controls)', async () => {
    const { container } = render(<App />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Style' }), { target: { value: 'sketch' } });
    await waitFor(() => expect(container.querySelector('.dg-style-rough')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /light|dark/i }));
    expect(container.querySelector('.dg-style-rough')).not.toBeNull();
  });

  it('collapses the right dock to a rail and expands it again', async () => {
    const { container } = render(<App />);
    // the layers & planes panel is open by default (right dock, both modes)
    expect(await screen.findByText(/layers & planes/i)).toBeDefined();
    // collapse → panel content gone, only the expand rail remains
    fireEvent.click(container.querySelector('.dock-right .dock-toggle') as HTMLElement);
    await waitFor(() => expect(screen.queryByText(/layers & planes/i)).toBeNull());
    expect(screen.getByRole('button', { name: /expand panel/i })).toBeDefined();
    // expand → content returns
    fireEvent.click(container.querySelector('.dock-right .dock-toggle') as HTMLElement);
    expect(await screen.findByText(/layers & planes/i)).toBeDefined();
  });

  it('persists the collapsed right dock across reloads', async () => {
    const { container, unmount } = render(<App />);
    await screen.findByText(/layers & planes/i);
    fireEvent.click(container.querySelector('.dock-right .dock-toggle') as HTMLElement);
    await waitFor(() => expect(screen.queryByText(/layers & planes/i)).toBeNull());
    unmount();
    render(<App />);
    // a fresh mount starts collapsed: the expand rail is present, no panel content
    expect(await screen.findByRole('button', { name: /expand panel/i })).toBeDefined();
    expect(screen.queryByText(/layers & planes/i)).toBeNull();
  });

  it('keeps the left inspector collapsed when a node is selected (no auto-open), showing a hint', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByText('sys');
    // collapse the left inspector dock, then select a node
    const leftToggle = container.querySelector('.dock-left .dock-toggle') as HTMLElement;
    fireEvent.click(leftToggle);
    const nodeEl = (await screen.findByText('sys')).closest('.react-flow__node') as HTMLElement;
    fireEvent.click(nodeEl);
    // the node panel must NOT open — the dock stays collapsed, its Name field absent
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(container.querySelector('.dock-left .dock-dot')).not.toBeNull();
  });

  it('selecting clean removes the style classes', async () => {
    localStorage.setItem('diagramming.style', 'sketch');
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.dg-style-rough')).not.toBeNull());
    fireEvent.change(screen.getByRole('combobox', { name: 'Style' }), { target: { value: 'clean' } });
    await waitFor(() => expect(container.querySelector('.dg-style-rough')).toBeNull());
  });

  it('a diagram-pinned style wins over the app preference and disables the picker', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'sketch', model: { ...goodModel, style: 'sketch' }, issues: [], editable: true }]),
    );
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.dg-style-rough')).not.toBeNull());
    const select = screen.getByRole('combobox', { name: 'Style' }) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('sketch');
    expect(select.title).toBe('Set by diagram');
  });

  it('an unknown pinned style behaves as unpinned (app preference applies)', async () => {
    localStorage.setItem('diagramming.style', 'sketch');
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'sketch', model: { ...goodModel, style: 'retired-style' }, issues: [], editable: true }]),
    );
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.dg-style-rough')).not.toBeNull()); // app pref won
    expect((screen.getByRole('combobox', { name: 'Style' }) as HTMLSelectElement).disabled).toBe(false);
  });

  it('edit mode: picking a style pins it on the diagram and autosaves it', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const select = (await screen.findByRole('combobox', { name: 'Diagram style' })) as HTMLSelectElement;
    expect(select.value).toBe(''); // (app default)
    fireEvent.change(select, { target: { value: 'hand-drawn' } });
    await waitFor(() => expect(container.querySelector('.dg-style-hand-drawn')).not.toBeNull());
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/sketch' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string) as { style?: string };
      expect(body.style).toBe('hand-drawn');
    });
    // pinning is a normal command: undo clears it
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => expect(container.querySelector('.dg-style-hand-drawn')).toBeNull());
    expect(select.value).toBe('');
  });

  it('places a library node from the palette', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    // two entries answer to "Place Person" now (C4 and the Shapes pack) — either works here
    fireEvent.click((await screen.findAllByRole('button', { name: /place Person/i }))[0]!);
    // placing keeps the Library tab active (does NOT flip to Properties)…
    expect(screen.getByRole('tab', { name: 'Library' }).getAttribute('aria-selected')).toBe('true');
    // …and the node appears on the canvas
    expect(
      (await within(container.querySelector('.dg-canvas') as HTMLElement).findAllByText('Person')).length,
    ).toBeGreaterThan(0);
  });

  it('nests a placed library node under the selected container', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // select the container 'sys' by clicking its rendered box
    const sysEl = (await within(container.querySelector('.dg-canvas') as HTMLElement).findByText('sys')).closest(
      '.react-flow__node',
    ) as HTMLElement;
    fireEvent.click(sysEl);
    // open the Library and place a C4 Person while 'sys' is selected
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    // two entries answer to "Place Person" now (C4 and the Shapes pack) — either works here
    fireEvent.click((await screen.findAllByRole('button', { name: /place Person/i }))[0]!);
    // autosave posts the model with the placed node nested under 'sys'
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/sketch' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string) as { containment: { parent: string }[] };
      // pre-existing {sys->a} plus the newly placed Person under sys
      expect(body.containment.filter((c) => c.parent === 'sys')).toHaveLength(2);
    });
  });

  it('parents a new node under the drilled-in level when nothing is selected', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // drill into the 'sys' container via its ⤢ chip — this selects nothing
    fireEvent.click(await screen.findByLabelText('Enter node'));
    // add a node from the Library tab; with nothing selected it must nest under
    // the drilled level ('sys'), not land at the model root
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/sketch' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string) as { containment: { parent: string }[] };
      // pre-existing {sys->a} plus the newly added node nested under the drilled 'sys'
      expect(body.containment.filter((c) => c.parent === 'sys')).toHaveLength(2);
    });
  });

  it('places a library entry where it is dropped on the canvas', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByText('sys');
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    // simulate dropping the bundled AWS Lambda entry (carried by its DnD MIME type)
    fireEvent.drop(canvas, {
      dataTransfer: {
        getData: (t: string) => (t === 'application/x-dg-library-entry' ? 'aws-lambda' : ''),
        files: [],
      },
      clientX: 320,
      clientY: 220,
    });
    // the dropped entry becomes an image node captioned with its name
    expect((await screen.findAllByText('AWS Lambda')).length).toBeGreaterThan(0);
  });

  it('nests a dropped library entry under the node it lands on', async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByText('sys');
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    // make the drop resolve onto the 'sys' container node
    const sysEl = document.createElement('div');
    sysEl.className = 'react-flow__node';
    sysEl.setAttribute('data-id', 'sys');
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(sysEl);
    fireEvent.drop(canvas, {
      dataTransfer: { getData: (t: string) => (t === 'application/x-dg-library-entry' ? 'aws-lambda' : ''), files: [] },
      clientX: 300,
      clientY: 200,
    });
    spy.mockRestore();
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/sketch' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string) as { containment: { parent: string }[] };
      expect(body.containment.filter((c) => c.parent === 'sys')).toHaveLength(2);
    });
  });

  it('shows Layers & planes on the right and the Library as a tab at the same time', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // Layers & planes lives in the right dock, always present in edit mode
    expect(screen.getByRole('heading', { name: /layers & planes/i })).toBeDefined();
    // Library is a tab; opening it does not hide Layers & planes
    fireEvent.click(await screen.findByRole('tab', { name: 'Library' }));
    expect(screen.getByLabelText('Search library')).toBeDefined();
    expect(screen.getByRole('heading', { name: /layers & planes/i })).toBeDefined();
  });

  it('a model-level notation reaches the canvas', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await canvas().findByText('sys');
    // model.notation -> activeNotation -> DiagramView, no plane involved (the
    // spec's zero-plane gating concern: this diagram has none).
    fireEvent.change(screen.getByLabelText('Notation'), { target: { value: 'c4' } });
    await waitFor(() =>
      expect(document.querySelector('.dg-canvas')?.classList.contains('dg-notation-c4')).toBe(true),
    );
  });

  it('shows an auto-layout toggle in edit mode, pressed by default', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const toggle = await screen.findByRole('button', { name: /auto-layout/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('flips the auto-layout toggle to manual and back', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const toggle = await screen.findByRole('button', { name: /auto-layout/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('false'));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'));
  });

  it('adds a node from the Library while manual layout is on', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // flip to manual layout, then place a node — it must still land on the canvas
    fireEvent.click(await screen.findByRole('button', { name: /auto-layout/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
  });

  it('adds an edge label through the panel and persists it', async () => {
    // A model with a real edge to select; the panel's labels list drives it.
    const related = {
      ...goodModel,
      nodes: [
        { id: 'a', name: 'a', type: 'service' },
        { id: 'b', name: 'b', type: 'service' },
      ],
      containment: [],
      relations: [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'sync' }],
    };
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: related, issues: [], editable: true }]));
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await canvas().findByText('a');
    // select the edge by clicking its rendered connector, opening the edge panel
    const edge = await waitFor(() => {
      const el = container.querySelector('.react-flow__edge');
      if (el === null) throw new Error('edge not rendered yet');
      return el as HTMLElement;
    });
    fireEvent.click(edge);
    // the panel's labels list is reachable: Add label opens an empty row
    fireEvent.click(await screen.findByRole('button', { name: /add label/i }));
    const labelInput = await screen.findByLabelText('New label text');
    fireEvent.change(labelInput, { target: { value: 'ack' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });
    // autosave persists the model carrying the newly added label
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/sketch' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string) as {
        relations: { labels?: { text: string }[] }[];
      };
      expect(body.relations[0]?.labels?.some((l) => l.text === 'ack')).toBe(true);
    });
  });

  it('adds a nested node in manual layout without crashing (regression: absolute viewport-center vs. parent-relative position)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // flip to manual layout, then select 'sys' so the next add nests under it —
    // jsdom can't observe geometry, so this only guards against a crash/regression
    // on the manual+parent path, not the placed coordinate itself.
    fireEvent.click(await screen.findByRole('button', { name: /auto-layout/i }));
    const nodeEl = (await canvas().findByText('sys')).closest('.react-flow__node') as HTMLElement;
    fireEvent.click(nodeEl);
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    // the new node nests under 'sys', which stays collapsed under the one-level-at-a-time
    // LOD; drill into 'sys' to reveal its interior (proves the nested add didn't crash)
    fireEvent.click(await screen.findByLabelText('Enter node'));
    expect((await canvas().findAllByText('node')).length).toBeGreaterThan(0);
  });

  it('boots drilled into the level named by the URL hash', async () => {
    window.location.hash = '#/sketch/sys';
    render(<App />);
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
    expect(await canvas().findByText('a')).toBeDefined(); // inside sys
  });

  it('lets the hash diagram outrank the localStorage memory', async () => {
    localStorage.setItem('diagramming.selected', 'two');
    window.location.hash = '#/sketch';
    render(<App />);
    // canvas() binds to '.dg-canvas' at call time; boot (and so the canvas) is now
    // async, so the first query goes through screen (always bound to document.body).
    expect(await screen.findByText('sys')).toBeDefined();
    expect(canvas().queryByText('zed')).toBeNull();
  });

  it('keeps the localStorage memory when there is no hash', async () => {
    localStorage.setItem('diagramming.selected', 'two');
    render(<App />);
    expect(await screen.findByText('zed')).toBeDefined();
  });

  it('updates the hash when drilling into a node', async () => {
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Enter node')); // drill into sys
    await waitFor(() => expect(window.location.hash).toBe('#/sketch/sys'));
  });

  it('drills back out on a hashchange (browser Back)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Enter node'));
    await waitFor(() => expect(window.location.hash).toBe('#/sketch/sys'));
    window.location.hash = '#/sketch'; // what Back restores
    fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull());
  });

  it('corrects a stale drill path in place (no history push)', async () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    window.location.hash = '#/sketch/sys/ghost';
    render(<App />);
    // canvas() binds to '.dg-canvas' at call time; boot (and so the canvas) is now
    // async, so this first query goes through screen instead.
    expect(await screen.findByText('a')).toBeDefined(); // pruned to sys, not blank
    await waitFor(() => expect(window.location.hash).toBe('#/sketch/sys'));
    expect(replaceSpy).toHaveBeenCalled();
  });

  it('falls back and corrects the URL for an unknown diagram', async () => {
    window.location.hash = '#/nope';
    render(<App />);
    // canvas() binds to '.dg-canvas' at call time; that element doesn't exist
    // until the async fallback (booted-gated) corrects the unknown diagram, so
    // this query goes through screen (always bound to document.body) instead.
    expect(await screen.findByText('sys')).toBeDefined(); // first diagram loaded
    await waitFor(() => expect(window.location.hash).toBe('#/sketch'));
  });

  it('pushes (does not replace) history on a breadcrumb drill-out', async () => {
    // Regression coverage for the appliedUrlRef bookkeeping in
    // handleEnteredPathChange/the URL writer: a genuine navigation (drilling out
    // via the breadcrumb) must push a new history entry, never get misread as
    // the stale-link "correction" (replaceState) path. (Content and `booted` now
    // arrive together from the same boot fetch, so the previous variant of this
    // test — clicking the breadcrumb before /api/diagrams resolved — is no
    // longer reachable: the breadcrumb can't exist before that fetch settles.)
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    window.location.hash = '#/sketch/sys'; // valid deep link, no pruning needed
    render(<App />);
    const nav = await screen.findByLabelText('Nested zoom breadcrumb');
    expect(window.location.hash).toBe('#/sketch/sys');
    const home = nav.querySelector('.dg-crumb-home') as HTMLElement;
    fireEvent.click(home);
    await waitFor(() => expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull());
    await waitFor(() => expect(window.location.hash).toBe('#/sketch'));
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('keeps the drill trail when the diagram is renamed', async () => {
    vi.stubGlobal('fetch', stubFetch([{ name: 'sketch', model: goodModel, issues: [], editable: true }]));
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Enter node')); // drill into sys
    await waitFor(() => expect(window.location.hash).toBe('#/sketch/sys'));
    expect(await canvas().findByText('a')).toBeDefined();
    vi.spyOn(window, 'prompt').mockReturnValue('renamed');
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/renamed/));
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
    expect(window.location.hash).toBe('#/renamed/sys');
  });

  it('leaves edit mode when a hashchange switches diagrams', async () => {
    // Both diagrams owned so the Edit button can reappear for 'two' after the
    // hashchange closes the edit session on 'sketch'.
    vi.stubGlobal(
      'fetch',
      stubFetch([
        { name: 'sketch', model: goodModel, issues: [], editable: true },
        { name: 'two', model: twoModel, issues: [], editable: true },
      ]),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    fireEvent.click(await screen.findByLabelText('Enter node')); // drill into sys
    await waitFor(() => expect(window.location.hash).toBe('#/sketch/sys'));
    // Simulate browser Back landing on another diagram's entry.
    window.location.hash = '#/two';
    fireEvent(window, new HashChangeEvent('hashchange'));
    // The edit session must close (like the picker's switch path): Edit offered
    // again, Done gone, and the canvas actually renders diagram 'two'.
    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /done/i })).toBeNull();
    expect(await canvas().findByText('zed')).toBeDefined();
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Diagram' }) as HTMLSelectElement).value).toBe('two'));
    expect(window.location.hash).toBe('#/two');
  });

  it('duplicates a read-only diagram into an editable copy and opens it for editing', async () => {
    render(<App />);
    // Wait for boot to settle on the first diagram before touching the picker:
    // until the deep-link fallback promotes `selected` out of '', its pending
    // update would clobber the switch (the select shows the first option in the
    // meantime, so the DOM alone can't tell the two states apart).
    await screen.findByRole('button', { name: /^edit$/i });
    // 'two' is the TS-owned artifact in the fixture: viewable, not editable.
    fireEvent.change(screen.getByRole('combobox', { name: 'Diagram' }), { target: { value: 'two' } });
    expect(await screen.findByText(/read-only/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));
    // The copy is written as a JSON source under a free name, with the model's
    // own id/name rewritten so the file stays self-consistent.
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/two-copy' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
        id: 'two-copy',
        name: 'two-copy',
        nodes: [{ id: 'z', name: 'zed' }],
      });
    });
    // ...and the studio lands in an edit session on the copy, not the original.
    expect(await screen.findByRole('button', { name: /^save$/i })).toBeDefined();
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Diagram' }) as HTMLSelectElement).value).toBe('two-copy'),
    );
  });

  it('carries the source diagram\'s saved layout onto the copy', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'two', model: twoModel, issues: [], editable: false }], {
        layouts: { two: { version: 1, planes: { default: { z: { x: 40, y: 80 } } } } },
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /duplicate/i }));
    // Positions are the point of duplicating for a demo: the copy must open
    // laid out exactly like the original, not re-arranged from scratch.
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/layouts/two-copy' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
        planes: { default: { z: { x: 40, y: 80 } } },
      });
    });
  });

  it('numbers a second copy instead of colliding with the first', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([
        { name: 'two', model: twoModel, issues: [], editable: false },
        { name: 'two-copy', model: { ...twoModel, id: 'two-copy', name: 'two-copy' }, issues: [], editable: true },
      ]),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /duplicate/i }));
    await waitFor(() => {
      const posted = (fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
        .map((c) => String(c[0]));
      expect(posted).toContain('/api/diagrams/two-copy-2');
      expect(posted).not.toContain('/api/diagrams/two-copy');
    });
  });

  it('the Eject chip promotes an owned diagram and flips it read-only', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    // 'sketch' is the owned (JSON-backed) diagram in the fixture, selected by default.
    await screen.findByRole('button', { name: /^edit$/i });
    fireEvent.click(screen.getByRole('button', { name: /^eject$/i }));
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/sketch/eject' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
    });
    // Ownership dropped locally: the Edit and Eject chips both disappear, and
    // the diagram now renders through the read-only branch instead.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^eject$/i })).toBeNull();
    });
  });

  it('declining the confirm sends nothing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await screen.findByRole('button', { name: /^edit$/i });
    fireEvent.click(screen.getByRole('button', { name: /^eject$/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    // No eject POST fired, and the diagram stays owned — the chip is still there.
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]) === '/api/diagrams/sketch/eject',
    );
    expect(posts).toHaveLength(0);
    expect(screen.getByRole('button', { name: /^eject$/i })).toBeDefined();
  });

  it('the Eject chip is absent for read-only diagrams', async () => {
    render(<App />);
    await screen.findByRole('button', { name: /^edit$/i });
    // 'two' is the TS-owned artifact in the fixture: viewable, not editable.
    fireEvent.change(screen.getByRole('combobox', { name: 'Diagram' }), { target: { value: 'two' } });
    expect(await screen.findByText(/read-only/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /^eject$/i })).toBeNull();
  });

  it('entering edit starts the session from the raw source, not the composed boot model', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'umbrella', model: umbrellaComposed, issues: [], editable: true }], {
        extra: (url) =>
          url === '/api/diagrams/umbrella' ? new Response(JSON.stringify({ model: umbrellaRaw }), { status: 200 }) : undefined,
      }),
    );
    render(<App />);
    // canvas() binds to '.dg-canvas' at call time; boot is async, so the first
    // query goes through screen (always bound to document.body) instead. The
    // boot list serves the composed umbrella: the grafted node is visible.
    expect(await screen.findByText('grafted')).toBeDefined();
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    // The edit session is seeded from the raw source: only the include
    // placeholder shows, the grafted node is gone.
    expect(await screen.findByRole('button', { name: /^save$/i })).toBeDefined();
    await waitFor(() => expect(canvas().queryByText('grafted')).toBeNull());
    expect(canvas().getByText('inc')).toBeDefined();
  });

  it('a failed raw-source fetch refuses to enter edit', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'sketch', model: goodModel, issues: [], editable: true }], {
        extra: (url) =>
          url === '/api/diagrams/sketch'
            ? new Response(JSON.stringify({ issues: [{ message: 'disk on fire' }] }), { status: 500 })
            : undefined,
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await screen.findByText(/could not load 'sketch' for editing/i)).toBeDefined();
    // still in view mode: Edit is offered again, Save never appears
    expect(screen.getByRole('button', { name: /edit/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('leaving edit refreshes the view with the composed model — saves alone do not', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'umbrella', model: umbrellaComposed, issues: [], editable: true }], {
        extra: (url) => {
          if (url === '/api/diagrams/umbrella') return new Response(JSON.stringify({ model: umbrellaRaw }), { status: 200 });
          if (url === '/api/diagrams/umbrella/composed') {
            return new Response(JSON.stringify({ model: umbrellaComposed }), { status: 200 });
          }
          return undefined;
        },
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await waitFor(() => expect(canvas().queryByText('grafted')).toBeNull()); // editing the raw source
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const calls = () => (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    // The save itself lands (raw POST) without a server-side re-compose: the
    // composed shadow only matters once the session ends.
    await waitFor(() => expect(calls().filter((u) => u === '/api/diagrams/umbrella').length).toBeGreaterThan(1));
    expect(calls()).not.toContain('/api/diagrams/umbrella/composed');
    // Leave edit; view mode must show the freshly composed model again.
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    await waitFor(() => expect(calls()).toContain('/api/diagrams/umbrella/composed'));
    expect((await canvas().findAllByText('grafted')).length).toBeGreaterThan(0);
  });

  it('duplicating an owned umbrella copies the raw source', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ name: 'umbrella', model: umbrellaComposed, issues: [], editable: true }], {
        extra: (url) =>
          url === '/api/diagrams/umbrella' ? new Response(JSON.stringify({ model: umbrellaRaw }), { status: 200 }) : undefined,
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /duplicate/i }));
    await waitFor(() => {
      const post = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === '/api/diagrams/umbrella-copy' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse(String((post![1] as RequestInit).body)) as { nodes: { id: string }[] };
      expect(body.nodes.some((n) => n.id === 'inc')).toBe(true);
      expect(body.nodes.some((n) => n.id === 'grafted')).toBe(false);
    });
  });
});
