// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutPlaneKey, model, planCopyId, type DiagramModel, type Point } from '@diagc/core/internal';
import type { DiagramView } from '@diagc/renderer';
import { App } from '../App';

// A person in two teams has a badge in each team's frame: the real node in the
// first, a copy (its own canvas id, CompiledView.copies) in the other. Every
// gesture on the copy must act on the person, and an ungrouped plan — which now
// carries that copies map — must still save from the canvas exactly as before.
// Pinned through App, so the studio's own commands, inspector and Properties →
// Plan run against a real canvas.

// The canvas's own React Flow props and instance: a drag is a pointer gesture
// jsdom cannot drive, so a case calls DiagramView's onNodesChange and
// onNodeDragStop itself (as DiagramView.test.tsx does). The studio has no
// dependency on React Flow, so the module is named by the file the renderer's
// import resolves to (should that path ever stop matching, `flow.instance`
// stays null and every case fails rather than passing unmocked).
const flow = vi.hoisted(() => ({
  props: null as unknown as Record<string, (...a: unknown[]) => unknown>,
  instance: null as unknown as FlowInstance,
}));
vi.mock('../../../../packages/renderer/node_modules/@xyflow/react/dist/esm/index.mjs', async (importOriginal) => {
  const actual = await importOriginal<{ ReactFlow: ComponentType<Record<string, unknown>> }>();
  const Actual = actual.ReactFlow;
  function CapturingReactFlow(props: Record<string, unknown>) {
    flow.props = props as typeof flow.props;
    return (
      <Actual
        {...props}
        onInit={(inst: unknown) => {
          flow.instance = inst as FlowInstance;
          (props['onInit'] as ((i: unknown) => void) | undefined)?.(inst);
        }}
      />
    );
  }
  return { ...actual, ReactFlow: CapturingReactFlow };
});

const view = vi.hoisted(() => ({ props: null as Parameters<typeof DiagramView>[0] | null }));
vi.mock('@diagc/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@diagc/renderer')>();
  const Actual = actual.DiagramView;
  function CapturingDiagramView(props: Parameters<typeof DiagramView>[0]) {
    view.props = props;
    return <Actual {...props} />;
  }
  return { ...actual, DiagramView: CapturingDiagramView };
});

interface FlowNode {
  id: string;
  position: Point;
  style?: { width?: number; height?: number };
}
interface FlowInstance {
  getNodes: () => FlowNode[];
  getInternalNode: (id: string) => { internals: { positionAbsolute: Point } } | undefined;
  flowToScreenPosition: (p: Point) => Point;
}

/** examples/plan/teams: Ben is in Payments and Platform, so his badge in
 * Platform is a copy; audit has no executor */
function teamsPlan(): DiagramModel {
  const m = model('sketch');
  const plan = m.plan();
  const ana = plan.person('ana', 'Ana Silva');
  const ben = plan.person('ben', 'Ben Okafor');
  const cleo = plan.person('cleo', 'Cleo Brandt');
  const dev = plan.person('dev', 'Dev Rao');
  const payments = plan.team('payments', 'Payments');
  const platform = plan.team('platform', 'Platform');
  const mobile = plan.team('mobile', 'Mobile');
  payments.member(ana, ben);
  platform.member(ben, cleo);
  mobile.member(dev);
  const checkout = plan.zone('checkout', { name: 'Checkout v2', start: '2026-01-05', end: '2026-03-13' });
  checkout.owner(ana);
  checkout.zone('cards', { name: 'Card payments', start: '2026-01-05', end: '2026-02-13' }).executor(payments);
  checkout.zone('gateway', { name: 'Gateway migration', start: '2026-01-19', end: '2026-03-13' }).executor(platform);
  plan.zone('app', { name: 'App redesign', start: '2026-01-12', end: '2026-02-27' }).owner(dev).executor(mobile);
  plan.zone('audit', { name: 'Security audit', start: '2026-02-16', end: '2026-03-06' }).owner(cleo);
  return { ...m.toJSON(), name: 'sketch' };
}

const COPY = planCopyId('platform', 'ben');

/** serve `model` as the one editable diagram; every write succeeds */
const serve = (m: DiagramModel) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const get = init?.method === undefined || init.method === 'GET';
      if (url === '/api/diagrams')
        return new Response(JSON.stringify({ diagrams: [{ name: 'sketch', model: m, issues: [], editable: true }] }));
      if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }));
      if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }));
      if (url === '/api/diagrams/sketch' && get) return new Response(JSON.stringify({ model: m }));
      return new Response(JSON.stringify({ ok: true }));
    }),
  );

// jsdom has no layout: test-setup.ts measures every element at 800x600, which
// would make every box a drop target over every other. Here a React Flow node
// measures at the size the layout gave it inline (a zone, a frame), and an
// unsized one (a badge) as a small card, so a drop lands where it would on screen.
const sized = (el: HTMLElement, axis: 'width' | 'height', whole: number, card: number): number => {
  if (!el.classList.contains('react-flow__node')) return whole;
  const px = parseFloat(el.style[axis]);
  return Number.isFinite(px) ? px : card;
};
const realOffsets = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!,
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!,
};
beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return sized(this, 'width', 800, 120);
      },
    },
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return sized(this, 'height', 600, 40);
      },
    },
  });
});
afterAll(() => {
  Object.defineProperties(HTMLElement.prototype, realOffsets);
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  view.props = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const live = () => view.props!.model;
const savedPlane = () => view.props!.layout?.planes[layoutPlaneKey(live(), 'plan')] ?? {};
const relations = () => live().relations.map((r) => [r.from, r.to, r.kind]);
const undoArmed = () => !(screen.getByRole('button', { name: /^undo$/i }) as HTMLButtonElement).disabled;
const nodeEl = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
const flowNode = (id: string) => flow.instance.getNodes().find((n) => n.id === id);
const absOf = (id: string) => flow.instance.getInternalNode(id)!.internals.positionAbsolute;

async function mountEdit() {
  serve(teamsPlan());
  render(<App />);
  await screen.findByRole('heading', { name: /layers & planes/i });
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
  await screen.findByRole('button', { name: 'Done' });
  await settle(COPY);
}

/** `id` is drawn and measured, so its place can be read */
const settle = (id: string) =>
  waitFor(() => {
    if (nodeEl(id) === null) throw new Error(`${id} not drawn`);
    if (flow.instance?.getInternalNode(id)?.internals.positionAbsolute === undefined)
      throw new Error(`${id} not measured`);
  });

/** One drag of `id` to `to` (its on-screen position), let go over the flow
 * point `at`, through the canvas's own handlers. */
async function drag(id: string, to: Point, at: Point) {
  const pointer = flow.instance.flowToScreenPosition(at);
  act(() => void flow.props['onNodeDragStart']?.());
  act(() => void flow.props['onNodesChange']!([{ type: 'position', id, position: to, dragging: true }]));
  const node = await waitFor(() => {
    const n = flowNode(id);
    if (n?.position.x !== to.x || n.position.y !== to.y) throw new Error('not applied yet');
    return n;
  });
  act(() => void flow.props['onNodeDragStop']!({ clientX: pointer.x, clientY: pointer.y }, node, [node]));
}

/** a drop of `id` a few px inside `target`'s box */
async function dropOn(id: string, target: string) {
  await settle(target);
  const t = absOf(target);
  const at = { x: t.x + 5, y: t.y + 5 };
  await drag(id, at, at);
}

describe('an ungrouped plan with badge copies saves from the canvas as before', () => {
  it('a zone dragged 40px down saves its new y, and nothing for a copy', async () => {
    await mountEdit();
    await settle('app');
    const before = flowNode('app')!.position;
    await drag('app', { x: before.x, y: before.y + 40 }, { x: -10_000, y: -10_000 });
    await waitFor(() => expect(savedPlane()['app']?.y).toBe(before.y + 40));
    expect(Object.keys(savedPlane()).filter((id) => id.startsWith('__lane__:'))).toEqual([]);
  });

  it('freezing the layout writes no copy id', async () => {
    await mountEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Auto-layout' }));
    await waitFor(() => expect(Object.keys(savedPlane()).length).toBeGreaterThan(0));
    expect(Object.keys(savedPlane()).filter((id) => id.startsWith('__lane__:'))).toEqual([]);
  });
});

describe("a drag of Ben's badge copy acts on Ben", () => {
  it('dropped on a zone, it gives Ben a role there', async () => {
    await mountEdit();
    await dropOn(COPY, 'audit');
    await waitFor(() => expect(relations()).toContainEqual(['ben', 'audit', 'executes']));
  });

  it('dropped on another team, it adds Ben to it', async () => {
    await mountEdit();
    await dropOn(COPY, 'mobile');
    await waitFor(() => expect(relations()).toContainEqual(['ben', 'mobile', 'member-of']));
  });

  it('let go inside a frame he is already in, it changes nothing', async () => {
    await mountEdit();
    const errors = vi.spyOn(console, 'error');
    await dropOn(COPY, 'platform');
    await dropOn('ben', 'payments');
    expect(undoArmed()).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });

  it('dropped on empty canvas, it saves nothing and snaps back', async () => {
    await mountEdit();
    const before = flowNode(COPY)!.position;
    const away = { x: -10_000, y: -10_000 };
    await drag(COPY, away, away);
    expect(undoArmed()).toBe(false);
    expect(savedPlane()).toEqual({});
    await waitFor(() => expect(flowNode(COPY)!.position).toEqual(before));
  });
});

describe("Ben's badges", () => {
  const dimmed = (id: string) => nodeEl(id)?.querySelector('.dg-focus-node-dim') !== null;

  /** every box a click left undimmed, once the click has dimmed the rest */
  const litAfterClicking = async (id: string) => {
    fireEvent.click(document.querySelector('.react-flow__pane')!);
    await waitFor(() => expect(document.querySelector('.dg-focus-node-dim')).toBeNull());
    fireEvent.click(nodeEl(id)!);
    await waitFor(() => expect(dimmed('ana')).toBe(true));
    return [...document.querySelectorAll<HTMLElement>('.react-flow__node')]
      .map((el) => el.dataset['id']!)
      .filter((n) => !dimmed(n))
      .sort();
  };

  it('a click on the copy lights what a click on Ben does — both badges and his zone — and shows Ben', async () => {
    await mountEdit();
    // a zone Ben holds a role on himself (cards and gateway are his teams')
    await dropOn(COPY, 'audit');
    await waitFor(() => expect(relations()).toContainEqual(['ben', 'audit', 'executes']));
    const viaCopy = await litAfterClicking(COPY);
    expect(viaCopy).toEqual(expect.arrayContaining(['audit', 'ben', COPY]));
    await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Name').value).toBe('Ben Okafor'));
    expect(await litAfterClicking('ben')).toEqual(viaCopy);
  });

  // the real node is drawn too, so a rename on one badge must open on that
  // badge alone: two editors would steal each other's focus and both close
  for (const badge of ['ben', COPY])
    it(`a double-click on ${badge === 'ben' ? 'his real badge' : 'the copy'} opens one name editor, on it, and it stays open`, async () => {
      await mountEdit();
      fireEvent.doubleClick(nodeEl(badge)!);
      await waitFor(() => expect(nodeEl(badge)!.querySelector('.dg-label-input')).not.toBeNull());
      await act(async () => {});
      expect(document.querySelectorAll('.dg-label-input')).toHaveLength(1);
      expect(nodeEl(badge)!.querySelector('.dg-label-input')).toBe(document.activeElement);
    });

  it("a host asking for Ben's box gets his real badge", async () => {
    await mountEdit();
    await settle('ben');
    const b = view.props!.layoutApiRef!.current!.nodeBounds('ben')!;
    expect({ x: b.x, y: b.y }).toEqual(absOf('ben'));
    expect(absOf('ben')).not.toEqual(absOf(COPY));
  });

  it('a selected frame stays behind its badges', async () => {
    await mountEdit();
    fireEvent.click(nodeEl('platform')!);
    await waitFor(() => expect(nodeEl('platform')!.classList.contains('selected')).toBe(true));
    const z = (id: string) => Number(nodeEl(id)!.style.zIndex || 0);
    for (const id of [COPY, 'cleo']) expect(z('platform'), id).toBeLessThan(z(id));
  });
});

describe('membership removed in Properties → Plan', () => {
  const selectBen = async () => {
    fireEvent.click(nodeEl(COPY)!);
    await screen.findByRole('button', { name: 'Remove from Platform' });
  };

  it('out of Platform, his copy goes, with no error', async () => {
    await mountEdit();
    const errors = vi.spyOn(console, 'error');
    await selectBen();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Platform' }));
    await waitFor(() => expect(nodeEl(COPY)).toBeNull());
    expect(nodeEl('ben')).not.toBeNull();
    // the selection was the person, not the box that went
    expect(screen.getByLabelText<HTMLTextAreaElement>('Name').value).toBe('Ben Okafor');
    expect(errors).not.toHaveBeenCalled();
  });

  it('out of Payments, his real badge moves into Platform’s frame and the copy goes', async () => {
    await mountEdit();
    const errors = vi.spyOn(console, 'error');
    await selectBen();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Payments' }));
    await waitFor(() => expect(nodeEl(COPY)).toBeNull());
    await waitFor(() => {
      const frame = flowNode('platform')!;
      const ben = flowNode('ben')!.position;
      const { width = 0, height = 0 } = frame.style ?? {};
      expect(ben.x).toBeGreaterThanOrEqual(frame.position.x);
      expect(ben.x).toBeLessThan(frame.position.x + width);
      expect(ben.y).toBeGreaterThanOrEqual(frame.position.y);
      expect(ben.y).toBeLessThan(frame.position.y + height);
    });
    expect(errors).not.toHaveBeenCalled();
  });
});
