// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyDrawings, layoutPlaneKey, model, planCopyId, type LayoutOverlay } from '@diagc/core/internal';
import { DiagramView, type LayoutApi } from '@diagc/renderer';
import { dispatch as reduce, startSession, type EditorSession } from '../session/reducer';
import type { EditorApi } from '../session/useEditor';
import { studioNotation } from '../notations';
import { planeLayoutHandlers, quickAddHandlers, type EditContext } from './canvasEditHandlers';

// Grouping a plan by team is view state: what the studio saves from the canvas
// while it is grouped must leave every zone's saved row exactly as it was. The
// two paths that save from the canvas's own snapshot — freezing the layout and
// placing a quick-added sibling — run here against a real grouped canvas.

/** `checkout` is in both teams' lanes and has a saved row; `other` has none */
function sharedPlan() {
  const m = model('shared');
  const p = m.plan();
  const pay = p.team('pay', 'Payments');
  const plat = p.team('plat', 'Platform');
  const checkout = p.zone('checkout', { name: 'Checkout', start: '2026-01-05', end: '2026-02-27' });
  checkout.zone('api', { name: 'API', start: '2026-01-05', end: '2026-01-30' }).executor(pay);
  checkout.zone('ui', { name: 'UI', start: '2026-02-02', end: '2026-02-20' }).executor(plat);
  p.zone('other', { name: 'Other', start: '2026-03-02', end: '2026-03-13' }).executor(plat);
  return m.toJSON();
}

function setup() {
  const m = sharedPlan();
  const key = layoutPlaneKey(m, 'plan');
  const layout: LayoutOverlay = { version: 1, planes: { [key]: { checkout: { x: 80, y: 260 } } } };
  let live: EditorSession = startSession('m', { model: m, layout, drawings: emptyDrawings() });
  const editor = {
    session: live,
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
  const { container } = render(
    <DiagramView model={m} layout={layout} plane="plan" notation="plan" grouped layoutApiRef={layoutApiRef} />,
  );
  const saved = () => live.state.layout.planes[key] ?? {};
  return { ctx, container, saved, nodes: () => live.state.model.nodes };
}

const drawn = (container: HTMLElement) =>
  waitFor(() => {
    if (container.querySelector(`.react-flow__node[data-id="${planCopyId('plat', 'other')}"]`) === null)
      throw new Error('not laid out yet');
  });

describe('saving from a plan grouped by team', () => {
  it("freezing the layout keeps every zone's saved row: present stays, absent stays absent", async () => {
    const { ctx, container, saved } = setup();
    await drawn(container);
    planeLayoutHandlers(ctx).toggleAutoLayout();
    expect(saved()['checkout']).toEqual({ x: 80, y: 260 });
    expect(saved()['other']).toBeUndefined();
  });

  it('a + on a zone in a lane saves no lane y for the zone it adds', async () => {
    const { ctx, container, saved, nodes } = setup();
    await drawn(container);
    const before = new Set(nodes().map((n) => n.id));
    expect(quickAddHandlers(ctx).run('checkout')).toBe(true);
    const added = nodes().find((n) => !before.has(n.id))!;
    expect(added).toBeDefined();
    expect(saved()[added.id]).toBeUndefined();
    expect(saved()['checkout']).toEqual({ x: 80, y: 260 });
  });
});
