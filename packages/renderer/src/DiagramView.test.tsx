// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel } from '@diagramming/core';
import { DiagramView, type LayoutApi } from './DiagramView';

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
