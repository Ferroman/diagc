// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { layoutPlaneKey, type DiagramModel, type DiagramNode, type DiagramRelation } from '@diagc/core/internal';
import { PLAN_LAYOUT, todayIso, type DiagramView } from '@diagc/renderer';
import { App } from './App';

// What each notation adds to the studio, pinned through App itself: the panel
// it docks, the gestures it takes over, the kind a connect draws, the threat
// controls and the loop analysis. Each case names the change that would break it.

// The props App last passed DiagramView: the edit callbacks are what the canvas
// would call, and a drag or a connect is a React Flow gesture jsdom cannot drive.
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

// The props App last passed each notation panel, recorded by a pass-through
// wrapper, so a case can read the plane a panel was given and call its callbacks.
const panels = vi.hoisted(() => {
  const props: Record<string, Record<string, unknown>> = {};
  // how often each panel mounted: a remount leaves the markup and the render
  // count as they were, so only this sees it (and the panel state it drops)
  const mounts: Record<string, number> = {};
  const recording = async (actual: Record<string, unknown>, name: string) => {
    const { createElement, useEffect } = await import('react');
    const Real = actual[name] as (p: Record<string, unknown>) => ReactNode;
    const Recording = (p: Record<string, unknown>) => {
      props[name] = p;
      useEffect(() => {
        mounts[name] = (mounts[name] ?? 0) + 1;
      }, []);
      return createElement(Real, p);
    };
    return { ...actual, [name]: Recording };
  };
  return { props, mounts, recording };
});
vi.mock('./notations/git-graph/GitPanel', async (o) => panels.recording(await o(), 'GitPanel'));
vi.mock('./notations/plan/PlanPanel', async (o) => panels.recording(await o(), 'PlanPanel'));
vi.mock('./notations/second-order/SecondOrderPanel', async (o) => panels.recording(await o(), 'SecondOrderPanel'));
vi.mock('./notations/fishbone/FishbonePanel', async (o) => panels.recording(await o(), 'FishbonePanel'));
vi.mock('./notations/threat-model/ThreatModelPanel', async (o) => panels.recording(await o(), 'ThreatModelPanel'));

const diagram = (notation: string | undefined, rest: Partial<DiagramModel> = {}): DiagramModel => ({
  version: 1,
  id: 'sketch',
  name: 'sketch',
  ...(notation !== undefined ? { notation } : {}),
  nodes: [
    { id: 'a', name: 'a' },
    { id: 'b', name: 'b' },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
  ...rest,
});

/** serve `model` as the one editable diagram; every write succeeds */
const serve = (model: DiagramModel) =>
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

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  viewCapture.props = null;
  for (const k of Object.keys(panels.props)) delete panels.props[k];
  for (const k of Object.keys(panels.mounts)) delete panels.mounts[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountView = async (model: DiagramModel) => {
  serve(model);
  render(<App />);
  await screen.findByRole('heading', { name: /layers & planes/i });
};
const mountEdit = async (model: DiagramModel) => {
  await mountView(model);
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
  // Done is the toolbar edit mode alone draws: the session has landed
  await screen.findByRole('button', { name: 'Done' });
};

/** the right dock's section titles, top to bottom */
const rightDock = () =>
  [...document.querySelectorAll('.dock-right .dock-section-title button')].map((b) =>
    (b.textContent ?? '').replace(/^[▸▾]/, '').trim(),
  );
const CHROME = ['Layout & style', 'Layers & planes'];

const edit = () => {
  const api = viewCapture.props?.edit;
  if (api === undefined) throw new Error('DiagramView has no edit callbacks: not in edit mode');
  return api;
};
const live = () => viewCapture.props!.model;
const nodeOf = (id: string): DiagramNode | undefined => live().nodes.find((n) => n.id === id);
const relationsOf = (): DiagramRelation[] => live().relations;
const undoArmed = () => !(screen.getByRole('button', { name: /^undo$/i }) as HTMLButtonElement).disabled;

describe('the right dock per notation', () => {
  // Breaks if a notation's panel loses or changes its mode gate, if a panel
  // moves below Layout & style, or if a notation gains a panel it has not got.
  const cases: [string | undefined, string[], string[]][] = [
    ['git-graph', [], ['Git']],
    ['plan', [], ['Plan']],
    ['second-order', [], ['And then what?']],
    ['fishbone', [], ['Fishbone']],
    ['threat-model', ['Threat model'], ['Threat model']],
    ['causal-loop', [], []],
    ['c4', [], []],
    ['deployment', [], []],
    [undefined, [], []],
  ];
  it.each(cases)('%s: view %j, edit %j', async (notation, view, editing) => {
    await mountView(diagram(notation));
    expect(rightDock()).toEqual([...view, ...CHROME]);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    expect(rightDock()).toEqual([...editing, ...CHROME]);
  });

  it('docks Activity on any notation while editing, after the notation panel', async () => {
    // Breaks if Activity is gated on a notation, shown in view mode, or put
    // ahead of the notation's own panel.
    const frame: Partial<DiagramModel> = {
      nodes: [
        { id: 'f', name: 'Flow', type: 'activity-frame' },
        { id: 'l', name: 'Lane', type: 'activity-lane' },
      ],
      containment: [{ parent: 'f', child: 'l' }],
    };
    await mountView(diagram('threat-model', frame));
    expect(rightDock()).toEqual(['Threat model', ...CHROME]);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    expect(rightDock()).toEqual(['Threat model', 'Activity', ...CHROME]);
  });
});

describe("a notation panel's mount", () => {
  it('the threat model panel stays mounted from view mode into edit mode and back', async () => {
    // Breaks if the dock puts the notation's panel in a different slot (or
    // under a different key) in edit mode than in view mode.
    await mountView(diagram('threat-model'));
    expect(panels.mounts['ThreatModelPanel']).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    expect(rightDock()).toEqual(['Threat model', ...CHROME]);
    expect(panels.mounts['ThreatModelPanel']).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('button', { name: /^edit$/i });
    expect(panels.mounts['ThreatModelPanel']).toBe(1);
  });

  it('the plan panel keeps a typed draft across a switch between two plan planes', async () => {
    // Breaks if the dock keys or wraps the notation's panel by plane, which
    // would remount it and drop what was typed.
    const planes = [
      { id: 'p1', name: 'p1', notation: 'plan' },
      { id: 'p2', name: 'p2', notation: 'plan' },
    ];
    await mountEdit(diagram(undefined, { planes }));
    const showPlane = async (name: string) => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Active plane' })).getByRole('button', { name }));
      await waitFor(() => expect(viewCapture.props?.plane).toBe(name));
    };
    const draft = () => within(screen.getByRole('complementary', { name: 'Plan' })).getAllByRole('textbox')[0]!;
    await showPlane('p1');
    expect(panels.mounts['PlanPanel']).toBe(1);
    fireEvent.change(draft(), { target: { value: 'draft-person' } });
    await showPlane('p2');
    expect(panels.mounts['PlanPanel']).toBe(1);
    expect((draft() as HTMLInputElement).value).toBe('draft-person');
  });
});

describe('the props each notation panel gets', () => {
  // A plane of each panel's notation, and one that borrows its containment.
  const pairs = [
    ['git', 'git-graph', 'GitPanel'],
    ['plan', 'plan', 'PlanPanel'],
    ['so', 'second-order', 'SecondOrderPanel'],
    ['fb', 'fishbone', 'FishbonePanel'],
    ['tm', 'threat-model', 'ThreatModelPanel'],
  ] as const;
  const planes = pairs.flatMap(([id, notation]) => [
    { id, name: id, notation },
    { id: `${id}-b`, name: `${id}-b`, notation, containmentOf: id },
  ]);
  const showPlane = async (name: string) => {
    fireEvent.click(within(screen.getByRole('group', { name: 'Active plane' })).getByRole('button', { name }));
    await waitFor(() => expect(viewCapture.props?.plane).toBe(name));
  };

  it('gives Git, Plan and Threat model the plane on screen, Second-order and Fishbone none on a borrowing plane', async () => {
    // Breaks if a panel's `plane` flips between the view plane and the scope
    // plane: Second-order and Fishbone tag the nodes they add with it, and a
    // borrowing plane's own id would hide them.
    await mountEdit(diagram(undefined, { planes }));
    const want: Record<string, string | undefined> = {
      git: 'git',
      'git-b': 'git-b',
      plan: 'plan',
      'plan-b': 'plan-b',
      so: 'so',
      'so-b': undefined,
      fb: 'fb',
      'fb-b': undefined,
      tm: 'tm',
      'tm-b': 'tm-b',
    };
    for (const [id, , panel] of pairs) {
      for (const plane of [id, `${id}-b`]) {
        await showPlane(plane);
        expect(panels.props[panel]?.['plane'], `${panel} on ${plane}`).toBe(want[plane]);
      }
    }
  });

  it('passes each panel the props it takes today', async () => {
    // Breaks if a dock entry drops or adds a prop: the panels keep theirs.
    await mountEdit(diagram(undefined, { planes }));
    const keys: Record<string, string[]> = {
      GitPanel: ['model', 'onCommand', 'onSelect', 'plane', 'selection'],
      PlanPanel: ['model', 'onCommand', 'onSelect', 'plane', 'selection', 'today'],
      SecondOrderPanel: ['model', 'onCommand', 'onCreated', 'onSelect', 'plane', 'selection'],
      FishbonePanel: ['model', 'onCommand', 'onCreated', 'onSelect', 'plane', 'selection'],
      ThreatModelPanel: ['model', 'onSelect', 'plane'],
    };
    for (const [id, , panel] of pairs) {
      await showPlane(id);
      expect(Object.keys(panels.props[panel] ?? {}).sort(), panel).toEqual(keys[panel]);
    }
    expect(panels.props['PlanPanel']?.['today']).toBe(todayIso());
  });

  it("selects a node from a panel's id, the threat model's from a whole selection", async () => {
    // Breaks if ThreatModelPanel's onSelect is wrapped like its siblings', or
    // theirs is passed `select` itself.
    await mountEdit(diagram(undefined, { planes }));
    const nameField = () => screen.queryByLabelText('Name') as HTMLTextAreaElement | null;
    await showPlane('git');
    act(() => (panels.props['GitPanel']!['onSelect'] as (id: string) => void)('a'));
    await waitFor(() => expect(nameField()?.value).toBe('a'));
    await showPlane('tm');
    act(() => (panels.props['ThreatModelPanel']!['onSelect'] as (s: unknown) => void)({ kind: 'node', id: 'b' }));
    await waitFor(() => expect(nameField()?.value).toBe('b'));
  });

  it('opens a node Second-order or Fishbone created for naming on the canvas', async () => {
    // Breaks if onCreated stops being the canvas label-edit request.
    await mountEdit(diagram(undefined, { planes }));
    await showPlane('so');
    act(() => (panels.props['SecondOrderPanel']!['onCreated'] as (id: string) => void)('a'));
    expect(edit().editLabelRequest).toEqual({ id: 'a', nonce: 1 });
    await showPlane('fb');
    act(() => (panels.props['FishbonePanel']!['onCreated'] as (id: string) => void)('b'));
    expect(edit().editLabelRequest).toEqual({ id: 'b', nonce: 2 });
  });
});

describe('the loop analysis', () => {
  const cld = (notation: string | undefined) =>
    diagram(notation, { relations: [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'sync', polarity: '+' }] });

  it('docks Leverage on the left in view mode on a causal loop only', async () => {
    // Breaks if the loop analysis is offered off causal-loop, or wins over the
    // inspector while editing.
    await mountView(cld('causal-loop'));
    act(() => viewCapture.props!.onSelect?.({ kind: 'node', id: 'a' }));
    expect(await screen.findByRole('complementary', { name: 'Leverage' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByRole('button', { name: 'Done' });
    act(() => viewCapture.props!.onSelect?.({ kind: 'node', id: 'a' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Leverage' })).toBeNull());
  });

  it('offers no Leverage off a causal loop', async () => {
    await mountView(cld('c4'));
    act(() => viewCapture.props!.onSelect?.({ kind: 'node', id: 'a' }));
    await waitFor(() => expect(document.querySelector('.dock-left .sidebar')).not.toBeNull());
    expect(screen.queryByRole('complementary', { name: 'Leverage' })).toBeNull();
  });

  it.each([
    ['causal-loop', { nodes: ['a', 'b'], edges: [] }],
    ['c4', null],
  ] as const)('a ctrl-click compares on %s: %j', async (notation, highlight) => {
    // Breaks if compareSelect's gate moves to another notation or goes.
    await mountView(cld(notation));
    act(() => viewCapture.props!.onSelect?.({ kind: 'node', id: 'a' }));
    act(() => viewCapture.props!.onCompareSelect?.('b'));
    await waitFor(() => expect(viewCapture.props!.externalHighlight).toEqual(highlight));
  });
});

describe("the plan's gestures", () => {
  const { DAY } = PLAN_LAYOUT;
  const nodes: DiagramNode[] = [
    { id: 'z', name: 'Zone', type: 'plan-zone', metadata: { start: '2026-01-05', end: '2026-01-09' } },
    { id: 'p', name: 'Pat', type: 'person' },
    { id: 'b', name: 'Box' },
  ];
  const planned = (notation: string | undefined, rest: Partial<DiagramModel> = {}) =>
    diagram(notation, { nodes, ...rest });
  const savedPositions = () => viewCapture.props!.layout?.planes[layoutPlaneKey(live(), undefined)] ?? {};

  it('a plan reads a zone move as days, and keeps the layout out of it', async () => {
    // Breaks if onNodesMoved stops asking the plan first.
    await mountEdit(planned('plan'));
    act(() => edit().onNodesMoved?.({ z: { x: 0, y: 0 } }, { z: { dx: DAY * 2, dy: 0 } }));
    await waitFor(() => expect(nodeOf('z')?.metadata).toEqual({ start: '2026-01-07', end: '2026-01-11' }));
  });

  it('a plan consumes a move it has no answer for; elsewhere the move is saved', async () => {
    // Breaks if a move the plan declines (an actor) falls through to set-positions.
    await mountEdit(planned('plan'));
    act(() => edit().onNodesMoved?.({ p: { x: 5, y: 5 } }, { p: { dx: 5, dy: 5 } }));
    expect(undoArmed()).toBe(false);
    expect(savedPositions()['p']).toBeUndefined();
  });

  it('off a plan the same moves are positions, and the dates stay', async () => {
    await mountEdit(planned(undefined));
    act(() => edit().onNodesMoved?.({ z: { x: 30, y: 40 } }, { z: { dx: DAY * 2, dy: 0 } }));
    await waitFor(() => expect(savedPositions()['z']).toEqual({ x: 30, y: 40 }));
    expect(nodeOf('z')?.metadata).toEqual({ start: '2026-01-05', end: '2026-01-09' });
  });

  it('a drop into a zone assigns a role on a plan, and does nothing elsewhere', async () => {
    // Breaks if onDropInto loses its plan gate, or the plan its drop rule.
    await mountEdit(planned('plan'));
    act(() => edit().onDropInto?.('p', 'z', { x: 4, y: 4 }));
    await waitFor(() => expect(relationsOf().map((r) => [r.from, r.to, r.kind])).toEqual([['p', 'z', 'executes']]));
  });

  it('off a plan a drop into a zone does nothing', async () => {
    await mountEdit(planned('c4'));
    act(() => edit().onDropInto?.('p', 'z', { x: 4, y: 4 }));
    expect(undoArmed()).toBe(false);
    expect(relationsOf()).toEqual([]);
  });

  it('a plan resizes a zone as dates and declines anything else to the generic resize', async () => {
    // Breaks if the plan resize claims a node that is not a zone, or a zone's
    // resize saves a size.
    await mountEdit(planned('plan'));
    act(() => edit().onResize?.('z', DAY * 9, 40, { x: 0, y: 0 }));
    await waitFor(() => expect(nodeOf('z')?.metadata).not.toEqual({ start: '2026-01-05', end: '2026-01-09' }));
    expect(viewCapture.props!.layout?.sizes?.['z']).toBeUndefined();
    act(() => edit().onResize?.('b', 200, 80, { x: 10, y: 20 }));
    await waitFor(() => expect(viewCapture.props!.layout?.sizes?.['b']).toEqual({ w: 200, h: 80 }));
    expect(savedPositions()['b']).toEqual({ x: 10, y: 20 });
  });

  it('off a plan a zone resizes like any box', async () => {
    await mountEdit(planned(undefined));
    act(() => edit().onResize?.('z', 200, 80, { x: 10, y: 20 }));
    await waitFor(() => expect(viewCapture.props!.layout?.sizes?.['z']).toEqual({ w: 200, h: 80 }));
    expect(nodeOf('z')?.metadata).toEqual({ start: '2026-01-05', end: '2026-01-09' });
  });

  it('a role chip changes the role whatever the notation', async () => {
    // Breaks if onSetRole gains a plan gate: only a plan draws the chip, so
    // the callback itself asks nothing.
    await mountEdit(planned(undefined, { relations: [{ id: 'p->z#0', from: 'p', to: 'z', kind: 'executes' }] }));
    act(() => edit().onSetRole?.('z', 'p', 'owns'));
    await waitFor(() => expect(relationsOf().map((r) => r.kind)).toEqual(['owns']));
  });
});

describe('the kind a connect draws', () => {
  const tm = (notation: string | undefined) =>
    diagram(notation, {
      nodes: [
        { id: 'web', name: 'Web', type: 'tm-process' },
        { id: 'db', name: 'DB', type: 'tm-store' },
        { id: 'dmz', name: 'DMZ', type: 'tm-boundary' },
        {
          id: 't1',
          name: 'Orders',
          type: 'db-table',
          columns: [{ name: 'id', pk: true }, { name: 'customer' }],
        },
        { id: 't2', name: 'Customers', type: 'db-table', columns: [{ name: 'id', pk: true }] },
      ],
    });
  const kindOf = (from: string, to: string) => relationsOf().find((r) => r.from === from && r.to === to)?.kind;

  it('a threat model draws a data flow, and sync when a boundary is an end', async () => {
    // Breaks if connectKind is no longer the threat model's.
    await mountEdit(tm('threat-model'));
    act(() => edit().onConnect?.('web', 'db'));
    act(() => edit().onConnect?.('dmz', 'db'));
    await waitFor(() => expect([kindOf('web', 'db'), kindOf('dmz', 'db')]).toEqual(['data-flow', 'sync']));
  });

  it.each(['causal-loop', 'plan', undefined])('%s draws sync', async (notation) => {
    // Breaks if another notation gains a connect kind.
    await mountEdit(tm(notation));
    act(() => edit().onConnect?.('web', 'db'));
    await waitFor(() => expect(kindOf('web', 'db')).toBe('sync'));
  });

  it("a table column's handle draws a foreign key before the notation is asked", async () => {
    // Breaks if connectKind is consulted before fkConnectionCommands.
    await mountEdit(tm('threat-model'));
    act(() => edit().onConnect?.('t1', 't2', 'customer'));
    await waitFor(() => expect(kindOf('t1', 't2')).toBe('fk'));
  });
});

describe('the threat controls', () => {
  // `O` toggles every threat note: the action has no default key.
  const bindNotes = () => localStorage.setItem('diagc.hotkeys', JSON.stringify({ 'edit.toggle-notes': ['O'] }));
  const notesChip = () => screen.queryByRole('button', { name: 'Notes' }) as HTMLButtonElement | null;
  const threatened: Partial<DiagramModel> = {
    nodes: [
      { id: 'a', name: 'a', threats: [{ id: 't1', category: 'S', title: 'Spoofed' }] },
      { id: 'b', name: 'b' },
    ],
  };

  it('a threat model offers the Notes chip before any threat exists, disarmed, and the key does nothing', async () => {
    // Breaks if the chip stops being offered on the notation, or the key on
    // an empty register dispatches.
    bindNotes();
    await mountEdit(diagram('threat-model'));
    expect(notesChip()?.disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'o' });
    expect(undoArmed()).toBe(false);
  });

  it('elsewhere no chip and no key until an element carries a threat', async () => {
    // Breaks if the chip or the key are offered on a notation without threats.
    bindNotes();
    await mountEdit(diagram('c4'));
    expect(notesChip()).toBeNull();
    fireEvent.keyDown(window, { key: 'o' });
    expect(undoArmed()).toBe(false);
  });

  it.each(['c4', 'threat-model'])('%s with a threat: the chip is armed and the key opens every note', async (n) => {
    // Breaks if threats are offered on the notation alone, stranding an
    // element's threats when the notation changes.
    bindNotes();
    await mountEdit(diagram(n, threatened));
    expect(notesChip()?.disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'o' });
    await waitFor(() => expect(notesChip()?.getAttribute('aria-pressed')).toBe('true'));
  });
});
