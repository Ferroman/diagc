// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

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

// Scope node-label lookups to the canvas: the panel's Name field is now a
// <textarea>, whose value is textContent, so an unscoped byText('node') also
// matches the panel (and the id <code>).
const canvas = () => within(document.querySelector('.dg-canvas') as HTMLElement);

describe('editor shell', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/'); // strip any hash from the previous case
    localStorage.clear(); // the last-open-diagram memory must not leak between cases
    // New-diagram flows prompt for a name; Add node no longer prompts at all.
    vi.spyOn(window, 'prompt').mockReturnValue('node');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({
              diagrams: [
                { name: 'sketch', model: goodModel, issues: [], editable: true },
                { name: 'two', model: twoModel, issues: [], editable: false },
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
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
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
    fireEvent.keyDown(window, { key: 'n' });
    expect(await canvas().findByText('node')).toBeDefined();
  });

  it('undo reverts the last edit', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: freshModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    render(<App />);
    expect((await screen.findAllByText('fresh')).length).toBeGreaterThan(0);
  });

  it('offers New diagram from view mode even when no diagram is editable', async () => {
    // Middleware owns nothing (all artifacts TS-owned) — the header button must
    // still exist, or a fresh workspace has no way to create its first diagram.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: goodModel, issues: [], editable: false }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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

  it('keeps a saved node visible after leaving edit mode (no draft shadowing)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
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
    // POSTs fail with a 500 carrying issues; the GET for ownership still succeeds.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: goodModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ issues: [{ message: 'disk on fire' }] }), { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    expect(await canvas().findByText('node')).toBeDefined();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(await screen.findByText(/disk on fire/i)).toBeDefined();
  });

  it('creates an image node from a canvas drop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: goodModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        if (url === '/api/assets') {
          return new Response(JSON.stringify({ name: 'abc123def456.png' }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
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
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: goodModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        if (url === '/api/assets') {
          uploads += 1;
          return new Response(JSON.stringify({ name: `hash${uploads}.png` }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
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
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /add node/i }));
    await canvas().findByText('node');
    // the node panel's Type field is empty for a typeless node
    const typeInput = (await screen.findByLabelText('Type')) as HTMLInputElement;
    expect(typeInput.value).toBe('');
  });

  it('autosaves shortly after an edit without an explicit Save', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: planed, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams')
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: planed, issues: [], editable: true }] }),
            { status: 200 },
          );
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams')
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: planed, issues: [], editable: true }] }),
            { status: 200 },
          );
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams')
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: planed, issues: [], editable: true }] }),
            { status: 200 },
          );
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams')
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: planed, issues: [], editable: true }] }),
            { status: 200 },
          );
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({
              diagrams: [{ name: 'sketch', model: { ...goodModel, style: 'sketch' }, issues: [], editable: true }],
            }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
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
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({
              diagrams: [
                { name: 'sketch', model: { ...goodModel, style: 'retired-style' }, issues: [], editable: true },
              ],
            }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
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
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /place Person/i }));
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
    fireEvent.click(await screen.findByRole('button', { name: /place Person/i }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    expect(screen.getByLabelText('Search library')).toBeDefined();
    expect(screen.getByRole('heading', { name: /layers & planes/i })).toBeDefined();
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: related, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({ diagrams: [{ name: 'sketch', model: goodModel, issues: [], editable: true }] }),
            { status: 200 },
          );
        }
        if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
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
      vi.fn(async (url: string) => {
        if (url === '/api/diagrams') {
          return new Response(
            JSON.stringify({
              diagrams: [
                { name: 'sketch', model: goodModel, issues: [], editable: true },
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
});
