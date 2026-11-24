// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dayOf,
  emptyDrawings,
  layoutPlaneKey,
  model,
  planCopyId,
  spanOf,
  type LayoutOverlay,
} from '@diagc/core/internal';
import { DiagramView, LIBRARY_ENTRY_DND_TYPE, type LayoutApi } from '@diagc/renderer';
import { dispatch as reduce, startSession, type EditorSession } from '../session/reducer';
import type { EditorApi } from '../session/useEditor';
import { studioNotation } from '../notations';
import { relayoutPlane } from '../layout/LayoutActions';
import type { LibraryEntry } from '../library/types';
import { placeLibraryEntry } from './libraryPlacement';
import { nodeGestureHandlers, planeLayoutHandlers, quickAddHandlers, type EditContext } from './canvasEditHandlers';

// Grouping a plan by team, and hiding teams or people, is view state: what the
// studio saves from the canvas while either is on must leave every zone's
// saved row exactly as it was, and must name model nodes only — never a lane
// copy, a lane header or the Unassigned card. Every path that saves from the
// canvas runs here against a real canvas: a drag (as arrow keys, the same
// commit), freezing the layout, re-laying it out, a quick-added sibling and a
// card dropped from the Library.

/** `checkout` is in both teams' lanes and has a saved row; `other` and `loose`
 * have none, and `loose` has no executor (Unassigned) */
function sharedPlan() {
  const m = model('shared');
  const p = m.plan();
  const pay = p.team('pay', 'Payments');
  const plat = p.team('plat', 'Platform');
  const checkout = p.zone('checkout', { name: 'Checkout', start: '2026-01-05', end: '2026-02-27' });
  checkout.zone('api', { name: 'API', start: '2026-01-05', end: '2026-01-30' }).executor(pay);
  checkout.zone('ui', { name: 'UI', start: '2026-02-02', end: '2026-02-20' }).executor(plat);
  p.zone('other', { name: 'Other', start: '2026-03-02', end: '2026-03-13' }).executor(plat);
  p.zone('loose', { name: 'Loose', start: '2026-03-16', end: '2026-03-27' });
  return m.toJSON();
}

/** the two views that draw rows somewhere that is not their own saved place */
const VIEWS = [
  { name: 'grouped', grouped: true, hidden: [] as string[] },
  { name: 'ungrouped with a team hidden', grouped: false, hidden: ['pay'] },
] as const;

const zoneCard: LibraryEntry = { id: 'zone', category: 'plan', name: 'Zone', template: { type: 'plan-zone' } };

function setup(view: (typeof VIEWS)[number]) {
  const m = sharedPlan();
  const key = layoutPlaneKey(m, 'plan');
  const layout: LayoutOverlay = { version: 1, planes: { [key]: { checkout: { x: 80, y: 260 } } } };
  let live: EditorSession = startSession('m', { model: m, layout, drawings: emptyDrawings() });
  const editor = {
    // read live: a second add must see the first one's id
    get session() {
      return live;
    },
    peek: () => live,
    dispatch: (c: Parameters<EditorApi['dispatch']>[0]) => {
      live = reduce(live, c);
    },
  } as unknown as EditorApi;
  const layoutApiRef: { current: LayoutApi | null } = { current: null };
  const ctx: EditContext = {
    editor,
    editing: true,
    model: m,
    layout,
    activePlane: 'plan',
    planeOpt: { plane: 'plan' },
    activePlaneBorrowsContainment: false,
    activePlaneManual: false,
    penLayer: null,
    notation: 'plan',
    profile: studioNotation('plan'),
    layoutApiRef,
    select: vi.fn(),
    selectNode: vi.fn(),
    requestLabelEdit: vi.fn(),
    requestThreatEdit: vi.fn(),
    groupSel: [],
  };
  const onDropLibraryEntry = (_entry: string, position: { x: number; y: number }, parentId?: string) =>
    placeLibraryEntry(
      {
        editor,
        layoutApiRef,
        activePlane: 'plan',
        activePlaneBorrowsContainment: false,
        penLayer: null,
        selection: null,
        drillRoot: undefined,
        notation: 'plan',
        today: '2026-01-01',
        selectNode: vi.fn(),
        requestLabelEdit: vi.fn(),
      },
      zoneCard,
      { position, ...(parentId !== undefined ? { parentId } : {}) },
    );
  const { container } = render(
    <DiagramView
      model={m}
      layout={layout}
      plane="plan"
      notation="plan"
      mode="edit"
      edit={{ ...nodeGestureHandlers(ctx), onDropLibraryEntry }}
      grouped={view.grouped}
      hiddenActors={view.hidden}
      layoutApiRef={layoutApiRef}
    />,
  );
  const saved = () => live.state.layout.planes[key] ?? {};
  const nodes = () => live.state.model.nodes;
  /** every id the plane's saved layout names is a node of the model */
  const onlyModelIds = () => {
    const ids = new Set(nodes().map((n) => n.id));
    expect(Object.keys(saved()).filter((id) => !ids.has(id))).toEqual([]);
  };
  /** checkout keeps its saved row; `other` and `loose` still have none */
  const rowsKept = () => {
    expect(saved()['checkout']).toEqual({ x: 80, y: 260 });
    expect(saved()['other']).toBeUndefined();
    expect(saved()['loose']).toBeUndefined();
  };
  const containment = () => live.state.model.containment;
  return { ctx, container, saved, nodes, containment, onlyModelIds, rowsKept, layoutApiRef };
}

const drawn = () => screen.findAllByText('Other');

afterEach(() => {
  // the drop stubs this, which jsdom has no layout for
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  vi.restoreAllMocks();
});

describe.each(VIEWS)('saving from a plan $name', (view) => {
  it("freezing the layout keeps every zone's saved row and writes model ids only", async () => {
    const { ctx, rowsKept, onlyModelIds } = setup(view);
    await drawn();
    planeLayoutHandlers(ctx).toggleAutoLayout();
    rowsKept();
    onlyModelIds();
  });

  it('re-laying out a frozen plane writes model ids only and re-pins no row', async () => {
    const { ctx, rowsKept, onlyModelIds, layoutApiRef } = setup(view);
    await drawn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await relayoutPlane(ctx.editor, {
      autoLayout: false,
      activePlane: 'plan',
      getAutoPositions: () => layoutApiRef.current?.autoPositions() ?? {},
    });
    rowsKept();
    onlyModelIds();
  });

  it('a + on a zone saves no row for the zone it adds', async () => {
    const { ctx, saved, nodes, rowsKept, onlyModelIds } = setup(view);
    await drawn();
    const before = new Set(nodes().map((n) => n.id));
    expect(quickAddHandlers(ctx).run('checkout')).toBe(true);
    const added = nodes().find((n) => !before.has(n.id))!;
    expect(added).toBeDefined();
    expect(saved()[added.id]).toBeUndefined();
    rowsKept();
    onlyModelIds();
  });

  it('a top-level bar dragged a week later moves its dates, not its row', async () => {
    const { nodes, rowsKept, onlyModelIds } = setup(view);
    await drawn();
    const startOf = (id: string) => spanOf(nodes().find((n) => n.id === id)!)!.start;
    for (const name of ['Other', 'Checkout']) {
      const bar = screen.getAllByText(name)[0]!;
      fireEvent.click(bar);
      await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
      // a day is 20 px, and Shift steps 20: seven presses are a week, and the
      // one down is a row move a pinned row refuses
      for (let i = 0; i < 7; i++) fireEvent.keyDown(bar, { key: 'ArrowRight', shiftKey: true });
      fireEvent.keyDown(bar, { key: 'ArrowDown', shiftKey: true });
    }
    await waitFor(() => expect(startOf('checkout')).toBe(dayOf('2026-01-12')), { timeout: 2000 });
    expect(startOf('other')).toBe(dayOf('2026-03-09'));
    rowsKept();
    onlyModelIds();
  });

  it('a card dropped on a bar nests under the real zone; on a lane header or the Unassigned card, under nothing', async () => {
    const { container, nodes, containment, rowsKept, onlyModelIds } = setup(view);
    await drawn();
    const drop = (on: Element) => {
      document.elementFromPoint = () => on;
      const pane = container.querySelector('.react-flow')!;
      const e = createEvent.drop(pane, { clientX: 10, clientY: 10 });
      Object.defineProperty(e, 'dataTransfer', {
        value: { types: [LIBRARY_ENTRY_DND_TYPE], getData: () => 'zone', files: [] },
      });
      fireEvent(pane, e);
    };
    const added = (before: ReadonlySet<string>) => nodes().find((n) => !before.has(n.id))!.id;

    const nodeEl = (id: string) => container.querySelector(`.react-flow__node[data-id="${id}"]`)!;
    const otherId = view.grouped ? planCopyId('plat', 'other') : 'other';
    let before = new Set(nodes().map((n) => n.id));
    drop(nodeEl(otherId));
    const intoBar = added(before);
    expect(
      containment()
        .filter((c) => c.child === intoBar)
        .map((c) => c.parent),
    ).toEqual(['other']);

    if (view.grouped) {
      before = new Set(nodes().map((n) => n.id));
      drop(nodeEl(planCopyId('plat', '')));
      const intoHeader = added(before);
      expect(containment().filter((c) => c.child === intoHeader)).toEqual([]);
    }
    before = new Set(nodes().map((n) => n.id));
    drop(nodeEl('__unassigned__'));
    const intoCard = added(before);
    expect(containment().filter((c) => c.child === intoCard)).toEqual([]);
    rowsKept();
    onlyModelIds();
  });
});
