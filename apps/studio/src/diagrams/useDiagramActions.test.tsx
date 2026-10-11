// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyDrawings,
  emptyLayout,
  type DiagramModel,
  type Drawings,
  type EditorState,
  type LayoutOverlay,
} from '@diagc/core/internal';
import { defaultHost, setHost, type HostAdapter } from '../host';
import { useDeepLink } from './useDeepLink';
import { useDiagramActions } from './useDiagramActions';
import { useDiagramBoot } from './useDiagramBoot';

// The lifecycle flows run against the real artifact store (useDiagramBoot) and
// the real selection (useDeepLink), so what they leave behind is read the way
// the studio reads it.

const model = (name: string, nodes = ['a']): DiagramModel => ({
  version: 1,
  id: name,
  name,
  nodes: nodes.map((id) => ({ id, name: id, type: 'service' })),
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});
const LAYOUT: LayoutOverlay = { version: 1, planes: { default: { a: { x: 3, y: 4 } } } };
const DRAWINGS: Drawings = { version: 1, planes: { default: [{ id: 'k1', points: [0, 0, 1, 1], width: 2 }] } };

interface Req {
  method: string;
  url: string;
  body?: unknown;
}
let requests: Req[];
let reply: (req: Req) => Response | undefined;
let prompt: ReturnType<typeof vi.fn<HostAdapter['promptText']>>;
let confirm: ReturnType<typeof vi.fn<HostAdapter['confirmDialog']>>;
let notify: ReturnType<typeof vi.fn<HostAdapter['notify']>>;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  reply = () => undefined;
  prompt = vi.fn<HostAdapter['promptText']>(async () => null);
  confirm = vi.fn<HostAdapter['confirmDialog']>(async () => true);
  notify = vi.fn<HostAdapter['notify']>();
  let hash = '';
  setHost({
    ...defaultHost,
    urlState: { get: () => hash, set: (h) => void (hash = h), subscribe: () => () => {} },
    promptText: prompt,
    confirmDialog: confirm,
    notify,
    apiFetch: async (url, init) => {
      const req: Req = {
        method: init?.method ?? 'GET',
        url,
        ...(init?.body != null ? { body: JSON.parse(String(init.body)) } : {}),
      };
      if (url === '/api/diagrams' && req.method === 'GET')
        return new Response(
          JSON.stringify({
            diagrams: [
              { name: 'docs/one', model: model('docs/one'), issues: [], editable: true },
              { name: 'two', model: model('two', ['z']), issues: [], editable: false },
            ],
          }),
        );
      if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: { 'docs/one': LAYOUT } }));
      if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }));
      requests.push(req);
      return reply(req) ?? new Response(JSON.stringify({ ok: true }));
    },
  });
});
afterEach(() => setHost(defaultHost));

/** the hook wired the way App wires it, plus the recordings a test reads */
async function mount(opts: { editing?: boolean; leave?: boolean } = {}) {
  const started: [string, EditorState][] = [];
  const resetView = vi.fn();
  const leaveEdit = vi.fn(() => opts.leave ?? true);
  let renders = 0;
  const hook = renderHook(() => {
    renders++;
    const boot = useDiagramBoot();
    const leaveEditRef = useRef<() => boolean>(() => true);
    const resetViewRef = useRef<() => void>(() => {});
    const dl = useDeepLink({ names: boot.names, booted: boot.booted, leaveEditRef, resetViewRef });
    const [editing, setEditing] = useState(opts.editing ?? false);
    const actions = useDiagramActions({
      editing,
      selected: dl.selected,
      current: boot.artifacts[dl.selected],
      names: boot.names,
      ownedNames: boot.ownedNames,
      store: boot,
      selectDiagram: dl.selectDiagram,
      renameSelected: dl.renameSelected,
      startEditing: (name, state) => {
        started.push([name, state]);
        setEditing(true);
      },
      leaveEdit,
      resetView,
    });
    return { boot, dl, editing, actions };
  });
  await waitFor(() => expect(hook.result.current.dl.selected).toBe('docs/one'));
  return {
    hook,
    get now() {
      return hook.result.current;
    },
    started,
    resetView,
    leaveEdit,
    get renders() {
      return renders;
    },
    run: async (pick: (a: typeof hook.result.current.actions) => Promise<void>) => {
      await act(async () => pick(hook.result.current.actions));
    },
  };
}

describe('useDiagramActions: New', () => {
  // Breaks if New stops asking leaveEdit first, or goes on when it refuses.
  it('does nothing when the open session will not close', async () => {
    const t = await mount({ leave: false });
    await t.run((a) => a.newDiagram());
    expect(prompt).not.toHaveBeenCalled();
  });

  // Breaks if the prompt stops being seeded with the open diagram's folder, or a
  // cancelled, blank, folder-only or taken name still reaches the server.
  it('seeds the prompt with the folder and refuses names it cannot create', async () => {
    const t = await mount();
    for (const answer of [null, '  ', 'docs/', 'two', 'docs/one']) {
      prompt.mockResolvedValueOnce(answer);
      await t.run((a) => a.newDiagram());
    }
    expect(prompt.mock.calls[0]?.[1]).toBe('docs/');
    expect(requests).toEqual([]);
    expect(notify.mock.calls.map(([m]) => m)).toEqual([
      "A diagram named 'two' already exists.",
      "A diagram named 'docs/one' already exists.",
    ]);
  });

  // Breaks if a refused create still opens the diagram.
  it('reports a create the server refused and changes nothing', async () => {
    const t = await mount();
    reply = () => new Response('{}', { status: 500 });
    prompt.mockResolvedValueOnce('fresh');
    await t.run((a) => a.newDiagram());
    expect(notify).toHaveBeenCalledWith("Could not create 'fresh'");
    expect(t.now.dl.selected).toBe('docs/one');
    expect(t.now.boot.names).not.toContain('fresh');
  });

  // Breaks if the empty model posted, the draft, ownership, the selection, the
  // view reset or the edit session it opens on changes.
  it('creates an empty diagram, owns it, opens it on a fresh view and edits it', async () => {
    const t = await mount();
    prompt.mockResolvedValueOnce(' fresh ');
    await t.run((a) => a.newDiagram());
    const empty = { ...model('fresh', []) };
    expect(requests).toEqual([{ method: 'POST', url: '/api/diagrams/fresh', body: empty }]);
    expect(t.now.boot.artifacts['fresh']).toEqual({ name: 'fresh', model: empty, issues: [] });
    expect(t.now.boot.ownedNames.has('fresh')).toBe(true);
    expect(t.now.dl.selected).toBe('fresh');
    expect(t.now.dl.enteredPath).toEqual([]);
    expect(t.resetView).toHaveBeenCalledTimes(1);
    expect(t.started).toEqual([['fresh', { model: empty, layout: emptyLayout(), drawings: emptyDrawings() }]]);
    expect(t.now.editing).toBe(true);
  });
});

describe('useDiagramActions: Rename', () => {
  // Breaks if a rename can start in edit mode, or an unchanged or taken name
  // still reaches the server.
  it('refuses while editing and on names it cannot take', async () => {
    const editing = await mount({ editing: true });
    await editing.run((a) => a.renameDiagram());
    expect(prompt).not.toHaveBeenCalled();

    const t = await mount();
    for (const answer of [null, 'docs/one', 'two']) {
      prompt.mockResolvedValueOnce(answer);
      await t.run((a) => a.renameDiagram());
    }
    expect(prompt.mock.calls[0]?.[1]).toBe('docs/one');
    expect(requests).toEqual([]);
    expect(notify).toHaveBeenCalledWith("A diagram named 'two' already exists.");
  });

  // Breaks if a refused rename still moves anything.
  it('reports a rename the server refused and keeps the old name', async () => {
    const t = await mount();
    reply = () => new Response('{}', { status: 409 });
    prompt.mockResolvedValueOnce('renamed');
    await t.run((a) => a.renameDiagram());
    expect(notify).toHaveBeenCalledWith("Could not rename 'docs/one'");
    expect(t.now.dl.selected).toBe('docs/one');
  });

  // Breaks if the move misses a store (the diagram would vanish under its new
  // name), the model keeps its old id, ownership does not follow, or the drill
  // trail is not handed back as a fresh array of the same ids.
  it('moves the diagram, its ownership and the selection, keeping the drill trail', async () => {
    const t = await mount();
    act(() => t.now.dl.handleEnteredPathChange(['a']));
    const trail = t.now.dl.enteredPath;
    prompt.mockResolvedValueOnce('renamed');
    await t.run((a) => a.renameDiagram());
    expect(requests).toEqual([{ method: 'POST', url: '/api/diagrams/docs/one/rename', body: { to: 'renamed' } }]);
    expect(t.now.boot.names).toEqual(['renamed', 'two']);
    expect(t.now.boot.artifacts['renamed']?.model).toEqual({ ...model('docs/one'), id: 'renamed', name: 'renamed' });
    expect(t.now.boot.artifacts['renamed']?.layout).toEqual(LAYOUT);
    expect([...t.now.boot.ownedNames]).toEqual(['renamed']);
    expect(t.now.dl.selected).toBe('renamed');
    expect(t.now.dl.enteredPath).toEqual(['a']);
    expect(t.now.dl.enteredPath).not.toBe(trail);
  });

  // Breaks if the rename's state changes stop landing in one commit: between
  // two, the selection names a diagram the store does not have yet, and the
  // fallback effect bounces it to the first name.
  // Started outside act() and awaited with waitFor, so React's own scheduler
  // decides how many renders the changes take, as it does in the browser.
  it('lands every change in one render', async () => {
    const t = await mount();
    const before = t.renders;
    prompt.mockResolvedValueOnce('renamed');
    void t.now.actions.renameDiagram();
    await waitFor(() => expect(t.now.dl.selected).toBe('renamed'));
    expect(t.renders - before).toBe(1);
  });
});

describe('useDiagramActions: Duplicate', () => {
  // Breaks if Duplicate stops asking leaveEdit first.
  it('does nothing when the open session will not close', async () => {
    const t = await mount({ leave: false });
    await t.run((a) => a.duplicateDiagram());
    expect(requests).toEqual([]);
  });

  // Breaks if an owned diagram stops being copied from its raw source (an
  // umbrella's composed model would bake its includes into the copy), or its
  // sidecars stop going with it.
  it('copies an owned diagram from its source, sidecars and all, and edits the copy', async () => {
    const t = await mount();
    const source = model('docs/one', ['a', 'b']);
    reply = (req) =>
      req.method === 'GET'
        ? new Response(JSON.stringify({ model: source, layout: LAYOUT, drawings: DRAWINGS }))
        : undefined;
    await t.run((a) => a.duplicateDiagram());
    const copied = { ...source, id: 'docs/one-copy', name: 'docs/one-copy' };
    expect(requests).toEqual([
      { method: 'GET', url: '/api/diagrams/docs/one' },
      { method: 'POST', url: '/api/diagrams/docs/one-copy', body: copied },
      { method: 'POST', url: '/api/layouts/docs/one-copy', body: LAYOUT },
      { method: 'POST', url: '/api/drawings/docs/one-copy', body: DRAWINGS },
    ]);
    expect(t.now.boot.artifacts['docs/one-copy']).toEqual({
      name: 'docs/one-copy',
      model: copied,
      layout: LAYOUT,
      drawings: DRAWINGS,
      issues: [],
    });
    expect(t.now.boot.ownedNames.has('docs/one-copy')).toBe(true);
    expect(t.now.dl.selected).toBe('docs/one-copy');
    expect(t.resetView).toHaveBeenCalledTimes(1);
    expect(t.started).toEqual([['docs/one-copy', { model: copied, layout: LAYOUT, drawings: DRAWINGS }]]);
    expect(t.now.editing).toBe(true);
  });

  // Breaks if a read-only diagram stops being copied from its compiled model, or
  // a copy writes sidecars its source never had.
  it('copies a read-only diagram from its compiled model, writing no empty sidecars', async () => {
    const t = await mount();
    act(() => t.now.dl.selectDiagram('two'));
    await t.run((a) => a.duplicateDiagram());
    const copied = { ...model('two', ['z']), id: 'two-copy', name: 'two-copy' };
    expect(requests).toEqual([{ method: 'POST', url: '/api/diagrams/two-copy', body: copied }]);
    expect(t.started).toEqual([['two-copy', { model: copied, layout: emptyLayout(), drawings: emptyDrawings() }]]);
  });

  // Breaks if a failed source read or a refused write still opens a copy.
  it('reports a copy that failed and stays put', async () => {
    const t = await mount();
    reply = () => new Response('{}', { status: 500 });
    await t.run((a) => a.duplicateDiagram());
    expect(notify).toHaveBeenLastCalledWith("Could not copy 'docs/one'");
    expect(requests.map((r) => r.method)).toEqual(['GET']);

    reply = (req) => (req.method === 'GET' ? new Response(JSON.stringify({ model: model('docs/one') })) : undefined);
    reply = ((ok) => (req: Req) => (req.method === 'POST' ? new Response('{}', { status: 500 }) : ok(req)))(reply);
    await t.run((a) => a.duplicateDiagram());
    expect(notify).toHaveBeenLastCalledWith("Could not copy 'docs/one'");
    expect(t.now.dl.selected).toBe('docs/one');
    expect(t.started).toEqual([]);
  });
});

describe('useDiagramActions: Eject', () => {
  // Breaks if Eject can run in edit mode or without the user's consent.
  it('asks first, and never while editing', async () => {
    const editing = await mount({ editing: true });
    await editing.run((a) => a.ejectDiagram());
    expect(confirm).not.toHaveBeenCalled();

    const t = await mount();
    confirm.mockResolvedValueOnce(false);
    await t.run((a) => a.ejectDiagram());
    expect(requests).toEqual([]);
  });

  // Breaks if a refused eject still gives up ownership, or a done one keeps it
  // (the studio would offer to edit a diagram it no longer has a JSON source for).
  it('gives up ownership once the server has ejected, and keeps the selection', async () => {
    const t = await mount();
    reply = () => new Response('{}', { status: 500 });
    await t.run((a) => a.ejectDiagram());
    expect(notify).toHaveBeenCalledWith("Could not eject 'docs/one'");
    expect(t.now.boot.ownedNames.has('docs/one')).toBe(true);

    reply = () => undefined;
    await t.run((a) => a.ejectDiagram());
    expect(requests.at(-1)).toEqual({ method: 'POST', url: '/api/diagrams/docs/one/eject' });
    expect(t.now.boot.ownedNames.has('docs/one')).toBe(false);
    expect(t.now.dl.selected).toBe('docs/one');
  });
});
