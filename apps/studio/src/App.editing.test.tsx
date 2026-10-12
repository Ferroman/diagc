// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, DiagramRelation, LayoutOverlay } from '@diagc/core/internal';
import type { DiagramView } from '@diagc/renderer';
import { App } from './App';

// What App does with the canvas's edit callbacks and the view-mode layout chips,
// pinned through App itself: a fixed side, a reconnect, a canvas delete, the pen
// and the eraser, a connect on a sheet, Save positions and Auto-arrange. Each case
// names the change that would break it.

// The props App last passed DiagramView: a drag, a connect or a stroke is a React
// Flow gesture jsdom cannot drive, so the cases call what the canvas would.
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

const diagram = (rest: Partial<DiagramModel> = {}): DiagramModel => ({
  version: 1,
  id: 'sketch',
  name: 'sketch',
  nodes: [
    { id: 'a', name: 'a' },
    { id: 'b', name: 'b' },
    { id: 'c', name: 'c' },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
  ...rest,
});

/** serve `model` (and `layout`) as the one editable diagram; every write succeeds */
const serve = (model: DiagramModel, layout?: LayoutOverlay) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const get = init?.method === undefined || init.method === 'GET';
      if (url === '/api/diagrams')
        return new Response(JSON.stringify({ diagrams: [{ name: 'sketch', model, issues: [], editable: true }] }));
      if (url === '/api/layouts')
        return new Response(JSON.stringify({ layouts: layout !== undefined ? { sketch: layout } : {} }));
      if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }));
      if (url === '/api/diagrams/sketch' && get)
        return new Response(JSON.stringify({ model, ...(layout !== undefined ? { layout } : {}) }));
      return new Response(JSON.stringify({ ok: true }));
    }),
  );

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  viewCapture.props = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountView = async (model: DiagramModel, layout?: LayoutOverlay) => {
  serve(model, layout);
  render(<App />);
  await screen.findByRole('heading', { name: /layers & planes/i });
};
const mountEdit = async (model: DiagramModel, layout?: LayoutOverlay) => {
  await mountView(model, layout);
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
  // Done is the toolbar edit mode alone draws: the session has landed
  await screen.findByRole('button', { name: 'Done' });
};

const edit = () => {
  const api = viewCapture.props?.edit;
  if (api === undefined) throw new Error('DiagramView has no edit callbacks: not in edit mode');
  return api;
};
const live = () => viewCapture.props!.model;
const relation = (id: string): DiagramRelation | undefined => live().relations.find((r) => r.id === id);
const undoButton = () => screen.getByRole('button', { name: /^undo$/i }) as HTMLButtonElement;
const nameField = () => screen.queryByLabelText('Name') as HTMLTextAreaElement | null;
const showPlane = async (name: string) => {
  fireEvent.click(within(screen.getByRole('group', { name: 'Active plane' })).getByRole('button', { name }));
  await waitFor(() => expect(viewCapture.props?.plane).toBe(name));
};

/** the posts App made to `prefix`, oldest first, bodies parsed */
const posts = (prefix: string) =>
  (fetch as ReturnType<typeof vi.fn>).mock.calls
    .filter(([url, init]) => String(url).startsWith(prefix) && (init as RequestInit | undefined)?.method === 'POST')
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) as unknown }));

const AB = 'a->b#0';
const ab = (rest: Partial<DiagramRelation> = {}): DiagramRelation => ({
  id: AB,
  from: 'a',
  to: 'b',
  kind: 'sync',
  ...rest,
});

describe('the ends of a relation', () => {
  it('a fixed side merges into the style the relation has, and clearing it leaves the rest', async () => {
    // Breaks if onSetEdgeSide replaces the style instead of merging into it, or
    // keeps a cleared side as a key.
    await mountEdit(diagram({ relations: [ab({ style: { color: 'red' } })] }));
    act(() => edit().onSetEdgeSide?.(AB, 'from', 'left'));
    await waitFor(() => expect(relation(AB)?.style).toEqual({ color: 'red', fromSide: 'left' }));
    act(() => edit().onSetEdgeSide?.(AB, 'from', null));
    await waitFor(() => expect(relation(AB)?.style).toEqual({ color: 'red' }));
  });

  it('clearing the only fixed side drops the style altogether', async () => {
    // Breaks if an emptied style is written as `{}` rather than removed.
    await mountEdit(diagram({ relations: [ab({ style: { toSide: 'top' } })] }));
    act(() => edit().onSetEdgeSide?.(AB, 'to', null));
    await waitFor(() => expect(relation(AB)?.style).toBeUndefined());
  });

  it('a reconnect moves the ends, and fixes the dragged end only when the drag says so', async () => {
    // Breaks if onReconnect writes a style on a plain reconnect, or fixes a side
    // without merging it into the relation's style.
    await mountEdit(diagram({ relations: [ab({ style: { color: 'red' } })] }));
    act(() => edit().onReconnect?.(AB, 'a', 'c'));
    await waitFor(() => expect([relation(AB)?.from, relation(AB)?.to]).toEqual(['a', 'c']));
    expect(relation(AB)?.style).toEqual({ color: 'red' });
    act(() => edit().onReconnect?.(AB, 'a', 'c', { end: 'to', side: 'right' }));
    await waitFor(() => expect(relation(AB)?.style).toEqual({ color: 'red', toSide: 'right' }));
  });
});

describe('a canvas delete', () => {
  it('removes the selection as one undo step and closes the panel it showed', async () => {
    // Breaks if onDeleteSelection stops batching, or leaves the deleted node
    // selected: undo would then bring its panel back.
    await mountEdit(diagram({ relations: [ab()] }));
    act(() => viewCapture.props!.onSelect?.({ kind: 'node', id: 'b' }));
    await waitFor(() => expect(nameField()?.value).toBe('b'));
    act(() => edit().onDeleteSelection?.({ nodeIds: ['b'], relationIds: [AB] }));
    await waitFor(() => expect(live().nodes.map((n) => n.id)).toEqual(['a', 'c']));
    expect(live().relations).toEqual([]);
    expect(nameField()).toBeNull();
    fireEvent.click(undoButton());
    await waitFor(() => expect(live().nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']));
    expect(live().relations.map((r) => r.id)).toEqual([AB]);
    expect(nameField()).toBeNull();
  });

  it('a selection that is already gone dispatches nothing and keeps the panel', async () => {
    // Breaks if onDeleteSelection clears the selection when there was nothing to delete.
    await mountEdit(diagram());
    act(() => viewCapture.props!.onSelect?.({ kind: 'node', id: 'a' }));
    await waitFor(() => expect(nameField()?.value).toBe('a'));
    act(() => edit().onDeleteSelection?.({ nodeIds: ['gone'], relationIds: [] }));
    expect(undoButton().disabled).toBe(true);
    expect(nameField()?.value).toBe('a');
  });
});

describe('the pen and the eraser', () => {
  const planes = [
    { id: 'p1', name: 'p1' },
    { id: 'p2', name: 'p2' },
  ];

  it('two strokes in one tick get two ids on the plane on screen, and the eraser takes one', async () => {
    // Breaks if onAddStroke reads the render-bound drawings (the second stroke
    // would repeat the first's id), or files strokes under another plane.
    await mountEdit(diagram({ planes, containment: [{ parent: 'a', child: 'b', plane: 'p2' }] }));
    await showPlane('p2');
    act(() => {
      edit().onAddStroke?.({ points: [0, 0, 10, 10], width: 3 });
      edit().onAddStroke?.({ points: [5, 5, 20, 20], width: 3 });
    });
    await waitFor(() => expect(viewCapture.props!.drawings?.planes['p2']?.map((s) => s.id)).toEqual(['k1', 'k2']));
    expect(viewCapture.props!.drawings?.planes['p1']).toBeUndefined();
    act(() => edit().onDeleteStroke?.('k1'));
    await waitFor(() => expect(viewCapture.props!.drawings?.planes['p2']?.map((s) => s.id)).toEqual(['k2']));
  });
});

describe('a connect', () => {
  it('lands on the sheet being drawn on', async () => {
    // Breaks if onConnect stops passing the pen's layer.
    await mountEdit(diagram({ layers: [{ id: 'ink', name: 'ink' }] }));
    fireEvent.click(screen.getByRole('radio', { name: 'Draw on ink' }));
    act(() => edit().onConnect?.('a', 'b'));
    await waitFor(() => expect(relation(AB)?.layer).toBe('ink'));
  });
});

describe('the view-mode layout chips', () => {
  const saved: LayoutOverlay = { version: 1, planes: { default: { a: { x: 10, y: 20 } } } };
  const autoArrange = () => screen.queryByRole('button', { name: 'Auto-arrange' });

  it('Save positions posts the boxes moved by hand into the layout file, then clears', async () => {
    // Breaks if the chip stops reading the renderer's moves, or posts anything
    // but the saved overlay with the moves folded in.
    await mountView(diagram(), saved);
    expect(screen.queryByRole('button', { name: /save positions/i })).toBeNull();
    act(() => viewCapture.props!.onViewPositionsChange?.({ b: { x: 40, y: 50 } }));
    fireEvent.click(await screen.findByRole('button', { name: /save positions/i }));
    await waitFor(() => expect(posts('/api/layouts/')).toHaveLength(1));
    const [post] = posts('/api/layouts/');
    expect(post?.url).toBe('/api/layouts/sketch');
    expect((post?.body as LayoutOverlay).planes['default']).toEqual({ a: { x: 10, y: 20 }, b: { x: 40, y: 50 } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /save positions/i })).toBeNull());
  });

  it('Auto-arrange is offered where the plane has saved positions, and sets them aside while pressed', async () => {
    // Breaks if the chip loses its saved-positions gate, stops driving
    // ignoreSavedPositions, or writes anything.
    await mountView(diagram(), saved);
    expect(autoArrange()?.getAttribute('aria-pressed')).toBe('false');
    expect(viewCapture.props!.ignoreSavedPositions).toBe(false);
    fireEvent.click(autoArrange()!);
    await waitFor(() => expect(autoArrange()?.getAttribute('aria-pressed')).toBe('true'));
    expect(viewCapture.props!.ignoreSavedPositions).toBe(true);
    expect(posts('/api/layouts/')).toEqual([]);
  });

  it('Auto-arrange is not offered without saved positions, nor while editing', async () => {
    // Breaks if the chip shows with nothing to set aside, or in edit mode.
    await mountView(diagram());
    expect(autoArrange()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    expect(autoArrange()).toBeNull();
  });

  it('Auto-arrange is not offered in edit mode where the plane has saved positions', async () => {
    // Breaks if the chip loses its view-mode gate.
    await mountEdit(diagram(), saved);
    expect(autoArrange()).toBeNull();
  });
});
