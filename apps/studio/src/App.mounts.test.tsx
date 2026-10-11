// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { DiagramModel } from '@diagc/core/internal';
import type { DiagramView } from '@diagc/renderer';
import { App } from './App';

// What stays mounted while App re-renders around it. A remount leaves the markup
// and the render count as they were, so only a mount count sees it, and the
// local state it drops: the picker's search, a panel's typed draft, the canvas's
// own view. Each case names the change that would break it.

const mounts = vi.hoisted(() => {
  const counts: Record<string, number> = {};
  const props: Record<string, Record<string, unknown>> = {};
  // A pass-through that counts its mounts under `name` (or under what `keyOf`
  // reads from its props, for a component App renders twice).
  const recording = async (
    actual: Record<string, unknown>,
    name: string,
    keyOf: (p: Record<string, unknown>) => string = () => name,
  ) => {
    const { createElement, useEffect } = await import('react');
    const Real = actual[name] as (p: Record<string, unknown>) => ReactNode;
    const Recording = (p: Record<string, unknown>) => {
      const key = keyOf(p);
      props[key] = p;
      useEffect(() => {
        counts[key] = (counts[key] ?? 0) + 1;
      }, [key]);
      return createElement(Real, p);
    };
    return { ...actual, [name]: Recording };
  };
  return { counts, props, recording };
});
vi.mock('@diagc/renderer', async (o) => mounts.recording(await o(), 'DiagramView'));
vi.mock('./diagrams/DiagramPicker', async (o) => mounts.recording(await o(), 'DiagramPicker'));
vi.mock('./MenuButton', async (o) => mounts.recording(await o(), 'MenuButton'));
vi.mock('./canvas-editing/EditorToolbar', async (o) => mounts.recording(await o(), 'EditorToolbar'));
vi.mock('./dock/Dock', async (o) => mounts.recording(await o(), 'Dock', (p) => `Dock-${String(p['side'])}`));
vi.mock('./inspector/InspectorTabs', async (o) => mounts.recording(await o(), 'InspectorTabs'));
vi.mock('./inspector/NodePanel', async (o) => mounts.recording(await o(), 'NodePanel'));
vi.mock('./library/LibraryPanel', async (o) => mounts.recording(await o(), 'LibraryPanel'));
vi.mock('./layout/LayoutPanel', async (o) => mounts.recording(await o(), 'LayoutPanel'));
vi.mock('./view/LayersPlanesPanel', async (o) => mounts.recording(await o(), 'LayersPlanesPanel'));

const model: DiagramModel = {
  version: 1,
  id: 'sketch',
  name: 'sketch',
  nodes: [
    { id: 'a', name: 'a' },
    { id: 'b', name: 'b' },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [
    { id: 'p1', name: 'p1' },
    { id: 'p2', name: 'p2' },
  ],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  for (const k of Object.keys(mounts.counts)) delete mounts.counts[k];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const get = init?.method === undefined || init.method === 'GET';
      if (url === '/api/diagrams')
        return new Response(JSON.stringify({ diagrams: [{ name: 'sketch', model, issues: [], editable: true }] }));
      if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }));
      if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }));
      if (url === '/api/diagrams/sketch' && get) return new Response(JSON.stringify({ model }));
      return new Response(JSON.stringify({ ok: true }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountView = async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /layers & planes/i });
};
const view = () => mounts.props['DiagramView'] as unknown as Parameters<typeof DiagramView>[0];
// App re-renders on each of these, and nothing under it should mount again
const toggles = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Snap to grid' }));
  fireEvent.click(screen.getByRole('button', { name: /switch to (dark|light) theme/i }));
};
// …and on a plane switch, which also drops the selection
const churn = async () => {
  toggles();
  fireEvent.click(within(screen.getByRole('group', { name: 'Active plane' })).getByRole('button', { name: 'p2' }));
  await waitFor(() => expect(view().plane).toBe('p2'));
};
const ALWAYS = ['DiagramView', 'DiagramPicker', 'Dock-left', 'Dock-right', 'LayoutPanel', 'LayersPlanesPanel'];
const once = (names: string[]) => Object.fromEntries(names.map((n) => [n, 1]));

describe("what App's re-renders leave mounted", () => {
  it('the canvas, the picker, both docks and the right dock sections, through view mode, edit mode and back', async () => {
    // Breaks if a part App renders moves to a different slot or type between
    // renders or modes: the canvas would lose its viewport, a dock its width.
    await mountView();
    await churn();
    act(() => view().onSelect?.({ kind: 'node', id: 'a' }));
    expect(mounts.counts).toEqual(once([...ALWAYS, 'MenuButton']));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    await churn();
    expect(mounts.counts).toEqual(once([...ALWAYS, 'MenuButton', 'EditorToolbar', 'InspectorTabs', 'NodePanel']));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('button', { name: /^edit$/i });
    // the menu is a view-mode control: it went with Edit and came back with Done
    expect(mounts.counts).toEqual({
      ...once([...ALWAYS, 'EditorToolbar', 'InspectorTabs', 'NodePanel']),
      MenuButton: 2,
    });
  });

  it("keeps the picker's search open while App re-renders", async () => {
    // Breaks if the top bar remounts the picker on an unrelated render.
    await mountView();
    fireEvent.click(screen.getByRole('button', { name: 'Diagram: sketch' }));
    fireEvent.change(screen.getByLabelText('Search diagrams'), { target: { value: 'ske' } });
    fireEvent.click(screen.getByRole('button', { name: 'Snap to grid' }));
    expect((screen.getByLabelText('Search diagrams') as HTMLInputElement).value).toBe('ske');
  });

  it("keeps the node panel's typed draft while App re-renders", async () => {
    // Breaks if the left dock remounts the node panel on an unrelated render.
    await mountView();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    act(() => view().onSelect?.({ kind: 'node', id: 'a' }));
    fireEvent.change(await screen.findByLabelText('Technology'), { target: { value: 'draft-tech' } });
    toggles();
    expect(mounts.counts['NodePanel']).toBe(1);
    expect((screen.getByLabelText('Technology') as HTMLInputElement).value).toBe('draft-tech');
  });

  it("keeps the library's typed category name while App re-renders", async () => {
    // Breaks if the left dock remounts the library panel on an unrelated render.
    await mountView();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.change(await screen.findByLabelText('New category name'), { target: { value: 'draft-cat' } });
    toggles();
    expect(mounts.counts['LibraryPanel']).toBe(1);
    expect((screen.getByLabelText('New category name') as HTMLInputElement).value).toBe('draft-cat');
  });

  it("keeps the layers panel's typed layer name while App re-renders", async () => {
    // Breaks if the right dock remounts Layers & planes on an unrelated render.
    await mountView();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    fireEvent.change(screen.getByLabelText('New layer name'), { target: { value: 'draft-layer' } });
    await churn();
    expect(mounts.counts['LayersPlanesPanel']).toBe(1);
    expect((screen.getByLabelText('New layer name') as HTMLInputElement).value).toBe('draft-layer');
  });
});
