// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getViewportForBounds } from '@xyflow/react';
import { dayOf, layoutPlaneKey, model, type DiagramModel, type LayoutOverlay, type ThreatTarget } from '@diagc/core';
import { DiagramView, LIBRARY_ENTRY_DND_TYPE, type CanvasCommands, type LayoutApi } from './DiagramView';
import { FISHBONE_LAYOUT } from './fishbone-layout';
import { GIT_LAYOUT } from './git-layout';
import { PLAN_LAYOUT } from './plan-layout';
import { NUDGE_IDLE_MS, NUDGE_STEP, NUDGE_SHIFT_FACTOR } from './useNudge';
import { NOTE_WIDTH } from './NoteNode';
import { BADGE_R, badgeCenter, estimateNoteHeight, NOTE_GAP } from './note-place';

// The drop-to-assign tests further down need to call DiagramView's OWN
// onNodesChange/onNodeDrag/onNodeDragStop directly — React Flow's drag is a
// pointer gesture jsdom cannot drive (see the note above the view-mode
// position-reporting describe block). This wraps <ReactFlow> transparently —
// every OTHER test in this file renders through it unaffected — and captures
// the exact props DiagramView passed it, plus the live instance (via a
// chained onInit), so a test can call the real handlers with hand-built
// NodeChange/event arguments instead of re-implementing their logic.
const dragCapture = vi.hoisted(() => ({
  props: null as unknown as Record<string, any>,
  instance: null as any,
}));
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  const Actual = actual.ReactFlow;
  function CapturingReactFlow(props: Record<string, any>) {
    dragCapture.props = props;
    return (
      <Actual
        {...props}
        onInit={(inst: unknown) => {
          dragCapture.instance = inst;
          props['onInit']?.(inst);
        }}
      />
    );
  }
  return { ...actual, ReactFlow: CapturingReactFlow };
});

/** container-endpoint relation: service inside a system relates to the system itself */
function containerEndpointModel() {
  const m = model('t1');
  const api = m.node('api', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  const gw = m.node('gw', { type: 'service', metadata: { language: 'go', repo: 'https://x.example' } });
  sys.contains(api);
  m.relate(gw, sys, { kind: 'sync', label: 'ingress' });
  return m.toJSON();
}

/** shared node promoted between two pinned-collapsed systems, aggregated edges to it */
function promotedEndpointModel() {
  const m = model('t2');
  const a1 = m.node('a1', { type: 'service' });
  const b1 = m.node('b1', { type: 'service' });
  const shared = m.node('shared-db', { type: 'database' });
  const A = m.node('A', { type: 'system' });
  const B = m.node('B', { type: 'system' });
  A.contains(a1, shared);
  B.contains(b1, shared);
  m.relate(a1, shared, { kind: 'reads' });
  m.relate(b1, shared, { kind: 'writes' });
  return m.toJSON();
}

const imageModel = (): DiagramModel => ({
  version: 1,
  id: 't-img',
  name: 't-img',
  nodes: [{ id: 'pic', name: 'logo', type: 'image', image: 'a3f9c2d4e5f6.png' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

const shapeModel = (): DiagramModel => ({
  version: 1,
  id: 't-shape',
  name: 't-shape',
  nodes: [{ id: 'per', name: 'Actor', type: 'c4-person', color: '#08427b', shape: '/library/shapes/person.svg' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

const richModel = (): DiagramModel => ({
  version: 1,
  id: 'rt',
  name: 'rt',
  nodes: [
    { id: 'a', name: 'Web Server', rich: [{ text: 'Web ' }, { text: 'Server', bold: true }], textAlign: 'center', fontScale: 'lg' },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

/** three-deep containment: outer › mid › leaf, plus a top-level sibling `other` */
function nestedModel(): DiagramModel {
  const m = model('nest');
  const outer = m.node('outer', { type: 'system' });
  const mid = m.node('mid', { type: 'system' });
  const leaf = m.node('leaf', { type: 'service' });
  m.node('other', { type: 'service' });
  outer.contains(mid);
  mid.contains(leaf);
  return m.toJSON();
}

describe('DiagramView', () => {
  it('renders a relation whose endpoint is a container', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    // nodes appear once async layout resolves
    expect(await screen.findByText('gw')).toBeDefined();
    expect(await screen.findByText('sys')).toBeDefined();
    expect(await screen.findByText('ingress')).toBeDefined();
    // on-node meta badge (default keys include 'language'; 'repo' stays sidebar-only)
    expect(screen.getByText('go')).toBeDefined();
    expect(screen.queryByText('https://x.example')).toBeNull();
  });

  it('renders aggregated edges to a promoted node between collapsed systems', async () => {
    render(
      <DiagramView
        model={promotedEndpointModel()}
        pins={{ A: 'collapsed', B: 'collapsed' }}
      />,
    );
    expect(await screen.findByText('shared-db')).toBeDefined();
    expect(await screen.findByTestId('promoted-marker')).toBeDefined();
    // A=>shared-db (reads) and B=>shared-db (writes) both anchor to the promoted node
    expect(await screen.findByText('A')).toBeDefined();
    expect(await screen.findByText('B')).toBeDefined();
  });

  it('keeps visible entities in view when switching planes', async () => {
    const m = model('tp');
    m.plane('arch').plane('infra');
    // api is shared (appears on both planes, re-nested per plane); plat/sys are
    // arch-only and box is infra-only — membership is explicit under per-plane views.
    const api = m.node('api', { type: 'service' });
    const sys = m.node('sys', { type: 'system', plane: 'arch' });
    const plat = m.node('plat', { type: 'platform', plane: 'arch' });
    const box = m.node('box', { type: 'infra', plane: 'infra' });
    plat.contains(sys);
    sys.contains(api);
    box.contains(api, { plane: 'infra' });
    const json = m.toJSON();

    // enter = correlated double-click (two clicks on the same node); re-query
    // between clicks since selection can remount the node.
    const enter = async (label: string) => {
      fireEvent.click(await screen.findByText(label), { clientX: 10, clientY: 10 });
      fireEvent.click(await screen.findByText(label), { clientX: 10, clientY: 10, detail: 2 });
    };
    const { rerender } = render(<DiagramView model={json} plane="arch" />);
    await enter('plat');
    await enter('sys');
    expect(await screen.findByText('api')).toBeDefined();

    rerender(<DiagramView model={json} plane="infra" />);
    // api stays visible, now inside its infra ancestor
    expect(await screen.findByText('box')).toBeDefined();
    expect(await screen.findByText('api')).toBeDefined();
    await waitFor(() => expect(screen.queryByText('plat')).toBeNull()); // arch-only node gone
  });

  it('shift-click grows the selection and reports the whole set via onMultiSelect', async () => {
    const onMultiSelect = vi.fn();
    const onSelect = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" onMultiSelect={onMultiSelect} onSelect={onSelect} />);
    fireEvent.click(await screen.findByText('gw'));
    await waitFor(() => expect(onMultiSelect).toHaveBeenLastCalledWith(['gw']));
    // React Flow's multi-select gate (`multiSelectionActive`) is driven by a real
    // keydown/keyup pair on window (a useKeyPress hook), NOT by the click event's
    // own `shiftKey` flag — so growing the selection needs the key genuinely held.
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('sys'), { shiftKey: true });
    await waitFor(() => expect(onMultiSelect).toHaveBeenLastCalledWith(expect.arrayContaining(['gw', 'sys'])));
    expect(onMultiSelect.mock.calls[onMultiSelect.mock.calls.length - 1]![0]).toHaveLength(2);
    // the primary selection is still "the last clicked node"
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'node', id: 'sys' });
    // React Flow deliberately no-ops a plain click on a node that is ALREADY
    // part of a multi-selection (so the whole group stays selected and can be
    // dragged together) — the set survives a stray click on one of its members.
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('gw'));
    expect(onMultiSelect.mock.calls[onMultiSelect.mock.calls.length - 1]![0]).toHaveLength(2);
    // shift-clicking an already-selected member again removes just that one
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('sys'), { shiftKey: true });
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' });
    await waitFor(() => expect(onMultiSelect).toHaveBeenLastCalledWith(['gw']));
  });

  it('edit mode: Align top on a two-node selection commits one batch', async () => {
    // gw → sys flows DOWN, so the two sit at different heights (their lefts may
    // well coincide — an Align left there would rightly move nothing)
    const onNodesMoved = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" edit={{ onNodesMoved }} />);
    fireEvent.click(await screen.findByText('gw'));
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('sys'), { shiftKey: true });
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(await screen.findByRole('button', { name: 'Align top' }));
    await waitFor(() => expect(onNodesMoved).toHaveBeenCalledTimes(1));
    const positions = onNodesMoved.mock.calls[0]![0] as Record<string, { x: number; y: number }>;
    const moved = Object.keys(positions);
    expect(moved.length).toBeGreaterThanOrEqual(1);
    expect(moved.every((id) => id === 'gw' || id === 'sys')).toBe(true);
  });

  it('view mode: the toolbar needs somewhere to land — shown with onViewPositionsChange, hidden without', async () => {
    const { unmount } = render(<DiagramView model={containerEndpointModel()} onViewPositionsChange={vi.fn()} />);
    fireEvent.click(await screen.findByText('gw'));
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('sys'), { shiftKey: true });
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' });
    expect(await screen.findByRole('button', { name: 'Align left' })).toBeDefined();
    unmount();

    render(<DiagramView model={containerEndpointModel()} />);
    fireEvent.click(await screen.findByText('gw'));
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('sys'), { shiftKey: true });
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' });
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node.selected').length).toBe(2));
    expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
  });

  it('view mode: two quick shift-clicks on a container grow the selection, they never drill', async () => {
    const onEnteredPathChange = vi.fn();
    render(<DiagramView model={containerEndpointModel()} onEnteredPathChange={onEnteredPathChange} />);
    const sys = await screen.findByText('sys');
    fireEvent.click(sys, { shiftKey: true, detail: 1 });
    fireEvent.click(sys, { shiftKey: true, detail: 2 });
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull();
    expect(onEnteredPathChange).not.toHaveBeenCalledWith(['sys']);
  });

  it('view-mode double-click enters a container (nested zoom); the breadcrumb exits back out', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    const sys = await screen.findByText('sys');
    expect(screen.queryByText('api')).toBeNull(); // rests folded at the bird's-eye
    // A real double-click: the first click selects (remounting the node in-browser,
    // so the native `dblclick` misfires onto the pane); enter is driven by
    // correlating the two clicks. Both land at the same point on the same node.
    fireEvent.click(sys, { clientX: 10, clientY: 10 });
    // the real second click carries detail>=2 (distinguishes from a deselect click)
    fireEvent.click(screen.getByText('sys'), { clientX: 10, clientY: 10, detail: 2 });
    expect(await screen.findByText('api')).toBeDefined(); // entered: children fill the canvas
    const nav = await screen.findByLabelText('Nested zoom breadcrumb'); // trail appears
    expect(nav).toBeDefined();
    // isolated view: the sibling (gw) is gone (only the entered node's interior shows).
    // 'sys' still appears — but in the breadcrumb, not as a node.
    await waitFor(() => expect(screen.queryByText('gw')).toBeNull());
    // the home crumb zooms all the way back out — the bird's-eye returns
    fireEvent.click(screen.getByText('⌂'));
    await waitFor(() => expect(screen.queryByText('api')).toBeNull());
    expect(await screen.findByText('gw')).toBeDefined();
    await waitFor(() => expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull());
  });

  it('does not enter on two clicks split across different nodes', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    const sys = await screen.findByText('sys');
    fireEvent.click(sys, { clientX: 10, clientY: 10 });
    // second click lands on a different node — no double-click, no drill
    fireEvent.click(await screen.findByText('gw'), { clientX: 10, clientY: 10 });
    expect(screen.queryByText('api')).toBeNull();
    expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull();
  });

  it('the ⤢ enter affordance drills into a container', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    await screen.findByText('sys');
    expect(screen.queryByText('api')).toBeNull();
    // the collapsed container carries an enter chip; clicking it drills in
    fireEvent.click(await screen.findByLabelText('Enter node'));
    expect(await screen.findByText('api')).toBeDefined();
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
  });

  it('edit mode renders one level at a time, not the whole diagram', async () => {
    render(<DiagramView model={nestedModel()} mode="edit" />);
    // top level: only top-level nodes; nested containers are NOT force-expanded
    expect(await screen.findByText('outer')).toBeDefined();
    expect(await screen.findByText('other')).toBeDefined();
    await waitFor(() => expect(screen.queryByText('mid')).toBeNull());
    // the ⤢ chip drills into `outer` in edit mode (double-click is rename there)
    fireEvent.click(await screen.findByLabelText('Enter node'));
    expect(await screen.findByText('mid')).toBeDefined(); // now inside outer
    await waitFor(() => expect(screen.queryByText('other')).toBeNull()); // sibling scoped out
    await waitFor(() => expect(screen.queryByText('leaf')).toBeNull()); // sub-container still collapsed
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
  });

  it('keeps the drill trail across an edit that yields a new model object', async () => {
    const m1 = nestedModel();
    const { rerender } = render(<DiagramView model={m1} mode="edit" />);
    fireEvent.click(await screen.findByLabelText('Enter node')); // drill into outer
    expect(await screen.findByText('mid')).toBeDefined();
    // an edit dispatch produces a new model object with the SAME id
    const m2 = JSON.parse(JSON.stringify(m1)) as DiagramModel;
    rerender(<DiagramView model={m2} mode="edit" />);
    expect(await screen.findByText('mid')).toBeDefined(); // still drilled in
    await waitFor(() => expect(screen.queryByText('other')).toBeNull());
    expect(screen.queryByLabelText('Nested zoom breadcrumb')).not.toBeNull();
  });

  it('pops out of a drilled level when that node is removed by an edit', async () => {
    const m1 = nestedModel();
    const { rerender } = render(<DiagramView model={m1} mode="edit" />);
    fireEvent.click(await screen.findByLabelText('Enter node')); // drill into outer
    expect(await screen.findByText('mid')).toBeDefined();
    const m2: DiagramModel = {
      ...m1,
      nodes: m1.nodes.filter((n) => n.id !== 'outer'),
      containment: m1.containment.filter((c) => c.parent !== 'outer' && c.child !== 'outer'),
    };
    rerender(<DiagramView model={m2} mode="edit" />);
    // trail pruned back to the bird's-eye (outer is gone)
    await waitFor(() => expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull());
  });

  it('reports the drill trail to the host via onEnteredPathChange', async () => {
    const onEnteredPathChange = vi.fn();
    render(<DiagramView model={nestedModel()} mode="edit" onEnteredPathChange={onEnteredPathChange} />);
    await screen.findByText('outer');
    fireEvent.click(await screen.findByLabelText('Enter node')); // drill into outer
    await screen.findByText('mid');
    await waitFor(() => expect(onEnteredPathChange).toHaveBeenLastCalledWith(['outer']));
  });

  it('mounts drilled to the enteredPath prop (deep link)', async () => {
    render(<DiagramView model={nestedModel()} enteredPath={['outer', 'mid']} />);
    // inside mid: its child renders, the top-level sibling does not
    expect(await screen.findByText('leaf')).toBeDefined();
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
    expect(screen.queryByText('other')).toBeNull();
  });

  it('applies a changed enteredPath prop (Back/Forward navigation)', async () => {
    const json = nestedModel();
    const { rerender } = render(<DiagramView model={json} enteredPath={['outer']} />);
    expect(await screen.findByText('mid')).toBeDefined();
    rerender(<DiagramView model={json} enteredPath={[]} />);
    await waitFor(() => expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull());
    expect(await screen.findByText('other')).toBeDefined(); // bird's-eye again
  });

  it('prunes a stale enteredPath prop and reports the surviving prefix', async () => {
    const onPath = vi.fn();
    render(<DiagramView model={nestedModel()} enteredPath={['outer', 'ghost']} onEnteredPathChange={onPath} />);
    // lands inside `outer` (the surviving prefix), not on a blank canvas
    expect(await screen.findByText('mid')).toBeDefined();
    await waitFor(() => expect(onPath).toHaveBeenCalledWith(['outer']));
  });

  it('ignores an echoed contents-equal enteredPath prop', async () => {
    const json = nestedModel();
    const { rerender } = render(<DiagramView model={json} enteredPath={[]} />);
    fireEvent.click(await screen.findByLabelText('Enter node')); // gesture-drill into outer
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
    rerender(<DiagramView model={json} enteredPath={['outer']} />); // host echoes the report back
    expect(await screen.findByText('mid')).toBeDefined(); // still drilled, no reset
    expect(screen.queryByLabelText('Nested zoom breadcrumb')).not.toBeNull();
  });

  it('applies a new enteredPath prop even when a same-render model switch queued a reset', async () => {
    const a = model('deep-a');
    const sharedA = a.node('shared', { type: 'system' });
    sharedA.contains(a.node('leaf-a', { type: 'service' }));
    const b = model('deep-b');
    const sharedB = b.node('shared', { type: 'system' });
    sharedB.contains(b.node('leaf-b', { type: 'service' }));
    const { rerender } = render(<DiagramView model={a.toJSON()} enteredPath={['shared']} />);
    expect(await screen.findByText('leaf-a')).toBeDefined();
    // new array reference, same contents, arriving together with a model-id switch
    rerender(<DiagramView model={b.toJSON()} enteredPath={['shared']} />);
    expect(await screen.findByText('leaf-b')).toBeDefined();
    expect(await screen.findByLabelText('Nested zoom breadcrumb')).toBeDefined();
  });

  describe('switching to a different diagram', () => {
    // test-setup's ResizeObserver reports a node the moment it is observed: one
    // callback per node, and React Flow resolves a queued fit on the first
    // report — framing a single box, whatever was asked of it. A browser hands
    // over every node observed in a frame in ONE callback. These cases are about
    // what a fit frames, so they measure the way a browser does.
    class BatchingResizeObserver {
      private pending: Element[] = [];
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        if (this.pending.push(target) > 1) return;
        queueMicrotask(() => {
          const contentRect = { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 };
          const entries = this.pending.splice(0).map((t) => ({ target: t, contentRect }));
          act(() => this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver));
        });
      }
      unobserve() {}
      disconnect() {
        this.pending = [];
      }
    }
    const stubbed = window.ResizeObserver;
    beforeEach(() => {
      window.ResizeObserver = BatchingResizeObserver as unknown as typeof ResizeObserver;
    });
    afterEach(() => {
      window.ResizeObserver = stubbed;
    });

    /** a chain of `count` services, ids n1…n<count> — two of these share ids */
    const chain = (id: string, count: number): DiagramModel => {
      const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i + 1}`, name: `Node ${i + 1}`, type: 'service' }));
      return {
        version: 1,
        id,
        name: id,
        nodes,
        containment: [],
        relations: nodes.slice(1).map((n, i) => ({ id: `${nodes[i]!.id}->${n.id}#0`, from: nodes[i]!.id, to: n.id, kind: 'sync' })),
        layers: [],
        planes: [],
      };
    };
    const viewportOf = (container: HTMLElement) =>
      (container.querySelector('.react-flow__viewport') as HTMLElement).style.transform.replace(/\s+/g, '');
    const boxes = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.react-flow__node')];
    const drawn = (container: HTMLElement) => boxes(container).length;
    /**
     * The viewport that frames every box now drawn, the way React Flow's own
     * fit computes it (its default padding — what the `fitView` prop uses for a
     * first open). Every box measures 800×600 here (test-setup's
     * offsetWidth/offsetHeight), in a pane of the same size.
     */
    const framing = (container: HTMLElement): string => {
      const at = boxes(container).map((el) => {
        const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform)!;
        return { x: Number(m[1]), y: Number(m[2]) };
      });
      const x = Math.min(...at.map((p) => p.x));
      const y = Math.min(...at.map((p) => p.y));
      const bounds = { x, y, width: Math.max(...at.map((p) => p.x)) + 800 - x, height: Math.max(...at.map((p) => p.y)) + 600 - y };
      const v = getViewportForBounds(bounds, 800, 600, 0.02, 4, 0.1);
      return `translate(${v.x}px,${v.y}px)scale(${v.zoom})`;
    };

    it('fits the new diagram instead of keeping the last one\'s pan and zoom', async () => {
      const { container, rerender } = render(<DiagramView model={containerEndpointModel()} />);
      await screen.findByText('gw');
      await waitFor(() => expect(viewportOf(container)).toContain('scale('));
      rerender(<DiagramView model={chain('big', 9)} />);
      await waitFor(() => expect(drawn(container)).toBe(9));
      await waitFor(() => expect(viewportOf(container)).toBe(framing(container)));
    });

    it('waits for the new diagram\'s own layout: a copy that was added to shares its ids with the original', async () => {
      // The last arrangement is kept while the next is computed, and these two
      // diagrams share n1/n2 — so the moment after the switch there is a
      // complete-looking, measured scene on screen that is the OLD diagram's. A
      // fit taken then frames two boxes and leaves the other seven off screen.
      const { container, rerender } = render(<DiagramView model={chain('original', 2)} />);
      await waitFor(() => expect(drawn(container)).toBe(2));
      await waitFor(() => expect(viewportOf(container)).toContain('scale('));
      rerender(<DiagramView model={chain('copy', 9)} />);
      await waitFor(() => expect(drawn(container)).toBe(9));
      await waitFor(() => expect(viewportOf(container)).toBe(framing(container)));
    });

    it('leaves the view alone when the same diagram comes back as a new object (an edit, a reload)', async () => {
      const { container, rerender } = render(<DiagramView model={chain('same', 2)} />);
      await waitFor(() => expect(drawn(container)).toBe(2));
      await waitFor(() => expect(viewportOf(container)).toContain('scale('));
      const before = viewportOf(container);
      rerender(<DiagramView model={chain('same', 9)} />);
      await waitFor(() => expect(drawn(container)).toBe(9));
      // give a wrongly queued fit the time to land before calling it absent
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(viewportOf(container)).toBe(before);
    });
  });

  it('edit mode: Backspace on a selected node reports onDeleteSelection, never removes locally', async () => {
    const onDeleteSelection = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" edit={{ onDeleteSelection }} />);
    fireEvent.click(await screen.findByText('gw'));
    // React Flow marks the node selected through a state round-trip — wait for
    // it before pressing the key, or the delete set is empty.
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    await waitFor(() => expect(onDeleteSelection).toHaveBeenCalledWith({ nodeIds: ['gw'], relationIds: [] }));
    // the node stays on canvas: existence is the model's call, and the host's
    // dispatch (not React Flow's local removal) is what takes it away
    expect(screen.getByText('gw')).toBeDefined();
  });

  it('view mode: Backspace is inert — no ghost deletion without an edit host', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    fireEvent.click(await screen.findByText('gw'));
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    // still there after the keypress settles
    await waitFor(() => expect(screen.getByText('gw')).toBeDefined());
  });

  it('edit mode: dblclick edits a box label as rich text and commits runs', async () => {
    const onSetNodeRich = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" pins={{ sys: 'expanded' }} edit={{ onSetNodeRich }} />);
    expect(await screen.findByText('api')).toBeDefined();
    fireEvent.doubleClick(screen.getAllByText('api')[0]!);
    const box = (await screen.findByLabelText('Edit text')) as HTMLElement;
    box.innerHTML = 'api-gw';
    fireEvent.blur(box);
    expect(onSetNodeRich).toHaveBeenCalledWith('api', [{ text: 'api-gw' }]);
    expect(screen.getByText('sys')).toBeDefined();
  });

  it('edit mode: double-clicking a sole-relation edge label commits an edit', async () => {
    const onEditEdgeLabel = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" edit={{ onEditEdgeLabel }} />);
    fireEvent.doubleClick(await screen.findByText('ingress'));
    const input = (await screen.findByLabelText('Edge label')) as HTMLInputElement;
    expect(input.value).toBe('ingress');
    fireEvent.change(input, { target: { value: 'gateway' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // the sole relation id + the label id are wired through; the text is committed
    expect(onEditEdgeLabel).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'gateway');
  });

  it('edit mode: a second click near an edge click opens the add-label editor', async () => {
    // Double-click-to-add is detected from click events, NOT the browser's
    // `dblclick` (unreliable once the first click remounts the edges layer). The
    // first click records the edge; a second click within the window — on the edge
    // OR on the pane it fell through to (detail 2) — opens the editor and must not
    // also spawn a node. The remount race can't be reproduced in jsdom; here we
    // drive the two synthetic clicks to prove the wiring.
    const onAddEdgeLabel = vi.fn();
    const onCreateAt = vi.fn();
    const { container } = render(
      <DiagramView
        model={containerEndpointModel()}
        mode="edit"
        edit={{ onAddEdgeLabel, onCreateAt }}
      />,
    );
    const edge = await waitFor(() => {
      const el = container.querySelector('.react-flow__edge');
      if (el === null) throw new Error('edge not rendered');
      return el as HTMLElement;
    });
    // first click records lastEdgeClick (default 0,0 coords). The second click of
    // a real double-click lands on the pane (the first click remounts the edge)
    // and carries detail: 2 — within the 40px/500ms window this opens the add-label
    // editor AND suppresses onPaneClick's node-creation branch (no stray node).
    fireEvent.click(edge);
    fireEvent.click(container.querySelector('.react-flow__pane') as HTMLElement, { detail: 2 });
    expect(onCreateAt).not.toHaveBeenCalled();
    const input = (await screen.findByLabelText('Edge label')) as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'rate' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // the sole relation id is wired through; the text/t/side reach the host
    expect(onAddEdgeLabel).toHaveBeenCalledWith(expect.any(String), 'rate', expect.any(Number), expect.any(String));
    // the stray-node guard never fired the create callback anywhere in the gesture
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it('view mode exposes no edge-label editing affordance', async () => {
    const onEditEdgeLabel = vi.fn();
    render(<DiagramView model={containerEndpointModel()} edit={{ onEditEdgeLabel }} />);
    fireEvent.doubleClick(await screen.findByText('ingress'));
    expect(screen.queryByLabelText('Edge label')).toBeNull();
    expect(onEditEdgeLabel).not.toHaveBeenCalled();
  });

  it('applies layout overlay positions over elk output', async () => {
    const layout = { version: 1 as const, planes: { default: { gw: { x: 777, y: 55 } } } };
    render(<DiagramView model={containerEndpointModel()} layout={layout} />);
    const gw = (await screen.findByText('gw')).closest('.react-flow__node') as HTMLElement;
    await waitFor(() => expect(gw.style.transform).toContain('777'));
  });

  it('ignoreSavedPositions hands the plane back to the layout algorithm', async () => {
    // Saved coordinates otherwise beat every algorithm, so a diagram that has
    // been placed by hand stops responding to the picker entirely. The toggle
    // drops them for this view only — the sidecar is untouched.
    const layout = { version: 1 as const, planes: { default: { gw: { x: 777, y: 55 } } } };
    const { rerender } = render(<DiagramView model={containerEndpointModel()} layout={layout} />);
    const gw = (await screen.findByText('gw')).closest('.react-flow__node') as HTMLElement;
    await waitFor(() => expect(gw.style.transform).toContain('777'));

    rerender(<DiagramView model={containerEndpointModel()} layout={layout} ignoreSavedPositions />);
    await waitFor(() => expect(gw.style.transform).not.toContain('777'));
  });

  it('ignoreSavedPositions leaves overlay SIZES alone — only positions are automatic', async () => {
    // Sizes are not something a layout algorithm computes, so dropping them
    // would shrink hand-resized image nodes as a side effect of re-arranging.
    render(
      <DiagramView
        model={imageModel()}
        assetBase="/api/assets/"
        layout={{ version: 1, planes: {}, sizes: { pic: { w: 300, h: 200 } } }}
        ignoreSavedPositions
      />,
    );
    const img = await screen.findByRole('img', { name: 'logo' });
    const node = img.closest('.react-flow__node') as HTMLElement;
    await waitFor(() => expect(node.style.width).toBe('300px'));
  });

  it('sizes an image node from the overlay sizes map', async () => {
    render(
      <DiagramView
        model={imageModel()}
        assetBase="/api/assets/"
        layout={{ version: 1, planes: {}, sizes: { pic: { w: 300, h: 200 } } }}
      />,
    );
    const img = await screen.findByRole('img', { name: 'logo' });
    expect(img.getAttribute('src')).toBe('/api/assets/a3f9c2d4e5f6.png');
    const rfNode = img.closest('.react-flow__node') as HTMLElement;
    await waitFor(() => expect(rfNode.style.width).toBe('300px'));
    expect(rfNode.style.height).toBe('200px');
  });

  it('propagates a node shape into a masked shape node sized from the overlay', async () => {
    const { container } = render(
      <DiagramView model={shapeModel()} layout={{ version: 1, planes: {}, sizes: { per: { w: 90, h: 110 } } }} />,
    );
    const fill = await waitFor(() => {
      const f = container.querySelector('.dg-shape-fill') as HTMLElement | null;
      if (f === null) throw new Error('shape not propagated into render data');
      return f;
    });
    const mask = fill.style.maskImage || fill.style.getPropertyValue('-webkit-mask-image');
    expect(mask).toContain('/library/shapes/person.svg');
    expect(container.querySelector('.dg-type')?.textContent).toBe('[Person]');
    // the overlay size must reach the layout (size-hints) and the RF node style
    const rfNode = fill.closest('.react-flow__node') as HTMLElement;
    await waitFor(() => expect(rfNode.style.width).toBe('90px'));
    expect(rfNode.style.height).toBe('110px');
  });

  // A fishbone's lines end on other lines, not on boxes, so a moved node cannot
  // take them along (LayoutResult.fixed). A stray has no line to break.
  function fishWithStray(): DiagramModel {
    const m = model('f');
    m.fishbone('e', 'Effect').category('c', 'Code').cause('a', 'A cause');
    const json = m.toJSON();
    return { ...json, nodes: [...json.nodes, { id: 'loose', name: 'Loose cause', type: 'fb-cause' }] };
  }
  const rfNodeOf = (container: HTMLElement, id: string) =>
    waitFor(() => {
      const el = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
      if (el === null) throw new Error(`${id} not rendered`);
      return el;
    });

  it('edit mode: a node on the fish cannot be dragged, a stray beneath it can', async () => {
    const { container } = render(<DiagramView model={fishWithStray()} notation="fishbone" mode="edit" edit={{ onNodesMoved: vi.fn() }} />);
    expect((await rfNodeOf(container, 'loose')).classList.contains('draggable')).toBe(true);
    for (const id of ['e', 'c', 'a']) expect((await rfNodeOf(container, id)).classList.contains('draggable'), id).toBe(false);
  });

  it('edit mode: a fish node still takes the press itself, so a jittery click selects it instead of panning', async () => {
    // React Flow lets a press on a non-draggable node pan the canvas, and a pan
    // of even one pixel swallows the click: the node would not select. In view
    // mode every node pans that way, the fish's included.
    const { container, unmount } = render(<DiagramView model={fishWithStray()} notation="fishbone" mode="edit" edit={{ onNodesMoved: vi.fn() }} />);
    expect((await rfNodeOf(container, 'c')).classList.contains('nopan')).toBe(true);
    unmount();
    const view = render(<DiagramView model={fishWithStray()} notation="fishbone" />);
    expect((await rfNodeOf(view.container, 'c')).classList.contains('nopan')).toBe(false);
  });

  it('edit mode: an arrow key never moves a node on the fish', async () => {
    const onNodesMoved = vi.fn();
    render(<DiagramView model={fishWithStray()} notation="fishbone" mode="edit" edit={{ onNodesMoved }} />);
    const code = await screen.findByText('Code');
    fireEvent.click(code);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(code, { key: 'ArrowRight' });
    await new Promise((r) => setTimeout(r, NUDGE_IDLE_MS + 100));
    expect(onNodesMoved).not.toHaveBeenCalled();
  });

  it('edit mode: a selection of fish nodes is offered no align or distribute', async () => {
    render(<DiagramView model={fishWithStray()} notation="fishbone" mode="edit" edit={{ onNodesMoved: vi.fn() }} />);
    fireEvent.click(await screen.findByText('Code'));
    fireEvent.keyDown(window, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.click(screen.getByText('A cause'), { shiftKey: true });
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' });
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node.selected').length).toBe(2));
    expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
  });

  it('draws a fish node where the fish put it, whatever position was once saved for it', async () => {
    const apiRef: { current: LayoutApi | null } = { current: null };
    const m = fishWithStray();
    const { rerender } = render(<DiagramView model={m} notation="fishbone" layoutApiRef={apiRef} />);
    await screen.findByText('Code');
    await waitFor(() => expect(apiRef.current?.snapshotPositions()['c']).toBeDefined());
    const laid = apiRef.current!.snapshotPositions();
    // the pin a jittery click used to leave behind, and one on the stray
    rerender(
      <DiagramView
        model={m}
        notation="fishbone"
        layoutApiRef={apiRef}
        layout={{ version: 1, planes: { default: { c: { x: 900, y: 900 }, loose: { x: 700, y: 700 } } } }}
      />,
    );
    await waitFor(() => expect(apiRef.current!.snapshotPositions()['loose']).toEqual({ x: 700, y: 700 }));
    expect(apiRef.current!.snapshotPositions()['c']).toEqual(laid['c']);
  });

  it('gives a fishbone leaf the layout geometry as its explicit size, and the effect the whole spine', async () => {
    const m = model('f');
    m.fishbone('e', 'Effect').category('c', 'Code').cause('a', 'A cause');
    const { container } = render(<DiagramView model={m.toJSON()} notation="fishbone" />);
    const cause = await waitFor(() => {
      const el = container.querySelector('.dg-fb-cause');
      if (el === null) throw new Error('cause not rendered');
      return el;
    });
    const rfCause = cause.closest('.react-flow__node') as HTMLElement;
    await waitFor(() => expect(rfCause.style.height).toBe(`${FISHBONE_LAYOUT.TEXT_H}px`));
    const head = await waitFor(() => {
      const el = container.querySelector('.dg-fb-head');
      if (el === null) throw new Error('head not rendered');
      return el;
    });
    const rfHead = head.closest('.react-flow__node') as HTMLElement;
    expect(rfHead.style.height).toBe(`${FISHBONE_LAYOUT.HEAD_H}px`);
    expect(parseFloat(rfHead.style.width)).toBeGreaterThan(FISHBONE_LAYOUT.HEAD_MIN_W + FISHBONE_LAYOUT.HEAD_GAP);
    // the bones are routed lines, not floating edges
    await waitFor(() => expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(2));
  });

  it('gives a DFD process and store the registry default size as their explicit DOM size', async () => {
    // The ellipse and the store's two rules are footprints, not label wrappers:
    // the wrapper must carry the reservation (registry defaultSize → elk →
    // inline width/height), or the shape would hug its label inside it. The
    // sketch path draws off the same measured box, so a rough ellipse spans it.
    const m = model('tm');
    const tm = m.threatModel();
    tm.process('p', 'Verify');
    tm.store('s', 'Users');
    const { container } = render(<DiagramView model={m.toJSON()} notation="threat-model" />);
    const rfProcess = await waitFor(() => {
      const el = container.querySelector('.dg-shape-ellipse')?.closest('.react-flow__node') as HTMLElement | null;
      if (el === null || el === undefined || el.style.width === '') throw new Error('process not laid out');
      return el;
    });
    expect(rfProcess.style.width).toBe('150px');
    expect(rfProcess.style.height).toBe('90px');
    const rfStore = container.querySelector('.dg-shape-store')?.closest('.react-flow__node') as HTMLElement;
    expect(rfStore.style.width).toBe('150px');
    expect(rfStore.style.height).toBe('56px');
  });

  it('never folds a trust boundary, with no pins at all', async () => {
    // A boundary is a line drawn AROUND things, not a drill level: folded, every
    // crossing flow would re-anchor to the boundary box and the elements the
    // crossings are about would leave the picture entirely. The registry's
    // `alwaysExpanded` (the activity-frame / git-lane precedent) is what
    // guarantees it — semantic zoom rests everything folded otherwise.
    const m = model('tm-fold');
    const tm = m.threatModel();
    tm.boundary('dmz', 'DMZ').contains(tm.process('web', 'Web app'));
    const { container } = render(<DiagramView model={m.toJSON()} notation="threat-model" />);
    // no `pins` prop: nothing but the registry flag can hold the boundary open
    expect(await screen.findByText('Web app')).toBeDefined();
    await waitFor(() => expect(container.querySelector('.dg-group')).not.toBeNull());
  });

  it('propagates rich runs, align and font scale onto the box label', async () => {
    const { container } = render(<DiagramView model={richModel()} />);
    await waitFor(() => {
      const b = container.querySelector('.dg-label b');
      if (b === null) throw new Error('rich not propagated into render data');
      expect(b.textContent).toBe('Server');
    });
    expect(container.querySelector('.dg-fs-lg')).toBeTruthy();
    expect((container.querySelector('.dg-label') as HTMLElement).style.textAlign).toBe('center');
  });

  // A plain box leaf gets no inline size in the DOM (it auto-sizes via CSS in a
  // real browser), so jsdom never reports a `.react-flow__node` height for one —
  // the size hint's only *observable* effect here is on the elk-computed layout,
  // which surfaces through an ancestor container's explicit style (containers
  // always get `style: {width, height}`). Render the same one-child container
  // twice, varying only the child's label, and confirm a multiline label whose
  // estimated block is taller than the default leaf slot reserves more room.
  it('reserves a taller slot for a multiline box', async () => {
    const wrapped = (name: string): DiagramModel => ({
      version: 1,
      id: 'ml',
      name: 'ml',
      nodes: [
        { id: 'c', name: 'c' },
        { id: 'a', name },
      ],
      containment: [{ parent: 'c', child: 'a' }],
      relations: [],
      layers: [],
      planes: [],
    });
    const containerHeight = async (name: string) => {
      const { unmount } = render(<DiagramView model={wrapped(name)} pins={{ c: 'expanded' }} />);
      const node = await waitFor(() => {
        const n = screen.getAllByText('c')[0]?.closest('.react-flow__node') as HTMLElement | null;
        if (n === null || n.style.height === '') throw new Error('container not laid out');
        return n;
      });
      const h = parseFloat(node.style.height);
      unmount();
      return h;
    };
    const single = await containerHeight('a');
    const multi = await containerHeight('line one\nline two\nline three\nline four\nline five');
    expect(multi).toBeGreaterThan(single);
  });

  it('keeps selection (and the image resizer) when derived nodes recompute', async () => {
    const view = (onResize: (id: string, w: number, h: number) => void) => (
      <DiagramView model={imageModel()} mode="edit" assetBase="/api/assets/" edit={{ onResize }} />
    );
    const { container, rerender } = render(view(vi.fn()));
    const img = await screen.findByRole('img', { name: 'logo' });
    fireEvent.click(img.closest('.react-flow__node') as HTMLElement);
    // clicking selects through React Flow's own onNodesChange pipeline; the
    // real NodeResizer then shows its corner controls
    await waitFor(() =>
      expect(container.querySelectorAll('.react-flow__resize-control').length).toBeGreaterThan(0),
    );
    // a new callback identity recomputes derivedNodes (exactly what the studio's
    // inline props do on every App render) — the resync must not wipe React
    // Flow's selection, or the resizer vanishes the instant anything re-renders
    rerender(view(vi.fn()));
    expect(container.querySelectorAll('.react-flow__resize-control').length).toBeGreaterThan(0);
  });

  it('surfaces image files dropped on the canvas with a flow position', async () => {
    const onImageFiles = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" edit={{ onImageFiles }} />,
    );
    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' });
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    fireEvent.drop(canvas, { dataTransfer: { files: [file] }, clientX: 200, clientY: 150 });
    await waitFor(() => expect(onImageFiles).toHaveBeenCalledTimes(1));
    const [files, position] = onImageFiles.mock.calls[0] as [File[], { x: number; y: number }];
    expect(files).toEqual([file]);
    expect(Number.isFinite(position.x)).toBe(true);
  });

  it('prevents the default navigation when a non-image file is dropped', async () => {
    const onImageFiles = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" edit={{ onImageFiles }} />,
    );
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    // dragOver already preventDefault()s to claim the drop; if drop doesn't
    // too, the browser navigates to the file and unsaved edits are gone.
    const notPrevented = fireEvent.drop(canvas, { dataTransfer: { files: [file] } });
    expect(onImageFiles).not.toHaveBeenCalled();
    expect(notPrevented).toBe(false);
  });

  it('surfaces pasted images at the viewport center, ignoring form-field paste', async () => {
    const onImageFiles = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" edit={{ onImageFiles }} />);
    const file = new File(['png-bytes'], 'shot.png', { type: 'image/png' });
    fireEvent.paste(document.body, { clipboardData: { files: [file] } });
    await waitFor(() => expect(onImageFiles).toHaveBeenCalledTimes(1));
    // paste while typing in an input must not create nodes
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.paste(input, { clipboardData: { files: [file] } });
    expect(onImageFiles).toHaveBeenCalledTimes(1);
  });

  it('creates a node at an edit-mode double-click on empty canvas', async () => {
    const onCreateAt = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" edit={{ onCreateAt }} />,
    );
    const pane = container.querySelector('.react-flow__pane') as HTMLElement;
    fireEvent.click(pane, { detail: 2, clientX: 240, clientY: 160 });
    await waitFor(() => expect(onCreateAt).toHaveBeenCalledTimes(1));
    const pos = onCreateAt.mock.calls[0]![0] as { x: number; y: number };
    expect(Number.isFinite(pos.x) && Number.isFinite(pos.y)).toBe(true);
  });

  it('does not create a node on a view-mode double-click', async () => {
    const onCreateAt = vi.fn();
    const { container } = render(<DiagramView model={containerEndpointModel()} edit={{ onCreateAt }} />);
    const pane = container.querySelector('.react-flow__pane') as HTMLElement;
    fireEvent.click(pane, { detail: 2, clientX: 240, clientY: 160 });
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it('hand-drawn: rough + font classes, per-preset class, font var', () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} styleId="hand-drawn" />);
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    expect(canvas.className).toContain('dg-style-hand-drawn');
    expect(canvas.className).toContain('dg-style-rough');
    expect(canvas.className).toContain('dg-style-font');
    expect(canvas.style.getPropertyValue('--dg-style-font')).toContain('Caveat');
  });

  it('blueprint: font + css vars, no rough chrome', () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} styleId="blueprint" />);
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    expect(canvas.className).toContain('dg-style-blueprint');
    expect(canvas.className).not.toContain('dg-style-rough');
    expect(canvas.style.getPropertyValue('--dg-canvas-bg')).toBe('#0d2740');
  });

  it('clean/unknown/absent styleId adds no style classes or vars', () => {
    for (const styleId of [undefined, 'clean', 'no-such-style']) {
      const { container, unmount } = render(
        <DiagramView model={containerEndpointModel()} {...(styleId === undefined ? {} : { styleId })} />,
      );
      const canvas = container.querySelector('.dg-canvas') as HTMLElement;
      expect(canvas.className).not.toMatch(/dg-style-/);
      expect(canvas.style.getPropertyValue('--dg-style-font')).toBe('');
      unmount();
    }
  });

  it('styleId="sketch" renders rough node chrome (legacy parity)', async () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} styleId="sketch" />);
    // once layout resolves, at least one node has a rough sketch shape
    await waitFor(() => expect(container.querySelector('svg.dg-sketch-shape')).not.toBeNull());
  });

  it('applies the causal-loop notation class when notation is set', async () => {
    const { container } = render(
      <DiagramView model={containerEndpointModel()} notation="causal-loop" />,
    );
    await screen.findByText('gw');
    expect(container.querySelector('.dg-notation-cld')).not.toBeNull();
  });

  it('renders no notation class when notation is unset', async () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} />);
    await screen.findByText('gw');
    expect(container.querySelector('.dg-notation-cld')).toBeNull();
  });

  it('opens the id returned from onCreateAt in canvas in-place rename mode', async () => {
    // the caller (studio) creates the node itself and hands back its id; the
    // view immediately opens it for rename, same as double-clicking an
    // existing node — no separate gesture needed to name a just-created node.
    const onCreateAt = vi.fn(() => 'api');
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" pins={{ sys: 'expanded' }} edit={{ onCreateAt }} />,
    );
    const pane = container.querySelector('.react-flow__pane') as HTMLElement;
    fireEvent.click(pane, { detail: 2, clientX: 240, clientY: 160 });
    const editor = (await screen.findByLabelText('Edit text')) as HTMLElement;
    expect(editor.textContent).toBe('api');
  });

  it('opens editLabelRequest\'s node for rename — a host that creates a node OUTSIDE the canvas (a panel button) still gets the caret in it', async () => {
    render(
      <DiagramView
        model={containerEndpointModel()}
        mode="edit"
        pins={{ sys: 'expanded' }}
        edit={{ editLabelRequest: { id: 'api', nonce: 1 } }}
      />,
    );
    const editor = (await screen.findByLabelText('Edit text')) as HTMLElement;
    expect(editor.textContent).toBe('api');
  });

  it('editLabelRequest also moves React Flow\'s selection — the ring and the `+` chip follow the node being named', async () => {
    // The host's select() only touches the host's own state; the chip, the ring
    // and the resizer render off React Flow's `selected` flag. Without the move,
    // a `+`/Tab chain would keep offering the chip on the source node.
    const m = containerEndpointModel();
    const { rerender } = render(<DiagramView model={m} mode="edit" pins={{ sys: 'expanded' }} edit={{}} />);
    fireEvent.click((await screen.findByText('gw')).closest('.react-flow__node') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="gw"].selected')).not.toBeNull());

    rerender(
      <DiagramView model={m} mode="edit" pins={{ sys: 'expanded' }} edit={{ editLabelRequest: { id: 'api', nonce: 1 } }} />,
    );
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="api"].selected')).not.toBeNull());
    expect(document.querySelector('.react-flow__node[data-id="gw"].selected')).toBeNull();
  });

  it('does not replay a stale editLabelRequest across a view/edit round-trip — only a new nonce reopens it', async () => {
    const m = containerEndpointModel();
    const { rerender } = render(
      <DiagramView model={m} mode="edit" pins={{ sys: 'expanded' }} edit={{ editLabelRequest: { id: 'api', nonce: 1 } }} />,
    );
    const box = (await screen.findByLabelText('Edit text')) as HTMLElement;
    fireEvent.blur(box); // commits/closes, same as the rich-text rename test above
    expect(screen.queryByLabelText('Edit text')).toBeNull();

    // leave edit mode: the host drops `mode` and `edit` together (as App.tsx does) —
    // `labelRequest` becomes undefined, but nothing tells the HOST'S state to forget
    // the request it already served.
    rerender(<DiagramView model={m} pins={{ sys: 'expanded' }} />);

    // back to edit mode with the identical, already-served {id, nonce: 1}: must NOT reopen.
    rerender(
      <DiagramView model={m} mode="edit" pins={{ sys: 'expanded' }} edit={{ editLabelRequest: { id: 'api', nonce: 1 } }} />,
    );
    expect(screen.queryByLabelText('Edit text')).toBeNull();

    // a genuinely new request (nonce bumped) still opens it.
    rerender(
      <DiagramView model={m} mode="edit" pins={{ sys: 'expanded' }} edit={{ editLabelRequest: { id: 'api', nonce: 2 } }} />,
    );
    expect(await screen.findByLabelText('Edit text')).toBeDefined();
  });

  it('ctrl/cmd-click on a node calls onCompareSelect and leaves selection untouched', async () => {
    // The compare gesture (dependency analysis) must bypass onSelect and the
    // drill double-click correlation entirely — it's a distinct, non-selecting
    // pick of a second variable.
    const onSelect = vi.fn();
    const onCompareSelect = vi.fn();
    render(
      <DiagramView
        model={containerEndpointModel()}
        onSelect={onSelect}
        onCompareSelect={onCompareSelect}
      />,
    );
    const sys = await screen.findByText('sys');
    fireEvent.click(sys, { ctrlKey: true });
    expect(onCompareSelect).toHaveBeenCalledWith('sys');

    const gw = await screen.findByText('gw');
    fireEvent.click(gw, { metaKey: true });
    expect(onCompareSelect).toHaveBeenCalledWith('gw');

    expect(onCompareSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hands the host canvas commands that press the same switches as the corner buttons', async () => {
    const cmdRef: { current: CanvasCommands | null } = { current: null };
    const m = model('t-canvas-commands');
    m.node('a', { name: 'A' });
    render(<DiagramView model={m.toJSON()} canvasCommandsRef={cmdRef} />);
    await waitFor(() => expect(cmdRef.current).not.toBeNull());
    const laser = await screen.findByLabelText('Laser pointer');
    expect(laser.getAttribute('aria-pressed')).toBe('false');
    let acted = false;
    act(() => {
      acted = cmdRef.current!.toggleLaser();
    });
    expect(acted).toBe(true);
    expect(laser.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      acted = cmdRef.current!.toggleDim();
    });
    expect(acted).toBe(true);
  });

  it('canvas commands report false when there is nothing for them to act on', async () => {
    const cmdRef: { current: CanvasCommands | null } = { current: null };
    const m = model('t-canvas-commands-idle');
    m.node('a', { name: 'A' });
    render(<DiagramView model={m.toJSON()} canvasCommandsRef={cmdRef} />);
    await waitFor(() => expect(cmdRef.current).not.toBeNull());
    const c = cmdRef.current!;
    expect(c.toggleLegend()).toBe(false); // no legend in this model
    expect(c.toggleDrawings()).toBe(false); // no strokes
    expect(c.toggleLoops()).toBe(false); // not a causal-loop diagram
    expect(c.align('left')).toBe(false); // nothing selected
    expect(c.distribute('x')).toBe(false);
  });

  it('shows the host\'s key hints on the corner controls, and drops its own (L) when built-in keys are off', async () => {
    const m = model('t-key-hints');
    m.node('a', { name: 'A' });
    const { rerender } = render(<DiagramView model={m.toJSON()} />);
    expect((await screen.findByLabelText('Laser pointer')).getAttribute('title')).toBe('Laser pointer (L)');
    rerender(<DiagramView model={m.toJSON()} builtinKeys={false} />);
    expect(screen.getByLabelText('Laser pointer').getAttribute('title')).toBe('Laser pointer');
    rerender(<DiagramView model={m.toJSON()} builtinKeys={false} keyHints={{ laser: 'K', dim: 'D' }} />);
    expect(screen.getByLabelText('Laser pointer').getAttribute('title')).toBe('Laser pointer (K)');
    // dimming starts ON (useLoopOverlay), so the control offers to stop it
    expect(screen.getByLabelText('Stop dimming unconnected on select').getAttribute('title')).toBe(
      'Stop dimming unconnected on select (D)',
    );
  });

  it('populates layoutApiRef with position + viewport accessors', async () => {
    const apiRef: { current: LayoutApi | null } = { current: null };
    const m = model('t-layout-api');
    const a = m.node('a', { name: 'A' });
    const b = m.node('b', { name: 'B' });
    m.relate(a, b, { kind: 'sync' });
    const json = m.toJSON();
    render(<DiagramView model={json} mode="edit" layoutApiRef={apiRef} />);
    await waitFor(() => expect(apiRef.current).not.toBeNull());
    await waitFor(() => expect(Object.keys(apiRef.current!.snapshotPositions()).length).toBeGreaterThan(0));
    const pos = apiRef.current!.snapshotPositions();
    expect(pos['a']).toBeDefined();
    expect(pos['b']).toBeDefined();
    expect(Object.keys(apiRef.current!.autoPositions()).length).toBeGreaterThan(0);
    expect(typeof apiRef.current!.viewportCenter).toBe('function');
  });

  // NOTE: containerEndpointModel's own boundary relation (gw -> sys) targets the
  // drill root itself, which scope.ts drops rather than stubs (there is nothing
  // off-frame to represent) — drilling into `sys` there never produces an
  // external, so it can't exercise this filter. promotedEndpointModel's b1 ->
  // shared-db relation crosses into a genuine sibling (B), which DOES produce
  // an external stub (`__ext__:B`) once drilled into A.
  it('drilled-view snapshotPositions excludes external stub ids (compiled.externals)', async () => {
    const apiRef: { current: LayoutApi | null } = { current: null };
    render(<DiagramView model={promotedEndpointModel()} layoutApiRef={apiRef} />);
    const a = await screen.findByText('A');
    // correlated double-click: two clicks on the same node/point (see the
    // plane-switch and container-drill tests above)
    fireEvent.click(a, { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByText('A'), { clientX: 10, clientY: 10, detail: 2 });
    // drilled: a1/shared-db are real content; B (outside A) stands in as a stub
    expect(await screen.findByText('a1')).toBeDefined();
    expect(await screen.findByText('B')).toBeDefined();
    await waitFor(() => expect(apiRef.current).not.toBeNull());
    await waitFor(() => expect(Object.keys(apiRef.current!.snapshotPositions()).length).toBeGreaterThan(0));
    const positions = apiRef.current!.snapshotPositions();
    expect(Object.keys(positions).some((id) => id.includes('__ext__'))).toBe(false);
  });

  it('snapGrid turns the background dots into the grid and marks it', async () => {
    const { container, rerender } = render(<DiagramView model={containerEndpointModel()} mode="edit" snapGrid={10} />);
    await screen.findByText('gw');
    expect(container.querySelector('.react-flow__background.dg-grid-on')).not.toBeNull();
    rerender(<DiagramView model={containerEndpointModel()} mode="edit" />);
    expect(container.querySelector('.react-flow__background.dg-grid-on')).toBeNull();
  });

  it('wires onColumnsChange on a db-table in edit mode to onSetTableColumns', async () => {
    const spy = vi.fn();
    const b = model('erd');
    b.table('a', { columns: [{ name: 'id', pk: true }] });
    const { findByText } = render(
      <DiagramView model={b.toJSON()} mode="edit" edit={{ onSetTableColumns: spy }} />,
    );
    // node rendering is async (elk layout resolves via a promise) — every other
    // test in this file awaits node text for the same reason.
    fireEvent.click(await findByText(/add column/i));
    expect(spy).toHaveBeenCalledWith('a', expect.arrayContaining([expect.objectContaining({ name: 'id' })]));
  });

  it('edit mode: arrow keys on a selected node commit one onNodesMoved after the idle window', async () => {
    const onNodesMoved = vi.fn();
    const apiRef: { current: LayoutApi | null } = { current: null };
    render(<DiagramView model={containerEndpointModel()} mode="edit" edit={{ onNodesMoved }} layoutApiRef={apiRef} />);
    const gw = await screen.findByText('gw');
    fireEvent.click(gw);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    const before = apiRef.current!.snapshotPositions()['gw']!;
    fireEvent.keyDown(gw, { key: 'ArrowRight' });
    fireEvent.keyDown(gw, { key: 'ArrowRight', shiftKey: true });
    expect(onNodesMoved).not.toHaveBeenCalled(); // waits out the idle window
    await waitFor(() => expect(onNodesMoved).toHaveBeenCalledTimes(1));
    // onNodesMoved now also reports each id's displacement from the arranged
    // geometry (`deltas`, task 11) — this test is about the positions arg, so
    // the deltas arg is matched loosely here.
    expect(onNodesMoved).toHaveBeenCalledWith(
      { gw: { x: before.x + NUDGE_STEP + NUDGE_STEP * NUDGE_SHIFT_FACTOR, y: before.y } },
      expect.anything(),
    );
  });

  it('edit mode: falls back to onNodeMoved per node when the host has no batch callback', async () => {
    const onNodeMoved = vi.fn();
    render(<DiagramView model={containerEndpointModel()} mode="edit" edit={{ onNodeMoved }} />);
    const gw = await screen.findByText('gw');
    fireEvent.click(gw);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(gw, { key: 'ArrowDown' });
    await waitFor(() => expect(onNodeMoved).toHaveBeenCalledWith('gw', expect.objectContaining({ x: expect.any(Number) })));
  });

  it('view mode: a nudge is reported as a view position without Alt', async () => {
    const onViewPositionsChange = vi.fn();
    render(<DiagramView model={containerEndpointModel()} onViewPositionsChange={onViewPositionsChange} />);
    const gw = await screen.findByText('gw');
    fireEvent.click(gw);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    fireEvent.keyDown(gw, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(onViewPositionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ gw: expect.anything() })),
    );
  });

  it('snapGrid makes a nudge step by the grid', async () => {
    const onNodesMoved = vi.fn();
    const apiRef: { current: LayoutApi | null } = { current: null };
    render(<DiagramView model={containerEndpointModel()} mode="edit" snapGrid={10} edit={{ onNodesMoved }} layoutApiRef={apiRef} />);
    const gw = await screen.findByText('gw');
    fireEvent.click(gw);
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).not.toBeNull());
    const before = apiRef.current!.snapshotPositions()['gw']!;
    fireEvent.keyDown(gw, { key: 'ArrowRight' });
    // deltas arg (task 11) matched loosely — this test is about the snapped position
    await waitFor(() =>
      expect(onNodesMoved).toHaveBeenCalledWith({ gw: { x: before.x + 10, y: before.y } }, expect.anything()),
    );
  });
});

describe('legend', () => {
  const legended = (): DiagramModel => {
    const m = model('l');
    m.layer('flow', { name: 'Data flow', tint: '#0ea5e9' });
    const a = m.node('a');
    const b = m.node('b');
    m.relate(a, b, { kind: 'sync' });
    m.relate(b, a, { kind: 'flow', layer: 'flow' });
    m.legend();
    return m.toJSON();
  };

  // A layer row only survives while it is off if the host can switch it back on,
  // so the tests that want to see one supply a handler.
  const noopToggle = () => {};

  it('shows the panel when the model declares a legend', async () => {
    render(<DiagramView model={legended()} onToggleLayer={noopToggle} />);
    expect(await screen.findByText('Legend')).toBeTruthy();
    expect(screen.getByText('Data flow')).toBeTruthy();
  });

  it('omits an inactive layer row when the host offers no toggle', async () => {
    // The published-page shape: chrome is on, but nothing can answer a click.
    render(<DiagramView model={legended()} />);
    expect(await screen.findByText('Legend')).toBeTruthy();
    expect(screen.getByText('sync')).toBeTruthy();
    expect(screen.queryByText('Data flow')).toBeNull();
  });

  it('shows an active layer row as a plain row when the host offers no toggle', async () => {
    render(<DiagramView model={legended()} activeLayers={['flow']} />);
    expect(await screen.findByText('Data flow')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Data flow' })).toBeNull();
  });

  it('hides the panel when the model declares none', async () => {
    const m = model('n');
    const a = m.node('a');
    const b = m.node('b');
    m.relate(a, b, { kind: 'sync' });
    render(<DiagramView model={m.toJSON()} />);
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy());
    expect(screen.queryByText('Legend')).toBeNull();
  });

  it('toggles the panel from the control button', async () => {
    render(<DiagramView model={legended()} onToggleLayer={noopToggle} />);
    const btn = await screen.findByRole('button', { name: 'Hide legend' });
    fireEvent.click(btn);
    expect(screen.queryByText('Data flow')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show legend' }));
    expect(screen.getByText('Data flow')).toBeTruthy();
  });

  it('offers no control button and no toggles without chrome', async () => {
    // The export shape: no chrome and no toggle handler, so the panel carries no
    // control button, no collapse caret and no clickable row.
    render(<DiagramView model={legended()} chrome={false} />);
    expect(await screen.findByText('Legend')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hide legend' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse legend' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Data flow' })).toBeNull();
  });

  // A diagram drawn in wordless shapes: no `legend` declared, and none needed for
  // the reader to be able to ask what a diamond is.
  const undeclaredEr = (): DiagramModel => {
    const m = model('library');
    const members = m.table('members', { columns: [{ name: 'id', type: 'uuid', pk: true }] });
    const loans = m.table('loans', { columns: [{ name: 'member_id', type: 'uuid', fk: true }] });
    m.fk(loans, 'member_id', members);
    return m.toJSON();
  };

  it('offers a hidden legend on an undeclared diagram of wordless shapes', async () => {
    render(<DiagramView model={undeclaredEr()} />);
    const btn = await screen.findByRole('button', { name: 'Show legend' });
    expect(screen.queryByText('Foreign key: many to one')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByText('Foreign key: many to one')).toBeTruthy();
    expect(screen.getByText('Primary key')).toBeTruthy();
  });

  it('keeps an undeclared legend out of an export', async () => {
    render(<DiagramView model={undeclaredEr()} chrome={false} />);
    await waitFor(() => expect(screen.getByText('members')).toBeTruthy());
    expect(screen.queryByText('Legend')).toBeNull();
  });

  it('reports a layer toggle from a legend row', async () => {
    const onToggleLayer = vi.fn();
    render(<DiagramView model={legended()} onToggleLayer={onToggleLayer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Data flow' }));
    expect(onToggleLayer).toHaveBeenCalledWith('flow');
  });
});

describe('view-mode position reporting', () => {
  // The drag itself is a React Flow pointer gesture that jsdom cannot drive, so
  // what is asserted here is the WIRING and the reset path — the two halves the
  // host depends on. The gesture end-to-end (drag → save → survives a recompile)
  // is verified in the browser; see docs/how-to/position-a-generated-diagram.md.
  it('reports an empty set on mount, so a host can seed its state', async () => {
    const onViewPositionsChange = vi.fn();
    render(<DiagramView model={containerEndpointModel()} onViewPositionsChange={onViewPositionsChange} />);
    await screen.findByText('sys');
    expect(onViewPositionsChange).toHaveBeenCalledWith({});
  });

  it('re-reports an empty set when the model changes, so stale drags cannot leak across diagrams', async () => {
    const onViewPositionsChange = vi.fn();
    const { rerender } = render(
      <DiagramView model={containerEndpointModel()} onViewPositionsChange={onViewPositionsChange} />,
    );
    await screen.findByText('sys');
    onViewPositionsChange.mockClear();

    rerender(<DiagramView model={promotedEndpointModel()} onViewPositionsChange={onViewPositionsChange} />);
    await screen.findByText('shared-db');
    expect(onViewPositionsChange).toHaveBeenCalledWith({});
  });
});

describe('freehand drawings', () => {
  const drawings = { version: 1 as const, planes: { default: [{ id: 'k1', points: [0, 0, 40, 40] }] } };

  it('draws the active plane strokes above the canvas and toggles them from the controls', async () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} drawings={drawings} />);
    const stroke = await waitFor(() => {
      const el = container.querySelector('path.dg-stroke');
      if (el === null) throw new Error('stroke not rendered');
      return el;
    });
    expect(stroke.getAttribute('data-stroke-id')).toBe('k1');
    const svg = container.querySelector('svg.dg-drawings') as SVGElement;
    expect(svg.style.display).toBe('');
    fireEvent.click(screen.getByLabelText('Hide drawings'));
    expect(svg.style.display).toBe('none');
    fireEvent.click(screen.getByLabelText('Show drawings'));
    expect(svg.style.display).toBe('');
  });

  it('offers no toggle when the plane has no strokes', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    await screen.findByText('gw');
    expect(screen.queryByLabelText('Hide drawings')).toBeNull();
  });

  it('hides the layer while drilled in', async () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} drawings={drawings} enteredPath={['sys']} />);
    await waitFor(() => expect(container.querySelector('svg.dg-drawings')).not.toBeNull());
    expect((container.querySelector('svg.dg-drawings') as SVGElement).style.display).toBe('none');
    // …and the switch goes with it: a control that flips an already-hidden layer
    // would report a state the canvas cannot honour.
    expect(screen.queryByLabelText('Hide drawings')).toBeNull();
    expect(screen.queryByLabelText('Show drawings')).toBeNull();
  });

  it('pen tool: a pointer gesture on the canvas reports one stroke with the pen settings', async () => {
    const onAddStroke = vi.fn();
    const { container } = render(
      <DiagramView
        model={containerEndpointModel()}
        mode="edit"
        tool="pen"
        pen={{ color: '#d9a520', width: 6 }}
        edit={{ onAddStroke }}
      />,
    );
    const pane = await waitFor(() => {
      const el = container.querySelector('.react-flow__pane');
      if (el === null) throw new Error('pane not rendered');
      return el as HTMLElement;
    });
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 50, clientY: 10 });
    fireEvent.pointerUp(pane, { pointerId: 1, clientX: 50, clientY: 10 });
    expect(onAddStroke).toHaveBeenCalledTimes(1);
    const stroke = onAddStroke.mock.calls[0]![0] as { points: number[]; color?: string; width: number };
    expect(stroke.color).toBe('#d9a520');
    expect(stroke.width).toBe(6);
    expect(stroke.points).toHaveLength(4);
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-tool-pen')).toBe(true);
  });

  it('pen tool: a gesture inside a drilled view draws nothing, because the layer is hidden there', async () => {
    const onAddStroke = vi.fn();
    const { container } = render(
      <DiagramView
        model={containerEndpointModel()}
        mode="edit"
        tool="pen"
        enteredPath={['sys']}
        edit={{ onAddStroke }}
      />,
    );
    const pane = await waitFor(() => {
      const el = container.querySelector('.react-flow__pane');
      if (el === null) throw new Error('pane not rendered');
      return el as HTMLElement;
    });
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 50, clientY: 10 });
    fireEvent.pointerUp(pane, { pointerId: 1, clientX: 50, clientY: 10 });
    expect(onAddStroke).not.toHaveBeenCalled();
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-tool-pen')).toBe(false);
  });

  it('eraser tool: clicking a stroke hit path reports its id', async () => {
    const onDeleteStroke = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" tool="eraser" drawings={drawings} edit={{ onDeleteStroke }} />,
    );
    const hit = await waitFor(() => {
      const el = container.querySelector('path.dg-stroke-hit');
      if (el === null) throw new Error('hit path not rendered');
      return el;
    });
    fireEvent.click(hit);
    expect(onDeleteStroke).toHaveBeenCalledWith('k1');
  });

  it('contentBounds grows to include strokes outside the nodes', async () => {
    const apiRef = { current: null as LayoutApi | null };
    const far = { version: 1 as const, planes: { default: [{ id: 'k1', points: [-500, -500, -490, -490], width: 4 }] } };
    render(<DiagramView model={containerEndpointModel()} drawings={far} layoutApiRef={apiRef} />);
    await waitFor(() => expect(apiRef.current?.contentBounds()).toBeDefined());
    const b = apiRef.current!.contentBounds()!;
    expect(b.x).toBe(-502);
    expect(b.y).toBe(-502);
    // …and it is a UNION, not the ink alone: the far corner of the box still
    // comes from the nodes, which all sit at or past the origin (the ink's own
    // right/bottom edge is -488).
    expect(b.x + b.width).toBeGreaterThan(0);
    expect(b.y + b.height).toBeGreaterThan(0);
  });

  it('fitView lands on the viewport that frames the content box', async () => {
    // The production fit path needs a measured canvas: jsdom reports 0×0, which
    // is exactly the case fitView falls back to React Flow's own on. Stub a real
    // frame so the branch the export handshake runs is the one under test.
    const rect = { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) };
    const original = HTMLElement.prototype.getBoundingClientRect;
    // Only the canvas FRAME is measured. What is drawn inside the viewport keeps
    // jsdom's empty rect: contentBounds also measures edge labels and captions
    // where they are drawn, and would read a blanket stub as a label the size of
    // the frame — at a flow position that moves with every viewport change.
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return this.closest('.react-flow__viewport') !== null ? original.call(this) : (rect as DOMRect);
    };
    try {
      const apiRef = { current: null as LayoutApi | null };
      const far = { version: 1 as const, planes: { default: [{ id: 'k1', points: [-500, -500, -490, -490], width: 4 }] } };
      const { container } = render(<DiagramView model={containerEndpointModel()} drawings={far} layoutApiRef={apiRef} />);
      await waitFor(() => expect(apiRef.current?.contentBounds()).toBeDefined());
      const bounds = apiRef.current!.contentBounds()!;
      // React Flow writes the transform imperatively as
      // `translate(<x>px,<y>px) scale(<zoom>)`; compare whitespace-insensitively
      // so a CSS-serialization difference isn't read as a wrong viewport.
      const transform = () =>
        (container.querySelector('.react-flow__viewport') as HTMLElement).style.transform.replace(/\s+/g, '');
      const expectTransform = async (v: { x: number; y: number; zoom: number }) => {
        await waitFor(() => expect(transform()).toBe(`translate(${v.x}px,${v.y}px)scale(${v.zoom})`));
      };

      apiRef.current!.fitView();
      await expectTransform(getViewportForBounds(bounds, 800, 600, 0.02, 4, 0.06));

      // The per-side form reserves px for an overlay (the legend handshake), so
      // it must reach getViewportForBounds as px padding, not a fraction.
      apiRef.current!.fitView({ top: 12 });
      const padded = getViewportForBounds(bounds, 800, 600, 0.02, 4, { top: '12px' });
      await expectTransform(padded);
      expect(padded).not.toEqual(getViewportForBounds(bounds, 800, 600, 0.02, 4, 0.06));
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it('the legend Drawings row toggles the same switch as the control button', async () => {
    const m = { ...containerEndpointModel(), legend: { show: ['layers' as const] } };
    const { container } = render(<DiagramView model={m} drawings={drawings} />);
    const row = await screen.findByRole('button', { name: 'Drawings' });
    const svg = container.querySelector('svg.dg-drawings') as SVGElement;
    fireEvent.click(row);
    expect(svg.style.display).toBe('none');
    expect(screen.getByLabelText('Show drawings')).toBeTruthy();
  });
});

describe('laser pointer', () => {
  const pane = (container: HTMLElement) =>
    waitFor(() => {
      const el = container.querySelector('.react-flow__pane');
      if (el === null) throw new Error('pane not rendered');
      return el as HTMLElement;
    });

  it('the control and the L key toggle it, Escape turns it off, a diagram switch resets it', async () => {
    const m = containerEndpointModel();
    const { container, rerender } = render(<DiagramView model={m} />);
    await screen.findByText('gw');
    const button = screen.getByLabelText('Laser pointer');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-tool-laser')).toBe(false);
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-tool-laser')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(window, { key: 'l' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'L' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(window, { key: 'l' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    rerender(<DiagramView model={{ ...m, id: 'other' }} />);
    expect(screen.getByLabelText('Laser pointer').getAttribute('aria-pressed')).toBe('false');
  });

  it('ignores the L key typed into a form field and with a modifier held', async () => {
    render(<DiagramView model={containerEndpointModel()} />);
    await screen.findByText('gw');
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'l' });
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    expect(screen.getByLabelText('Laser pointer').getAttribute('aria-pressed')).toBe('false');
    input.remove();
  });

  it('a drag with the laser on leaves a fading trail and never reaches the pen', async () => {
    const onAddStroke = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" tool="pen" edit={{ onAddStroke }} />,
    );
    const el = await pane(container);
    fireEvent.keyDown(window, { key: 'l' });
    // the laser takes the gesture over from the pen while it is on
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-tool-pen')).toBe(false);
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 50, clientY: 30 });
    expect(container.querySelector('g.dg-laser-trail.dg-laser-live')).not.toBeNull();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 30 });
    expect(container.querySelector('g.dg-laser-trail.dg-laser-fade')).not.toBeNull();
    expect(container.querySelector('g.dg-laser-trail.dg-laser-live')).toBeNull();
    expect(onAddStroke).not.toHaveBeenCalled();
    // …and hands it back when switched off
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-tool-pen')).toBe(true);
    fireEvent.pointerDown(el, { button: 0, pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 50, clientY: 10 });
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 50, clientY: 10 });
    expect(onAddStroke).toHaveBeenCalledTimes(1);
  });

  it('the corner control stays clickable while the pen is active, instead of drawing a dot', async () => {
    const onAddStroke = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" tool="pen" edit={{ onAddStroke }} />,
    );
    await pane(container);
    const button = screen.getByLabelText('Laser pointer');
    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(onAddStroke).not.toHaveBeenCalled();
  });

  it('stays available while drilled in — it is a light, not ink', async () => {
    render(<DiagramView model={containerEndpointModel()} enteredPath={['sys']} />);
    await screen.findByText('api');
    expect(screen.getByLabelText('Laser pointer')).toBeTruthy();
  });

  it('has no control in the chrome-less export', async () => {
    render(<DiagramView model={containerEndpointModel()} chrome={false} />);
    await screen.findByText('gw');
    expect(screen.queryByLabelText('Laser pointer')).toBeNull();
  });
});

describe('git-graph notation', () => {
  /** master: 1.0 → 2.0 (merges hf); hotfix: hf (from 1.0); nightly: n1 (from 1.0) */
  function gitModel() {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master', { name: 'Master', color: '#7ba7d9' });
    const hotfix = g.branch('hotfix', { name: 'Hotfix' });
    const nightly = g.branch('nightly', { name: 'Nightly' });
    const v10 = master.commit('1.0');
    const hf = hotfix.commit({ from: v10 });
    nightly.commit({ from: v10 });
    master.merge(hf, { tag: '2.0' });
    return m.toJSON();
  }

  it('lays lanes out as unfoldable bands with commit circles, routed links and the tails overlay', async () => {
    const m = gitModel();
    // a host pin to collapse a lane must lose: a lane is a row, not a box
    const { container } = render(<DiagramView model={m} plane="git-graph" notation="git-graph" pins={{ master: 'collapsed' }} />);
    await waitFor(() => expect(container.querySelectorAll('.dg-lane-label')).toHaveLength(3));
    expect([...container.querySelectorAll('.dg-lane-label')].map((el) => el.textContent)).toEqual(['Master', 'Hotfix', 'Nightly']);
    expect(container.querySelectorAll('.dg-circle-node')).toHaveLength(4);
    expect(container.querySelector('.dg-count')).toBeNull();
    expect(container.querySelector('.dg-canvas')?.classList.contains('dg-notation-git')).toBe(true);
    expect(container.querySelector('svg.dg-git-lanes')).not.toBeNull();
    // links are routed polylines (M/L/Q), never floating beziers (C)
    const paths = await waitFor(() => {
      const els = container.querySelectorAll('path.react-flow__edge-path');
      if (els.length === 0) throw new Error('edges not rendered');
      return els;
    });
    for (const p of paths) expect(p.getAttribute('d') ?? 'C').not.toContain('C');
  });

  it('colours commits and links by lane through the profile', async () => {
    const m = gitModel();
    const { container } = render(<DiagramView model={m} plane="git-graph" notation="git-graph" />);
    await waitFor(() => expect(container.querySelectorAll('.dg-circle-node')).toHaveLength(4));
    const circles = [...container.querySelectorAll('.dg-circle-node')] as HTMLElement[];
    expect(circles.some((c) => c.style.borderColor === 'rgb(123, 167, 217)')).toBe(true); // master's commits (jsdom normalizes hex to rgb, #7ba7d9)
    const strokes = await waitFor(() => {
      const els = [...container.querySelectorAll('path.react-flow__edge-path')].map((p) => p.getAttribute('style') ?? '');
      if (els.length === 0) throw new Error('edges not rendered');
      return els;
    });
    expect(strokes.some((s) => s.includes('#7ba7d9'))).toBe(true); // master's commit link
    expect(strokes.some((s) => s.includes('#d9534f'))).toBe(true); // hotfix palette colour on its branch/merge links
  });

  it('leaves elk in charge on a plane without a notation layout', async () => {
    const { container } = render(<DiagramView model={containerEndpointModel()} />);
    await screen.findByText('gw');
    expect(container.querySelector('svg.dg-git-lanes')).toBeNull();
    expect(container.querySelector('.dg-lane')).toBeNull();
    // guard the narrowness of the circle-sizing fix: an ordinary box leaf must
    // keep its CSS-natural sizing (no inline width forced on its RF wrapper)
    const gw = container.querySelector('.react-flow__node[data-id="gw"]') as HTMLElement | null;
    expect(gw?.style.width).toBe('');
  });

  it('floors an ordinary box at the width the layout reserved for it, without forcing one', async () => {
    // elk's routes and gaps are computed against the ESTIMATED box; a drawn box
    // narrower than that leaves an orthogonal arrow starting in mid-air beside it.
    // min-width (never width) closes the gap and still lets a label the estimate
    // undershot — another platform's font — grow the box instead of wrapping.
    const { container } = render(<DiagramView model={containerEndpointModel()} />);
    await screen.findByText('gw');
    const gw = await waitFor(() => {
      const n = container.querySelector('.react-flow__node[data-id="gw"]') as HTMLElement | null;
      if (n === null || n.style.minWidth === '') throw new Error('not laid out');
      return n;
    });
    expect(parseFloat(gw.style.minWidth)).toBeGreaterThanOrEqual(142);
    expect(gw.style.width).toBe('');
    expect(gw.style.height).toBe('');
  });

  describe('routed edges', () => {
    // a → b with c in between on the straight line: the route is what takes the
    // a → c edge around b
    function chain() {
      const m = model('routed');
      const a = m.node('a', { type: 'service' });
      const b = m.node('b', { type: 'service' });
      const c = m.node('c', { type: 'service' });
      m.relate(a, b, { kind: 'sync' });
      m.relate(b, c, { kind: 'sync' });
      m.relate(a, c, { kind: 'sync', label: 'skips b' });
      return m.toJSON();
    }
    const pathOf = (container: HTMLElement, id: string) =>
      waitFor(() => {
        const el = container.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`);
        if (el === null) throw new Error(`edge ${id} not rendered`);
        return el.getAttribute('d') ?? '';
      });

    it('draws the layout\'s route by default: the long edge bends around the box in its way', async () => {
      const { container } = render(<DiagramView model={chain()} />);
      await screen.findByText('a');
      const long = await waitFor(async () => {
        const d = await pathOf(container, 'a=>c:');
        if (d.includes('C')) throw new Error('still floating');
        return d;
      });
      // a routed path: straight legs joined by rounded (quadratic) corners
      expect(long).toContain('Q');
      expect(await pathOf(container, 'a=>b:')).not.toContain('C');
    });

    it('floats an edge whose endpoint no longer stands where the layout put it', async () => {
      // `c` was placed by hand: the route elk computed points at where c WAS
      const layout = { version: 1 as const, planes: { default: { c: { x: 900, y: 40 } } } };
      const { container } = render(<DiagramView model={chain()} layout={layout} />);
      await screen.findByText('a');
      await waitFor(async () => expect(await pathOf(container, 'a=>c:')).toContain('C'));
      // …while an edge between two untouched boxes keeps its route
      await waitFor(async () => expect(await pathOf(container, 'a=>b:')).not.toContain('C'));
    });

    it('floats everything where the notation bows its edges', async () => {
      const { container } = render(<DiagramView model={chain()} notation="causal-loop" />);
      await screen.findByText('a');
      await waitFor(async () => expect(await pathOf(container, 'a=>b:')).toContain('C'));
    });
  });

  it('a container gives way to a child placed past its wall, instead of the child leaving it', async () => {
    const pins = { sys: 'expanded' as const };
    const sysOf = (c: HTMLElement) =>
      waitFor(() => {
        const n = c.querySelector('.react-flow__node[data-id="sys"]') as HTMLElement | null;
        if (n === null || n.style.width === '') throw new Error('not laid out');
        return n;
      });
    const auto = render(<DiagramView model={containerEndpointModel()} pins={pins} />);
    const autoWidth = parseFloat((await sysOf(auto.container)).style.width);
    auto.unmount();
    // the same view with `api` saved 600px into a box elk made ~170 wide
    const layout = { version: 1 as const, planes: { default: { api: { x: 600, y: 40 } } } };
    const { container } = render(<DiagramView model={containerEndpointModel()} pins={pins} layout={layout} />);
    const sys = await sysOf(container);
    expect(autoWidth).toBeLessThan(600);
    expect(parseFloat(sys.style.width)).toBeGreaterThan(600 + 142);
  });

  it('sizes a commit circle leaf from the layout — it has no CSS-natural size', async () => {
    const m = gitModel();
    const { container } = render(<DiagramView model={m} plane="git-graph" notation="git-graph" />);
    await waitFor(() => expect(container.querySelectorAll('.dg-circle-node')).toHaveLength(4));
    const wrapper = container.querySelector('.react-flow__node[data-id="master-1"]') as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.width).toBe(`${GIT_LAYOUT.DIAMETER}px`);
    expect(wrapper?.style.height).toBe(`${GIT_LAYOUT.DIAMETER}px`);
  });

  it('sizes an EMPTY lane from the layout — compiled leaf, it would otherwise collapse to 0×0 and never show', async () => {
    const m = gitModel();
    m.nodes.push({ id: 'dev', name: 'Dev', type: 'branch' });
    const { container } = render(<DiagramView model={m} plane="git-graph" notation="git-graph" />);
    await waitFor(() => expect(container.querySelectorAll('.dg-lane-label')).toHaveLength(4));
    const empty = container.querySelector('.react-flow__node[data-id="dev"]') as HTMLElement | null;
    const full = container.querySelector('.react-flow__node[data-id="master"]') as HTMLElement | null;
    expect(empty?.style.height).toBe(`${GIT_LAYOUT.LANE}px`);
    expect(empty?.style.width).not.toBe('');
    expect(empty?.style.width).toBe(full?.style.width);
  });

  it('pins a dragged lane\'s descendant commits too, so their routed links fall back', async () => {
    // master: 1.0 -> 2.0 (its own commit link); nightly: n1 -> n2 (from 1.0, its
    // own commit link) — an independent lane whose link never touches master.
    const m = model('g3');
    const g = m.gitGraph();
    const master = g.branch('master', { name: 'Master' });
    const nightly = g.branch('nightly', { name: 'Nightly' });
    const v1 = master.commit('1.0');
    nightly.commit({ from: v1 });
    master.commit('2.0');
    nightly.commit();
    const built = m.toJSON();

    const { container } = render(
      <DiagramView
        model={built}
        plane="git-graph"
        notation="git-graph"
        layout={{ version: 1, planes: { 'git-graph': { master: { x: 10, y: 10 } } } }}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll('.dg-circle-node')).toHaveLength(4));
    const masterLink = await waitFor(() => {
      const el = container.querySelector('[data-testid="rf__edge-master-1=>master-2:"] path.react-flow__edge-path');
      if (el === null) throw new Error('master commit link not rendered');
      return el;
    });
    const nightlyLink = container.querySelector('[data-testid="rf__edge-nightly-1=>nightly-2:"] path.react-flow__edge-path');
    expect(nightlyLink).not.toBeNull();
    // master's lane is dragged (pinned) — its commits move with it, so their
    // precomputed route is stale: falls back to a floating (bezier, 'C') path.
    expect(masterLink.getAttribute('d') ?? '').toContain('C');
    // nightly is untouched — still on its precomputed routed (non-bezier) path.
    expect(nightlyLink?.getAttribute('d') ?? '').not.toContain('C');
  });

  it('view mode: double-click on a lane does not drill into it — a lane has no interior to enter', async () => {
    const m = gitModel();
    const onEnteredPathChange = vi.fn();
    const { container } = render(
      <DiagramView model={m} plane="git-graph" notation="git-graph" onEnteredPathChange={onEnteredPathChange} />,
    );
    await waitFor(() => expect(container.querySelectorAll('.dg-circle-node')).toHaveLength(4));
    // same correlated-click sequence the container drill test uses (a real
    // dblclick misfires here once the first click remounts the node)
    const label = await screen.findByText('Master');
    fireEvent.click(label, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByText('Master'), { clientX: 10, clientY: 10, detail: 2 });
    expect(screen.queryByLabelText('Nested zoom breadcrumb')).toBeNull();
    expect(onEnteredPathChange).not.toHaveBeenCalledWith(expect.arrayContaining(['master']));
    // a successful drill would scope the view to master's own commits only —
    // all 4 circles (across all three lanes) must still be on screen
    expect(container.querySelectorAll('.dg-circle-node')).toHaveLength(4);
  });
});

describe('activity diagrams', () => {
  /** frame ⊃ two lanes (a: one action, b: empty) — an empty lane is compiled
   * 'leaf' and must still render as a full band, never collapse to 0×0. */
  function activityModel() {
    const m = model('act');
    const act = m.activity('flow');
    const laneA = act.lane('a', { name: 'A' });
    act.lane('b', { name: 'B' });
    laneA.action('act1', 'Do it');
    return m.toJSON();
  }

  const looseBarModel = (): DiagramModel => ({
    version: 1,
    id: 'bar-only',
    name: 'bar-only',
    nodes: [{ id: 'b1', name: 'b1', type: 'activity-bar' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  });

  it('pins activity frames and lanes open without any pins prop', async () => {
    const { container } = render(<DiagramView model={activityModel()} />);
    // no `pins` prop at all — registry alwaysExpanded alone must keep both
    // lanes (and the frame) unfolded
    await waitFor(() => expect(container.querySelectorAll('.dg-activity-lane')).toHaveLength(2));
    expect(await screen.findByText('Do it')).toBeDefined();
  });

  it('activity lanes share one width (band pass applied)', async () => {
    const { container } = render(<DiagramView model={activityModel()} />);
    await waitFor(() => expect(container.querySelectorAll('.dg-activity-lane')).toHaveLength(2));
    const laneA = container.querySelector('.react-flow__node[data-id="a"]') as HTMLElement | null;
    const laneB = container.querySelector('.react-flow__node[data-id="b"]') as HTMLElement | null;
    await waitFor(() => {
      expect(laneA?.style.width).not.toBe('');
      expect(laneA?.style.width).toBe(laneB?.style.width);
    });
  });

  it('floats an edge inside a lane the band pass moved, and routes one inside a lane it left in place', async () => {
    // Two lanes, each holding two connected actions. The band pass (see
    // arrangeActivityFrames) stacks lanes edge to edge AFTER elk laid them out
    // with a gap between them: the first lane stays where elk put it, the second
    // is pulled up — and with it its children, whose route now points at where
    // they used to be. An edge draws its route only while both endpoints still
    // stand where the layout put them, so the first lane's edge is routed (a
    // straight 'L') and the second's falls back to the floating bezier ('C').
    const m = model('act-ortho');
    const act = m.activity('flow');
    const top = act.lane('a', { name: 'A' });
    const bottom = act.lane('b', { name: 'B' });
    act.flow(top.action('act1', 'Do it'), top.action('act2', 'Then this'));
    act.flow(bottom.action('act3', 'Meanwhile'), bottom.action('act4', 'And then'));
    const built = m.toJSON();

    const { container } = render(<DiagramView model={built} />);
    await waitFor(() => expect(container.querySelectorAll('.dg-activity-lane')).toHaveLength(2));
    const pathOf = (id: string) =>
      waitFor(() => {
        const el = container.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`);
        if (el === null) throw new Error('flow edge not rendered');
        return el.getAttribute('d') ?? '';
      });
    expect(await pathOf('act1=>act2:')).not.toContain('C');
    expect(await pathOf('act3=>act4:')).toContain('C');
  });

  it('a bar leaf gets its registry default size', async () => {
    const { container } = render(<DiagramView model={looseBarModel()} />);
    const wrapper = await waitFor(() => {
      const w = container.querySelector('.react-flow__node[data-id="b1"]') as HTMLElement | null;
      if (w === null) throw new Error('bar node not rendered');
      return w;
    });
    await waitFor(() => expect(wrapper.style.width).toBe('8px'));
    expect(wrapper.style.height).toBe('100px');
  });
});

/** a threat model: one threatened node inside a boundary, one clean node, and a
 * threatened flow between them — the three note cases in one picture */
const threatened: DiagramModel = {
  version: 1, id: 'tm', name: 'tm', notation: 'threat-model', layers: [], planes: [],
  nodes: [
    { id: 'web', name: 'Web app', type: 'tm-process', threats: [{ id: 't1', category: 'S', title: 'Spoofed session' }] },
    { id: 'db', name: 'Orders DB', type: 'tm-store' },
    { id: 'dmz', name: 'DMZ', type: 'tm-boundary' },
  ],
  containment: [{ parent: 'dmz', child: 'web' }],
  relations: [{ id: 'f', from: 'web', to: 'db', kind: 'data-flow', threats: [{ id: 't1', category: 'I', title: 'Plain-text' }] }],
};

/** a node's React Flow wrapper, once async layout has produced it. A plain
 * `waitFor(() => querySelector(...))` would not wait at all — waitFor retries on
 * a throw, not on a null return (see the `b1` bar-leaf case above). */
const rfNode = (container: HTMLElement, id: string): Promise<HTMLElement> =>
  waitFor(() => {
    const el = container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
    if (el === null) throw new Error(`${id} not rendered`);
    return el;
  });

/** the absolute flow coordinates React Flow wrote into a node wrapper's transform */
const xyOf = (el: HTMLElement): { x: number; y: number } => {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
  if (m === null) throw new Error(`no transform on ${el.getAttribute('data-id') ?? '?'}`);
  return { x: Number(m[1]), y: Number(m[2]) };
};

/** size the note wrappers like real bubbles for one test (jsdom measures every
 * element 800×600 — see test-setup.ts); returns the undo */
const measureNotes = (width: number, height: number): (() => void) => {
  const proto = window.HTMLElement.prototype;
  const was = {
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth')!,
    offsetHeight: Object.getOwnPropertyDescriptor(proto, 'offsetHeight')!,
  };
  const isNote = (el: HTMLElement) => el.getAttribute('data-id')?.startsWith('note:') === true;
  Object.defineProperties(proto, {
    offsetWidth: { get(this: HTMLElement) { return isNote(this) ? width : 800; }, configurable: true },
    offsetHeight: { get(this: HTMLElement) { return isNote(this) ? height : 600; }, configurable: true },
  });
  return () => Object.defineProperties(proto, was);
};

/** an overlay with `web`'s and the flow's bubbles open (the fixture's two threatened elements) */
const allOpen = (extra: Record<string, { dx: number; dy: number }> = {}) => {
  const key = layoutPlaneKey(threatened, undefined);
  return {
    version: 1 as const,
    planes: {},
    notes: {
      [key]: {
        'node:web': { dx: 0, dy: 0, ...extra['node:web'], open: true as const },
        'relation:f': { dx: 0, dy: 0, ...extra['relation:f'], open: true as const },
      },
    },
  };
};

describe('threat notes', () => {
  it('derives a note per threatened element, none for a clean one, and never over the element', async () => {
    const { container } = render(<DiagramView model={threatened} layout={allOpen()} pins={{ dmz: 'expanded' }} />);
    const note = await rfNode(container, 'note:node:web');
    expect(note).not.toBeNull();
    expect(note.textContent).toContain('Spoofed session');
    expect(container.querySelector('.react-flow__node[data-id="note:relation:f"]')).not.toBeNull();
    expect(container.querySelector('.react-flow__node[data-id="note:node:db"]')).toBeNull();
    // Inside the boundary there is no free spot the bubble's size (the header
    // band takes "above"), so it lands on the least-covering one — still next
    // to `web`, never on it: wholly above or wholly left of the element.
    const element = xyOf(await rfNode(container, 'web'));
    const at = xyOf(note);
    const height = estimateNoteHeight('Web app', threatened.nodes[0]!.threats!, false);
    expect(at.y + height <= element.y - NOTE_GAP || at.x + NOTE_WIDTH <= element.x - NOTE_GAP).toBe(true);
  });

  it('opens above-left of the badge, clear of the element, with the badge where the stylesheet puts it', async () => {
    // `web` on its own at the top level: nothing above it, so the first
    // candidate is free and the arithmetic is exact
    const alone: DiagramModel = { ...threatened, containment: [] };
    const { container } = render(<DiagramView model={alone} layout={allOpen()} />);
    const note = xyOf(await rfNode(container, 'note:node:web'));
    const element = xyOf(await rfNode(container, 'web'));
    // a tm-process is an ellipse: the badge is tucked in, not on the corner
    const badge = badgeCenter({ ...element, width: 0, height: 0 }, 'ellipse');
    expect(note.y + estimateNoteHeight('Web app', alone.nodes[0]!.threats!, false)).toBe(element.y - NOTE_GAP);
    expect(note.x + NOTE_WIDTH).toBe(badge.x + 24);
  });

  it('an aggregated edge gets no note — its threats belong to particular relations', async () => {
    // Two flows between the same visible pair fold into ONE arrow, and a note
    // on the bundle could not say which relation each threat belongs to.
    const model: DiagramModel = {
      ...threatened,
      relations: [
        ...threatened.relations,
        { id: 'g', from: 'web', to: 'db', kind: 'data-flow', threats: [{ id: 't1', category: 'T', title: 'Replayed write' }] },
      ],
    };
    // every bubble in play is OPEN here, the bundle's constituents included, so
    // the missing note below cannot be "closed by default" wearing a disguise
    const key = layoutPlaneKey(model, undefined);
    const layout = {
      version: 1 as const,
      planes: {},
      notes: {
        [key]: {
          'node:web': { dx: 0, dy: 0, open: true as const },
          'relation:f': { dx: 0, dy: 0, open: true as const },
          'relation:g': { dx: 0, dy: 0, open: true as const },
        },
      },
    };
    const { container } = render(<DiagramView model={model} layout={layout} pins={{ dmz: 'expanded' }} />);
    // wait for a note that IS derived, so the absence below is not just "the
    // canvas has not rendered yet"
    await rfNode(container, 'note:node:web');
    // ...and prove the two relations really did aggregate, or the missing note
    // would be missing for the wrong reason
    await waitFor(() => expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(1));
    expect(container.querySelector('[data-id^="note:relation:"]')).toBeNull();
  });

  it('a model node whose id starts with `note:` is an ordinary box', async () => {
    // The `note:` prefix is a convention, not a reservation: only the node TYPE
    // says the data channel holds NoteData. Reading a box's data as a note's
    // would throw on the click.
    const onSelect = vi.fn();
    const model: DiagramModel = {
      ...threatened,
      nodes: [...threatened.nodes, { id: 'note:x', name: 'Impostor', type: 'tm-store' }],
    };
    const { container } = render(<DiagramView model={model} onSelect={onSelect} />);
    const box = await rfNode(container, 'note:x');
    expect(box.textContent).toContain('Impostor');
    fireEvent.click(box);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', id: 'note:x' });
  });

  it('draws nothing closed, everything open — and never with notes={false}', async () => {
    const { container, rerender } = render(<DiagramView model={threatened} />);
    await screen.findByText('Web app');
    expect(container.querySelector('[data-id^="note:"]')).toBeNull();
    rerender(<DiagramView model={threatened} layout={allOpen()} />);
    await rfNode(container, 'note:node:web');
    rerender(<DiagramView model={threatened} layout={allOpen()} notes={false} />);
    await waitFor(() => expect(container.querySelector('[data-id^="note:"]')).toBeNull());
    // and with notes={false} the badge is not even a switch
    expect(container.querySelector('button.dg-threat-badge[data-state="open"]')).toBeNull();
  });

  it('view mode: the badge opens a bubble for the session and closes it again', async () => {
    const { container } = render(<DiagramView model={threatened} pins={{ dmz: 'expanded' }} />);
    const web = await rfNode(container, 'web');
    const badge = within(web).getByRole('button', { name: '1 open of 1 threat — show' });
    fireEvent.click(badge);
    await rfNode(container, 'note:node:web');
    expect(within(web).getByRole('button', { name: '1 open of 1 threat — hide' })).toBeDefined();
    fireEvent.click(within(web).getByRole('button', { name: '1 open of 1 threat — hide' }));
    await waitFor(() => expect(container.querySelector('[data-id="note:node:web"]')).toBeNull());
  });

  it('view mode: a flow’s chip toggles its relation’s bubble', async () => {
    const { container } = render(<DiagramView model={threatened} />);
    const chip = await waitFor(() => {
      const el = container.querySelector('button.dg-edge-threat[data-state="open"]');
      if (el === null) throw new Error('no chip');
      return el as HTMLElement;
    });
    fireEvent.click(chip);
    await rfNode(container, 'note:relation:f');
  });

  it('edit mode: the badge asks the host to save the state and draws nothing by itself', async () => {
    const onToggleNote = vi.fn();
    const { container } = render(<DiagramView model={threatened} mode="edit" edit={{ onToggleNote }} pins={{ dmz: 'expanded' }} />);
    const web = await rfNode(container, 'web');
    fireEvent.click(within(web).getByRole('button', { name: '1 open of 1 threat — show' }));
    expect(onToggleNote).toHaveBeenCalledWith({ node: 'web' }, true);
    await screen.findByText('Web app');
    expect(container.querySelector('[data-id="note:node:web"]')).toBeNull();
  });

  it('view mode: the badge closes a bubble the layout saved open, for the session', async () => {
    // The other direction of the session override: an override of `false` has
    // to beat a saved `open: true`, or a reader could never put down a bubble
    // the author left open.
    const { container } = render(<DiagramView model={threatened} layout={allOpen()} pins={{ dmz: 'expanded' }} />);
    await rfNode(container, 'note:node:web');
    const web = await rfNode(container, 'web');
    fireEvent.click(within(web).getByRole('button', { name: '1 open of 1 threat — hide' }));
    await waitFor(() => expect(container.querySelector('[data-id="note:node:web"]')).toBeNull());
  });

  it('entering edit mode drops the session toggles — edit mode shows what is saved', async () => {
    const { container, rerender } = render(<DiagramView model={threatened} pins={{ dmz: 'expanded' }} />);
    const web = await rfNode(container, 'web');
    fireEvent.click(within(web).getByRole('button', { name: '1 open of 1 threat — show' }));
    await rfNode(container, 'note:node:web');
    rerender(<DiagramView model={threatened} pins={{ dmz: 'expanded' }} mode="edit" edit={{ onToggleNote: vi.fn() }} />);
    await waitFor(() => expect(container.querySelector('[data-id="note:node:web"]')).toBeNull());
  });

  it('loading another diagram drops the session toggles — the keys are per model', async () => {
    // `node:web` names an element of THIS diagram; the next one is free to use
    // the same ids. The drill hook resets navigation on a model switch without
    // going through onPlaneSwitch, and the studio does not re-key the canvas,
    // so the map has to be cleared on the model too.
    const { container, rerender } = render(<DiagramView model={threatened} pins={{ dmz: 'expanded' }} />);
    const web = await rfNode(container, 'web');
    fireEvent.click(within(web).getByRole('button', { name: '1 open of 1 threat — show' }));
    await rfNode(container, 'note:node:web');
    rerender(<DiagramView model={{ ...threatened, id: 'tm2', name: 'tm2' }} pins={{ dmz: 'expanded' }} />);
    await waitFor(() => expect(container.querySelector('[data-id="note:node:web"]')).toBeNull());
  });

  it('a flow’s bubble hangs off its chip and its tail points there — from above by default, from below once dragged under it', async () => {
    // The chip sits on the routed curve, which only the edge knows: it reports
    // the spot up and the bubble anchors to it. jsdom measures every node
    // 800×600 (test-setup) and a bubble that size would swallow its own badge
    // and draw no tail, so size the note wrappers like real bubbles here.
    const restore = measureNotes(NOTE_WIDTH, 80);
    try {
      const a = render(<DiagramView model={threatened} layout={allOpen()} />);
      const chip = await waitFor(() => {
        const el = a.container.querySelector('button.dg-edge-threat') as HTMLElement | null;
        if (el === null) throw new Error('no chip');
        return xyOf(el);
      });
      // Which spot is free depends on the layout (web sits right above the
      // flow); what must hold is that the tail's tip lands on the chip's rim.
      await waitFor(() => {
        const note = a.container.querySelector('.react-flow__node[data-id="note:relation:f"]') as HTMLElement | null;
        if (note === null) throw new Error('no note');
        const at = xyOf(note);
        const d = note.querySelector('.dg-note-tail path')?.getAttribute('d') ?? '';
        const m = /L(-?[\d.]+) (-?[\d.]+) L/.exec(d);
        if (m === null) throw new Error(`no tail yet: ${d}`);
        const tip = { x: at.x + Number(m[1]), y: at.y + Number(m[2]) };
        expect(Math.hypot(tip.x - chip.x, tip.y - chip.y)).toBeCloseTo(BADGE_R + 2, 3);
        // and clear of the chip's pill: no candidate puts the bubble over it
        expect(at.y + estimateNoteHeight('Web app → Orders DB', threatened.relations[0]!.threats!, false) <= chip.y - BADGE_R || at.x + NOTE_WIDTH <= chip.x - BADGE_R).toBe(true);
      });
      a.unmount();
      const b = render(<DiagramView model={threatened} layout={allOpen({ 'relation:f': { dx: -110, dy: 60 } })} />);
      await waitFor(() => {
        const note = b.container.querySelector('.react-flow__node[data-id="note:relation:f"]') as HTMLElement | null;
        if (note === null) throw new Error('no note');
        expect(xyOf(note)).toEqual({ x: chip.x - 110, y: chip.y + 60 });
        expect(note.querySelector('.dg-note-tail')?.getAttribute('data-side')).toBe('top');
      });
    } finally {
      restore();
    }
  });

  it('a saved offset is measured from the badge, whatever the automatic spot would have been', async () => {
    // Relative to the badge, not to the automatic placement: a dragged bubble
    // stays put when a neighbour moves or another bubble opens and the
    // automatic spot would have changed. Parented like its element, so the
    // offset holds inside a container too.
    const { container } = render(
      <DiagramView model={threatened} layout={allOpen({ 'node:web': { dx: 40, dy: 30 } })} pins={{ dmz: 'expanded' }} />,
    );
    const moved = xyOf(await rfNode(container, 'note:node:web'));
    const element = xyOf(await rfNode(container, 'web'));
    const badge = badgeCenter({ ...element, width: 0, height: 0 }, 'ellipse');
    expect(moved).toEqual({ x: badge.x + 40, y: badge.y + 30 });
  });

  it('clicking a note selects its element, not the note', async () => {
    const onSelect = vi.fn();
    const { container } = render(<DiagramView model={threatened} layout={allOpen()} onSelect={onSelect} />);
    const note = await rfNode(container, 'note:relation:f');
    fireEvent.click(note);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'edge', constituentIds: ['f'] }));
    expect(container.querySelector('.react-flow__node[data-id="note:relation:f"].selected')).toBeNull();
  });

  it('edit mode: editThreatRequest opens that row; + and retitle reach the host', async () => {
    const onAddThreat = vi.fn();
    const onRetitleThreat = vi.fn();
    const edit = { onAddThreat, onRetitleThreat, editThreatRequest: { target: { node: 'web' } as ThreatTarget, id: 't1', nonce: 1 } };
    const { container } = render(<DiagramView model={threatened} layout={allOpen()} mode="edit" edit={edit} />);
    const input = (await screen.findByLabelText('Rename threat')) as HTMLInputElement;
    expect(input.value).toBe('Spoofed session');
    fireEvent.change(input, { target: { value: 'Session fixation' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRetitleThreat).toHaveBeenCalledWith({ node: 'web' }, 't1', 'Session fixation');
    // scoped to `web`'s note: every note carries a `+`, so a bare getAllByRole
    // would only prove that SOME note's button reached the host
    const webNote = await rfNode(container, 'note:node:web');
    fireEvent.click(within(webNote).getByRole('button', { name: 'Add a threat' }));
    expect(onAddThreat).toHaveBeenCalledWith({ node: 'web' });
  });

  it('edit mode: the status chip and the details fields reach the host', async () => {
    const onSetThreatStatus = vi.fn();
    const onEditThreatText = vi.fn();
    const { container } = render(
      <DiagramView model={threatened} layout={allOpen()} mode="edit" edit={{ onSetThreatStatus, onEditThreatText }} />,
    );
    const note = await rfNode(container, 'note:relation:f');
    fireEvent.click(within(note).getByRole('button', { name: 'Set status' }));
    expect(onSetThreatStatus).toHaveBeenCalledWith({ relation: 'f' }, 't1', 'mitigated');
    fireEvent.click(within(note).getByRole('button', { name: 'Show details' }));
    const desc = within(note).getByLabelText('Description');
    fireEvent.change(desc, { target: { value: 'Sniffable on the LAN' } });
    fireEvent.blur(desc);
    expect(onEditThreatText).toHaveBeenCalledWith({ relation: 'f' }, 't1', 'description', 'Sniffable on the LAN');
  });

  it('edit mode: an element with no threats yet offers the first one on the canvas', async () => {
    // The badge and the chip are the only way in for an element that has no
    // note yet, so the hook has to reach BOTH data channels (node and edge) —
    // this is what covers that threading end to end. `db` carries no threats
    // and neither does the second flow, so both draw the `+` state.
    const onAddThreat = vi.fn();
    const model: DiagramModel = {
      ...threatened,
      relations: [...threatened.relations, { id: 'g', from: 'db', to: 'web', kind: 'data-flow' }],
    };
    // `notation` is the host's (it resolves the active plane's — see
    // activeNotation), and the empty state is gated on it: only a threat
    // model's canvas carries the offer.
    const { container } = render(
      <DiagramView model={model} notation="threat-model" mode="edit" edit={{ onAddThreat }} />,
    );
    const db = await rfNode(container, 'db');
    fireEvent.click(within(db).getByRole('button', { name: 'Add a threat' }));
    expect(onAddThreat).toHaveBeenCalledWith({ node: 'db' });
    // the flow's chip rides the label portal, not the edge's own svg, so it is
    // queried from the canvas rather than scoped to an edge wrapper
    const chip = await waitFor(() => {
      const el = container.querySelector('button.dg-edge-threat[data-state="empty"]');
      if (el === null) throw new Error('no empty flow chip');
      return el as HTMLElement;
    });
    fireEvent.click(chip);
    expect(onAddThreat).toHaveBeenCalledWith({ relation: 'g' });
  });

  it('a note click moves React Flow’s own selection too — the ring, the chip and Backspace follow', async () => {
    // The note is not selectable, so React Flow's flag would otherwise stay on
    // whatever box was clicked before. deleteKeyCode/onDelete read THAT flag:
    // without the move, Backspace deletes the previous box while the panel
    // shows the element this note is about.
    const { container } = render(<DiagramView model={threatened} layout={allOpen()} mode="edit" edit={{}} />);
    fireEvent.click(await rfNode(container, 'db'));
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="db"].selected')).not.toBeNull());

    fireEvent.click(await rfNode(container, 'note:node:web'));
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="web"].selected')).not.toBeNull());
    expect(document.querySelector('.react-flow__node[data-id="db"].selected')).toBeNull();

    // a flow's note selects an EDGE, so no box may keep the ring
    fireEvent.click(await rfNode(container, 'note:relation:f'));
    await waitFor(() => expect(document.querySelector('.react-flow__node.selected')).toBeNull());
  });

  it('a palette drop that lands on a note nests nothing — a `note:` id is no containment parent', async () => {
    const onDropLibraryEntry = vi.fn();
    const { container } = render(
      <DiagramView model={threatened} layout={allOpen()} mode="edit" edit={{ onDropLibraryEntry }} />,
    );
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    const dropOn = (el: HTMLElement) => {
      // droppedOnNodeId reads document.elementFromPoint, which jsdom cannot
      // answer without layout — stand it on the element the drop landed on
      const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(el);
      fireEvent.drop(canvas, {
        dataTransfer: { types: [LIBRARY_ENTRY_DND_TYPE], getData: () => 'entry-1' },
        clientX: 120,
        clientY: 90,
      });
      spy.mockRestore();
    };
    dropOn(await rfNode(container, 'note:node:web'));
    expect(onDropLibraryEntry).toHaveBeenCalledTimes(1);
    expect(onDropLibraryEntry.mock.calls[0]![2]).toBeUndefined();
    // the guard is not "always undefined": a drop on a real box still nests
    dropOn(await rfNode(container, 'db'));
    expect(onDropLibraryEntry.mock.calls[1]![2]).toBe('db');
  });

  it('never reports notes in snapshotPositions', async () => {
    const ref = { current: null as LayoutApi | null };
    const { container } = render(<DiagramView model={threatened} layout={allOpen()} layoutApiRef={ref} />);
    // there IS a note on the canvas to leave out — without this the assertion
    // below would pass on an empty snapshot
    await rfNode(container, 'note:node:web');
    await waitFor(() => expect(ref.current?.snapshotPositions()['web']).toBeDefined());
    expect(Object.keys(ref.current!.snapshotPositions()).some((id) => id.startsWith('note:'))).toBe(false);
  });
});

describe('comment notes', () => {
  const commented: DiagramModel = {
    version: 1, id: 'd', name: 'd', layers: [], planes: [], containment: [],
    nodes: [
      { id: 'a', name: 'A', comments: [{ id: 'c1', text: 'Remark on A' }] },
      { id: 'b', name: 'B', links: [{ label: 'Doc', url: 'https://x' }] },
      { id: 'c', name: 'C' },
    ],
    relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', comments: [{ id: 'c1', text: 'Remark on r' }] }],
  };
  const open = (): LayoutOverlay => ({
    version: 1, planes: {},
    notes: { [layoutPlaneKey(commented, undefined)]: { 'node:a': { dx: 0, dy: 0, open: true }, 'node:b': { dx: 0, dy: 0, open: true }, 'relation:r': { dx: 0, dy: 0, open: true }, 'node:c': { dx: 0, dy: 0, open: true } } },
  });
  it('derives a bubble for a commented node, a linked node and a commented relation, none for a bare one', async () => {
    const { container } = render(<DiagramView model={commented} layout={open()} />);
    expect((await rfNode(container, 'note:node:a')).textContent).toContain('Remark on A');
    expect((await rfNode(container, 'note:node:b')).textContent).toContain('Doc');
    expect((await rfNode(container, 'note:relation:r')).textContent).toContain('Remark on r');
    expect(container.querySelector('.react-flow__node[data-id="note:node:c"]')).toBeNull();
  });
  it('the comment badge opens the bubble in view mode', async () => {
    const { container } = render(<DiagramView model={commented} />);
    await rfNode(container, 'a');
    expect(container.querySelector('.react-flow__node[data-id="note:node:a"]')).toBeNull();
    fireEvent.click(container.querySelector('.react-flow__node[data-id="a"] button.dg-comment-badge')!);
    expect(await rfNode(container, 'note:node:a')).not.toBeNull();
  });
  it('offers no threat on a comment-only bubble unless the canvas is a threat model', async () => {
    // The studio wires onAddThreat whatever the diagram is, so the gate has to
    // live here: a remark on a plain C4 box must not sprout a threat register
    // (nor have estimateNoteHeight reserve the row for one). The same gate
    // ThreatBadge and the studio's panels apply.
    const plain = render(<DiagramView model={commented} layout={open()} mode="edit" edit={{ onAddThreat: vi.fn() }} />);
    expect((await rfNode(plain.container, 'note:node:a')).querySelector('.dg-note-add')).toBeNull();
    plain.unmount();
    const tm = render(
      <DiagramView model={commented} layout={open()} notation="threat-model" mode="edit" edit={{ onAddThreat: vi.fn() }} />,
    );
    expect((await rfNode(tm.container, 'note:node:a')).querySelector('.dg-note-add')).not.toBeNull();
  });
  it('hands the host\'s onOpenLink to the bubble', async () => {
    const onOpenLink = vi.fn();
    const { container } = render(<DiagramView model={commented} layout={open()} onOpenLink={onOpenLink} />);
    fireEvent.click((await rfNode(container, 'note:node:b')).querySelector('a.dg-note-link')!);
    expect(onOpenLink).toHaveBeenCalledWith('https://x');
  });
});

describe('plan notation', () => {
  function plan() {
    const m = model('p');
    const p = m.plan();
    const alice = p.person('alice', 'Alice Ng');
    const q = p.zone('q', { name: 'Q1', start: '2026-01-05', end: '2026-01-30' }).owner(alice);
    const dep = p.zone('dep', { name: 'Dep', start: '2026-02-02', end: '2026-02-06' });
    m.relate(q, dep, { kind: 'sync' });
    return m.toJSON();
  }
  it('draws the dependency but never a role edge, shows the role chip, and mounts the time axis', async () => {
    const { container } = render(<DiagramView model={plan()} plane="plan" notation="plan" today="2026-01-20" />);
    await waitFor(() => expect(container.querySelector('.dg-time-axis')).not.toBeNull());
    await waitFor(() => expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(1));
    expect(container.querySelector('.dg-role-chip')?.textContent).toBe('O·Alice');
    expect(container.querySelector('.dg-time-axis-today')).not.toBeNull();
    expect(container.querySelector('.dg-notation-plan')).not.toBeNull();
  });
  it('draws no today line when the host passes null', async () => {
    const { container } = render(<DiagramView model={plan()} plane="plan" notation="plan" today={null} />);
    await waitFor(() => expect(container.querySelector('.dg-time-axis')).not.toBeNull());
    expect(container.querySelector('.dg-time-axis-today')).toBeNull();
  });
  it('reports each moved node\'s displacement from the arranged geometry alongside its position', async () => {
    const onNodesMoved = vi.fn();
    const { container } = render(<DiagramView model={plan()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved }} />);
    const dep = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('.react-flow__node[data-id="dep"]');
      if (el === null) throw new Error('not yet');
      return el;
    });
    // drive React Flow's drag pipeline the way the existing move tests do (see
    // the nudge tests in this file: select, then an ArrowRight nudge by
    // NUDGE_STEP). `dep` is a TOP-LEVEL zone (lockedX, not fixed), so it takes
    // the drag; the key target is the node itself — the nudge listener checks
    // `target.closest('.react-flow__node')`, which matches on the node div too.
    fireEvent.click(dep);
    await waitFor(() => expect(dep.classList.contains('selected')).toBe(true));
    fireEvent.keyDown(dep, { key: 'ArrowRight' });
    await waitFor(() => expect(onNodesMoved).toHaveBeenCalled());
    const [positions, deltas] = onNodesMoved.mock.calls[0]!;
    // the arranged x is `dep`'s date, laid out from the plan's origin (1 Jan of
    // the range's start year — see PlanGraph.origin, packages/core/src/plan.ts)
    const arrangedX = PLAN_LAYOUT.DAY * (dayOf('2026-02-02')! - dayOf('2026-01-01')!);
    expect(deltas.dep.dx).toBeCloseTo(positions.dep.x - arrangedX);
    expect(deltas.dep.dx).toBeCloseTo(NUDGE_STEP);
    expect(deltas.dep.dy).toBeCloseTo(0);
  });
  it('edit mode: a nested zone, an event and a roster person all stay draggable though the layout fixed them', async () => {
    // A person used to be excluded here (the roster never moved), but
    // drop-to-assign needs an actor's drag too now — it always snaps back
    // instead (see the DiagramView.test.tsx drop-to-assign tests below).
    const m = model('p');
    const p = m.plan();
    p.person('alice', 'Alice Ng');
    p.zone('q', { name: 'Q1', start: '2026-01-05', end: '2026-01-30' }).zone('design', { name: 'Design', start: '2026-01-05', end: '2026-01-09' });
    p.event('m1', { name: 'M1', at: '2026-01-15' });
    const { container } = render(<DiagramView model={m.toJSON()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn() }} />);
    const rfNode = (id: string) =>
      waitFor(() => {
        const el = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
        if (el === null) throw new Error(`${id} not rendered`);
        return el;
      });
    expect((await rfNode('design')).classList.contains('draggable')).toBe(true);
    expect((await rfNode('m1')).classList.contains('draggable')).toBe(true);
    expect((await rfNode('alice')).classList.contains('draggable')).toBe(true);
  });
  it('a childless zone is as wide as its dates: the layout sizes it, not its label', async () => {
    const { container } = render(<DiagramView model={plan()} plane="plan" notation="plan" today="2026-01-20" />);
    const wrapper = async (id: string) =>
      waitFor(() => {
        const el = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
        if (el === null || el.style.width === '') throw new Error(`${id} not laid out`);
        return el;
      });
    // dep: 2026-02-02..2026-02-06 inclusive = 5 days; q: 2026-01-05..2026-01-30 = 26 days
    expect((await wrapper('dep')).style.width).toBe(`${5 * PLAN_LAYOUT.DAY}px`);
    expect((await wrapper('q')).style.width).toBe(`${26 * PLAN_LAYOUT.DAY}px`);
  });
});

describe('plan notation: selecting an actor lights up its zones, and a zone its actors', () => {
  // alice owns `owned` only; bob executes `other` only — no relation of any
  // kind joins the two zones, so the only thing that could connect them
  // across a selection is the plan's `related` hook, not a drawn edge
  function planActors() {
    const m = model('pa');
    const p = m.plan();
    const alice = p.person('alice', 'Alice Ng', { color: '#2f6fed' });
    const bob = p.person('bob', 'Bob Lee');
    p.zone('owned', { name: 'Owned', start: '2026-01-05', end: '2026-01-09' }).owner(alice);
    p.zone('other', { name: 'Other', start: '2026-02-02', end: '2026-02-06' }).executor(bob);
    return m.toJSON();
  }
  const dimmed = (container: HTMLElement, id: string): boolean =>
    container.querySelector(`.react-flow__node[data-id="${id}"] .dg-focus-node-dim`) !== null;
  const hit = (container: HTMLElement, id: string): boolean =>
    container.querySelector(`.react-flow__node[data-id="${id}"] [data-plan-hit]`) !== null;

  it('selecting an actor keeps its zone bright and marked, dims an unrelated zone and actor', async () => {
    const { container } = render(<DiagramView model={planActors()} plane="plan" notation="plan" today="2026-01-20" />);
    const alice = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('.react-flow__node[data-id="alice"]');
      if (el === null) throw new Error('not yet');
      return el;
    });
    fireEvent.click(alice);
    await waitFor(() => expect(container.querySelector('.dg-focus-node-dim')).not.toBeNull());
    expect(dimmed(container, 'alice')).toBe(false); // the selected node itself
    expect(dimmed(container, 'owned')).toBe(false); // alice's own zone
    expect(dimmed(container, 'other')).toBe(true); // bob's zone, no relation to alice
    expect(dimmed(container, 'bob')).toBe(true); // an unrelated actor
    // the reciprocal mark: the chip alice's role made on `owned` goes solid,
    // and the zone itself is outlined in alice's colour
    const chip = container.querySelector('.react-flow__node[data-id="owned"] .dg-role-chip');
    expect(chip?.classList.contains('dg-role-chip-active')).toBe(true);
    expect(hit(container, 'owned')).toBe(true);
    expect(hit(container, 'other')).toBe(false);
  });

  it('selecting a zone marks its actor, dims an unrelated one', async () => {
    const { container } = render(<DiagramView model={planActors()} plane="plan" notation="plan" today="2026-01-20" />);
    const owned = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('.react-flow__node[data-id="owned"]');
      if (el === null) throw new Error('not yet');
      return el;
    });
    fireEvent.click(owned);
    await waitFor(() => expect(container.querySelector('.dg-focus-node-dim')).not.toBeNull());
    expect(dimmed(container, 'alice')).toBe(false); // owned's own actor
    expect(dimmed(container, 'other')).toBe(true);
    expect(dimmed(container, 'bob')).toBe(true);
    expect(hit(container, 'alice')).toBe(true); // the reciprocal mark, in alice's own colour
    expect(hit(container, 'bob')).toBe(false);
  });

  it('clears both the dim and the hit marks on a pane click', async () => {
    const { container } = render(<DiagramView model={planActors()} plane="plan" notation="plan" today="2026-01-20" />);
    const alice = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('.react-flow__node[data-id="alice"]');
      if (el === null) throw new Error('not yet');
      return el;
    });
    fireEvent.click(alice);
    await waitFor(() => expect(container.querySelector('.dg-focus-node-dim')).not.toBeNull());
    expect(hit(container, 'owned')).toBe(true);

    fireEvent.click(container.querySelector('.react-flow__pane') as HTMLElement);
    await waitFor(() => expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(0));
    expect(container.querySelector('[data-plan-hit]')).toBeNull();
    expect(container.querySelector('.dg-role-chip-active')).toBeNull();
  });
});

describe('the plan hit mark never leaks outside the plan notation', () => {
  it('a person node, selected-neighbour on a non-plan diagram, carries no data-plan-hit', async () => {
    // 'person' is an ordinary registry type (the C4 stencil, or this plain
    // pill) any diagram can use — not just a plan's roster. `a` is selected;
    // `person` is its one edge-neighbour, so it stays un-dimmed, but nothing
    // here is a plan plane, so the reciprocal outline must not appear.
    const m = model('c4ish');
    const a = m.node('a', { type: 'service' });
    const person = m.node('person', { type: 'person' });
    m.relate(a, person, { kind: 'sync' });
    const { container } = render(<DiagramView model={m.toJSON()} />);
    await screen.findByText('a');
    fireEvent.click(screen.getByText('a'));
    await waitFor(() => expect(container.querySelector('.react-flow__node[data-id="person"] .dg-focus-node-dim')).toBeNull());
    expect(container.querySelector('.react-flow__node[data-id="person"] [data-plan-hit]')).toBeNull();
    expect(container.querySelector('[data-plan-hit]')).toBeNull();
  });
});

describe('a droppable node is not clamped to its parent', () => {
  // q (zone) > design (nested zone); q > task (a plain node, not a zone/event)
  function nestedDropModel(): DiagramModel {
    const m = model('nested-drop');
    const p = m.plan();
    const q = p.zone('q', { name: 'Q1', start: '2026-01-05', end: '2026-01-30' });
    q.zone('design', { name: 'Design', start: '2026-01-05', end: '2026-01-09' });
    const task = m.node('task', { type: 'service' });
    q.contains(task);
    return m.toJSON();
  }

  // master > master-1: a non-plan notation with its OWN layout (gitLayout) and
  // real containment (BranchRef.commit addContainment's the commit under its
  // branch) but no dropTarget/canDrop — the clamp must stay exactly as before.
  function gitNestedModel(): DiagramModel {
    const m = model('git-nested');
    const g = m.gitGraph();
    g.branch('master', { name: 'Master' }).commit('1.0');
    return m.toJSON();
  }

  type RfNode = { id: string; extent?: string; expandParent?: boolean };
  const nodesOf = () => dragCapture.props['nodes'] as RfNode[];

  it('a plain node nested in a zone carries no extent on a plan profile', async () => {
    const { container } = render(
      <DiagramView model={nestedDropModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
    );
    await waitFor(() => expect(container.querySelector('.react-flow__node[data-id="task"]')).not.toBeNull());
    const task = nodesOf().find((n) => n.id === 'task');
    expect(task?.extent).toBeUndefined();
  });

  it('a nested zone still carries extent: parent — the exemption is for a droppable node, not every child', async () => {
    const { container } = render(
      <DiagramView model={nestedDropModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
    );
    await waitFor(() => expect(container.querySelector('.react-flow__node[data-id="design"]')).not.toBeNull());
    const design = nodesOf().find((n) => n.id === 'design');
    expect(design?.extent).toBe('parent');
  });

  it('a nested node on a non-plan fixture still carries extent: parent', async () => {
    const { container } = render(
      <DiagramView model={gitNestedModel()} plane="git-graph" notation="git-graph" mode="edit" edit={{ onNodesMoved: vi.fn() }} />,
    );
    await waitFor(() => expect(container.querySelector('.react-flow__node[data-id="master-1"]')).not.toBeNull());
    const commit = nodesOf().find((n) => n.id === 'master-1');
    expect(commit?.extent).toBe('parent');
  });
});

describe('drop-to-assign', () => {
  // one top-level zone with a nested zone, a roster actor with no role yet,
  // and a plain (non-plan-typed) node with no zone of its own
  function assignModel() {
    const m = model('assign');
    const p = m.plan();
    p.person('alice', 'Alice Ng');
    const q = p.zone('q', { name: 'Q1', start: '2026-01-05', end: '2026-01-30' });
    q.zone('design', { name: 'Design', start: '2026-01-05', end: '2026-01-09' });
    m.node('task', { type: 'service' });
    return m.toJSON();
  }

  // two ROOT zones — free on y, per planLayout, so nothing stacks them apart
  // the way a nested zone is kept inside its parent's bar
  function twoZonesModel() {
    const m = model('assign2');
    const p = m.plan();
    p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-01-09' });
    p.zone('q2', { name: 'Q2', start: '2026-02-02', end: '2026-02-06' });
    return m.toJSON();
  }

  // a plain node already nested in zone A, plus an unrelated root zone B
  // (neither zone the other's ancestor) — the re-homing case `canDrop`
  // (unlike the old `fixed`-based gate) lets through
  function nestedPlainModel() {
    const m = model('assign3');
    const p = m.plan();
    const a = p.zone('a', { name: 'A', start: '2026-01-05', end: '2026-01-09' });
    const task = m.node('task', { type: 'service' });
    a.contains(task);
    p.zone('b', { name: 'B', start: '2026-02-02', end: '2026-02-06' });
    return m.toJSON();
  }

  // alice already owns 'owned'; 'other' is unrelated — the exclusion under
  // test (dropTargetFor's exclude set widened with profile.related) is about
  // roles already held, not containment
  function ownedZoneModel() {
    const m = model('assign-owned');
    const p = m.plan();
    const alice = p.person('alice', 'Alice Ng');
    p.zone('owned', { name: 'Owned', start: '2026-01-05', end: '2026-01-09' }).owner(alice);
    p.zone('other', { name: 'Other', start: '2026-02-02', end: '2026-02-06' });
    return m.toJSON();
  }

  type RfNode = { id: string; position: { x: number; y: number }; parentId?: string };
  const nodeOf = (id: string): RfNode => dragCapture.instance.getNodes().find((n: RfNode) => n.id === id);
  const absOf = (id: string) => dragCapture.instance.getInternalNode(id)!.internals.positionAbsolute as { x: number; y: number };

  /** the target node exists AND has been measured — safe to read positions off */
  const settle = (container: HTMLElement, id: string) =>
    waitFor(() => {
      if (container.querySelector(`.react-flow__node[data-id="${id}"]`) === null) throw new Error(`${id} not yet`);
      if (dragCapture.instance?.getInternalNode(id)?.internals.positionAbsolute === undefined) throw new Error(`${id} not measured`);
    });

  /**
   * Drives one full drag→drop gesture through DiagramView's own captured
   * onNodesChange/onNodeDragStop (see the mock above onNodesChange applies
   * `to` as the node's on-screen (parent-relative) position, exactly as
   * React Flow's own drag would; `pointerFlow` is the ABSOLUTE flow point the
   * mouse released over — screenToFlowPosition/flowToScreenPosition are exact
   * inverses of each other on the SAME live instance, so the hit test inside
   * onNodeDragStop lands on exactly this point whatever transform the
   * auto-fit-on-mount landed on under jsdom's zero-size viewport.
   */
  async function drag(id: string, to: { x: number; y: number }, pointerFlow: { x: number; y: number }) {
    const pointer = dragCapture.instance.flowToScreenPosition(pointerFlow);
    act(() => dragCapture.props['onNodesChange']([{ type: 'position', id, position: to, dragging: true }]));
    const node = await waitFor(() => {
      const n = nodeOf(id);
      if (n === undefined || n.position.x !== to.x || n.position.y !== to.y) throw new Error('not applied yet');
      return n;
    });
    act(() => dragCapture.props['onNodeDragStop']({ clientX: pointer.x, clientY: pointer.y }, node, [node]));
  }

  it('an actor dragged and dropped over a zone reports onDropInto once, not onNodesMoved, and snaps back', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'q');
    await settle(container, 'alice');
    const before = nodeOf('alice').position;
    const qAbs = absOf('q');
    const dropAt = { x: qAbs.x + 10, y: qAbs.y + 10 };
    await drag('alice', dropAt, dropAt);

    expect(onDropInto).toHaveBeenCalledTimes(1);
    expect(onDropInto).toHaveBeenCalledWith('alice', 'q', { x: 10, y: 10 });
    expect(onNodesMoved).not.toHaveBeenCalled();
    expect(nodeOf('alice').position).toEqual(before);
  });

  it('an actor dragged and dropped over empty canvas reports no drop, no move, and snaps back', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'q');
    await settle(container, 'alice');
    const before = nodeOf('alice').position;
    const qAbs = absOf('q');
    // far outside every zone's box (jsdom's ResizeObserver shim measures
    // every node at a flat 800x600 — see test-setup.ts — so "outside" means
    // well past that, not past the zone's own real, laid-out size)
    const missAt = { x: qAbs.x + 5000, y: qAbs.y + 5000 };
    await drag('alice', missAt, missAt);

    expect(onDropInto).not.toHaveBeenCalled();
    expect(onNodesMoved).not.toHaveBeenCalled();
    expect(nodeOf('alice').position).toEqual(before);
  });

  it('a plain node dropped over a zone that is not its parent reports onDropInto, not onNodesMoved', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'q');
    await settle(container, 'task');
    const qAbs = absOf('q');
    const dropAt = { x: qAbs.x + 10, y: qAbs.y + 10 };
    await drag('task', dropAt, dropAt);

    expect(onDropInto).toHaveBeenCalledTimes(1);
    expect(onDropInto).toHaveBeenCalledWith('task', 'q', { x: 10, y: 10 });
    expect(onNodesMoved).not.toHaveBeenCalled();
  });

  // The `canDrop`-not-`fixed` distinction: a plain node ALREADY nested in a
  // zone is still `fixed` (planLayout reads its saved spot itself), but it is
  // not a zone or an event, so canDrop says it may still be re-homed to a
  // DIFFERENT zone by this gesture — the case the old `fixed`-based gate
  // wrongly blocked.
  it('a plain node nested in zone A dropped over zone B (not its ancestor) reports onDropInto, not onNodesMoved', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={nestedPlainModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'a');
    await settle(container, 'b');
    await settle(container, 'task');
    const aAbs = absOf('a');
    const bAbs = absOf('b');
    // task's on-screen position stays parent-relative to its CURRENT parent
    // (a) through the drag — only a committed command reparents it — chosen
    // so its ABSOLUTE position lands exactly at b's origin + (10, 10)
    const to = { x: bAbs.x + 10 - aAbs.x, y: bAbs.y + 10 - aAbs.y };
    const pointerFlow = { x: bAbs.x + 10, y: bAbs.y + 10 };
    await drag('task', to, pointerFlow);

    // `rel` itself (draggedAbs − targetAbs) is exercised numerically by the
    // root-level cases above; it is not re-checked here because a NESTED
    // dragged node's `internals.positionAbsolute` only gets recomputed off
    // its parent's by React Flow's OWN drag pipeline (XYDrag) — a real
    // gesture keeps it live, but this harness drives onNodesChange directly
    // (jsdom cannot drive a pointer gesture at all — see above), so it stays
    // at 'task's pre-drag absolute. What this case is actually proving —
    // `canDrop`, not `fixed`, gates re-homing a nested node — needs only the
    // id/target, not the exact offset.
    expect(onDropInto).toHaveBeenCalledTimes(1);
    const [id, targetId, rel] = onDropInto.mock.calls[0]!;
    expect(id).toBe('task');
    expect(targetId).toBe('b');
    expect(rel).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    expect(onNodesMoved).not.toHaveBeenCalled();
  });

  it('a nested zone dropped over its parent reports no drop — the date move still works', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'q');
    await settle(container, 'design');
    const qAbs = absOf('q');
    const designBefore = nodeOf('design').position; // parent-relative to q
    const to = { x: designBefore.x + 5, y: designBefore.y + 5 };
    const pointerFlow = { x: qAbs.x + to.x, y: qAbs.y + to.y };
    await drag('design', to, pointerFlow);

    expect(onDropInto).not.toHaveBeenCalled();
    expect(onNodesMoved).toHaveBeenCalledTimes(1);
    expect(onNodesMoved.mock.calls[0]![0]).toHaveProperty('design');
  });

  // Beyond the plan's five listed cases: the Global ruling ("zones/events are
  // never dropped into anything") is not exercised by the parent-exclusion
  // case above — a ROOT zone has no parent to exclude, and the ledger calls
  // this out explicitly ("root zones overlap on y"), so it gets its own case.
  it('a root zone dragged near an unrelated zone reports no drop — its own drag is always the date move', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={twoZonesModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'q1');
    await settle(container, 'q2');
    const q2Abs = absOf('q2');
    const dropAt = { x: q2Abs.x + 10, y: q2Abs.y + 10 };
    await drag('q1', dropAt, dropAt);

    expect(onDropInto).not.toHaveBeenCalled();
    expect(onNodesMoved).toHaveBeenCalledTimes(1);
    expect(onNodesMoved.mock.calls[0]![0]).toHaveProperty('q1');
  });

  it('a non-plan model: dragging a node never reports onDropInto, onNodesMoved fires exactly as before', async () => {
    const onNodesMoved = vi.fn();
    const onDropInto = vi.fn();
    const { container } = render(
      <DiagramView model={containerEndpointModel()} mode="edit" edit={{ onNodesMoved, onDropInto }} />,
    );
    await settle(container, 'gw');
    const before = nodeOf('gw').position;
    const to = { x: before.x + 40, y: before.y + 30 };
    await drag('gw', to, to);

    expect(onDropInto).not.toHaveBeenCalled();
    expect(onNodesMoved).toHaveBeenCalledTimes(1);
    expect(onNodesMoved.mock.calls[0]![0]).toEqual({ gw: to });
  });

  // The drag-over outline (onNodeDrag/withDropTarget/data-drop-target): driven
  // directly through the captured onNodeDrag, the same way the cases above
  // drive onNodeDragStop — a real pointer move is one MouseEvent-shaped frame
  // per position, so a `point` is turned into the same {clientX, clientY} the
  // drop() helper already derives from flowToScreenPosition.
  describe('the drag-over outline', () => {
    const flagOf = (id: string): boolean | undefined =>
      (dragCapture.instance.getNodes().find((n: RfNode) => n.id === id)?.data as { dropTarget?: boolean } | undefined)?.dropTarget;
    // data-drop-target lands on DiagramNode's own root (.dg-group/.dg-node),
    // a child of React Flow's `.react-flow__node` wrapper, not the wrapper
    // itself — same reason the CSS rule (.dg-notation-plan [data-drop-target])
    // is a descendant selector.
    const domFlagOf = (container: HTMLElement, id: string): boolean =>
      container.querySelector(`.react-flow__node[data-id="${id}"] [data-drop-target]`) !== null;
    const frameAt = (flow: { x: number; y: number }) => {
      const p = dragCapture.instance.flowToScreenPosition(flow);
      return { clientX: p.x, clientY: p.y };
    };

    it('a single actor drag over a zone flags it (data + DOM); moving off clears the flag', async () => {
      const { container } = render(
        <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
      );
      await settle(container, 'q');
      await settle(container, 'alice');
      const alice = nodeOf('alice');
      const qAbs = absOf('q');
      const overQ = frameAt({ x: qAbs.x + 10, y: qAbs.y + 10 });
      act(() => dragCapture.props['onNodeDrag'](overQ, alice, [alice]));
      await waitFor(() => expect(flagOf('q')).toBe(true));
      expect(domFlagOf(container, 'q')).toBe(true);

      // far outside every zone (see the 'reports no drop' case above for why)
      const miss = frameAt({ x: qAbs.x + 5000, y: qAbs.y + 5000 });
      act(() => dragCapture.props['onNodeDrag'](miss, alice, [alice]));
      await waitFor(() => expect(flagOf('q')).not.toBe(true));
      expect(domFlagOf(container, 'q')).toBe(false);
    });

    it('a second frame over the same zone does not touch the nodes array — the change-only guard', async () => {
      const { container } = render(
        <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
      );
      await settle(container, 'q');
      await settle(container, 'alice');
      const alice = nodeOf('alice');
      const qAbs = absOf('q');
      const overQ = frameAt({ x: qAbs.x + 10, y: qAbs.y + 10 });
      act(() => dragCapture.props['onNodeDrag'](overQ, alice, [alice]));
      await waitFor(() => expect(flagOf('q')).toBe(true));
      const nodesAfterFirstFrame = dragCapture.props['nodes'];

      // same point again: the target hasn't changed, so onNodeDrag's own
      // `target === dropTargetRef.current` short-circuit must fire before
      // withDropTarget ever runs — no new array, not even a new node inside it.
      act(() => dragCapture.props['onNodeDrag'](overQ, alice, [alice]));
      expect(dragCapture.props['nodes']).toBe(nodesAfterFirstFrame);
    });

    it('a multi-node drag sets no drop-target flag', async () => {
      const { container } = render(
        <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
      );
      await settle(container, 'q');
      await settle(container, 'alice');
      await settle(container, 'task');
      const alice = nodeOf('alice');
      const task = nodeOf('task');
      const qAbs = absOf('q');
      const overQ = frameAt({ x: qAbs.x + 10, y: qAbs.y + 10 });
      act(() => dragCapture.props['onNodeDrag'](overQ, alice, [alice, task]));
      expect(flagOf('q')).not.toBe(true);
      expect(domFlagOf(container, 'q')).toBe(false);
    });

    it('onNodeDragStop clears the flag', async () => {
      const { container } = render(
        <DiagramView model={assignModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
      );
      await settle(container, 'q');
      await settle(container, 'alice');
      const alice = nodeOf('alice');
      const qAbs = absOf('q');
      const overQ = frameAt({ x: qAbs.x + 10, y: qAbs.y + 10 });
      act(() => dragCapture.props['onNodeDrag'](overQ, alice, [alice]));
      await waitFor(() => expect(flagOf('q')).toBe(true));
      act(() => dragCapture.props['onNodeDragStop'](overQ, alice, [alice]));
      await waitFor(() => expect(flagOf('q')).not.toBe(true));
      expect(domFlagOf(container, 'q')).toBe(false);
    });

    it('onNodeDrag is undefined on a non-plan fixture, and in view mode', async () => {
      const { container: editContainer } = render(
        <DiagramView model={containerEndpointModel()} mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
      );
      await settle(editContainer, 'gw');
      expect(dragCapture.props['onNodeDrag']).toBeUndefined();

      const { container: viewContainer } = render(
        <DiagramView model={assignModel()} plane="plan" notation="plan" edit={{ onNodesMoved: vi.fn(), onDropInto: vi.fn() }} />,
      );
      await settle(viewContainer, 'q');
      expect(dragCapture.props['onNodeDrag']).toBeUndefined();
    });

    it('an actor dragged over a zone it already holds a role on gets no outline and no drop; over another zone, both', async () => {
      const onDropInto = vi.fn();
      const { container } = render(
        <DiagramView model={ownedZoneModel()} plane="plan" notation="plan" mode="edit" edit={{ onNodesMoved: vi.fn(), onDropInto }} />,
      );
      await settle(container, 'owned');
      await settle(container, 'other');
      await settle(container, 'alice');
      const alice = nodeOf('alice');
      const ownedAbs = absOf('owned');
      const overOwned = frameAt({ x: ownedAbs.x + 10, y: ownedAbs.y + 10 });
      act(() => dragCapture.props['onNodeDrag'](overOwned, alice, [alice]));
      expect(flagOf('owned')).not.toBe(true);
      expect(domFlagOf(container, 'owned')).toBe(false);
      act(() => dragCapture.props['onNodeDragStop'](overOwned, alice, [alice]));
      expect(onDropInto).not.toHaveBeenCalled();

      const otherAbs = absOf('other');
      const overOther = frameAt({ x: otherAbs.x + 10, y: otherAbs.y + 10 });
      act(() => dragCapture.props['onNodeDrag'](overOther, alice, [alice]));
      expect(flagOf('other')).toBe(true);
      expect(domFlagOf(container, 'other')).toBe(true);
      act(() => dragCapture.props['onNodeDragStop'](overOther, alice, [alice]));
      expect(onDropInto).toHaveBeenCalledTimes(1);
      // the exact offset (draggedAbs − targetAbs) is exercised numerically by
      // the root-level drop-to-assign cases above, which drive onNodesChange
      // first — this case calls onNodeDragStop directly (see onNodeDrag
      // right above it), so alice's on-screen position never actually moved
      const [id, targetId] = onDropInto.mock.calls[0]!;
      expect(id).toBe('alice');
      expect(targetId).toBe('other');
    });
  });
});
