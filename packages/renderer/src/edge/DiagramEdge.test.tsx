// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider, Position, getBezierPath, type Node as FlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

// EdgeLabelRenderer portals into the flow's viewport div, which a bare
// ReactFlowProvider doesn't create — portal to body instead (same HTML-outside-
// the-svg behavior as the real component).
vi.mock('@xyflow/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...mod,
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) => createPortal(children, document.body),
  };
});
import { createKindRegistry } from '../registry';
import { badgePosition, DiagramEdge, markFrame, type DiagramEdgeData } from './DiagramEdge';
import { NoteStateContext, type NoteState } from '../notes/note-state';
import { edgePoint, shapeCurve } from './edge-geometry';
import { notationProfile } from '../notations';
import { stylePreset } from '../sketch/stylePresets';
import { CAPTION_HEIGHT } from '../node/label-size';

// The element, not the render: a test that needs the edge under a context
// provider wraps THIS and renders the result, so there is one description of
// the edge under test rather than two that drift.
function edgeElement(
  partial: Partial<DiagramEdgeData>,
  positions: { sourcePosition?: Position; targetPosition?: Position } = {},
) {
  const data: DiagramEdgeData = {
    kind: 'reads',
    constituentCount: 1,
    kindRegistry: createKindRegistry(),
    ...partial,
  };
  return (
    <ReactFlowProvider>
      <svg>
        <DiagramEdge
          id="e1"
          source="a"
          target="b"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={100}
          sourcePosition={positions.sourcePosition ?? Position.Bottom}
          targetPosition={positions.targetPosition ?? Position.Top}
          data={data}
        />
      </svg>
    </ReactFlowProvider>
  );
}

function renderEdge(
  partial: Partial<DiagramEdgeData>,
  positions: { sourcePosition?: Position; targetPosition?: Position } = {},
) {
  return render(edgeElement(partial, positions));
}

describe('DiagramEdge', () => {
  it('renders a path with default stroke', () => {
    const { container } = renderEdge({});
    const path = container.querySelector('path.react-flow__edge-path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('style') ?? '').toContain('var(--dg-edge)');
  });

  it('applies layer tint and dashed kind style', () => {
    const { container } = renderEdge({ kind: 'async', tint: '#123456' });
    const style = container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '';
    expect(style).toContain('#123456');
    expect(style).toContain('stroke-dasharray');
  });

  it('renders a label when label present', () => {
    const { getByText } = renderEdge({ label: '3', constituentCount: 3 });
    expect(getByText('3')).toBeDefined();
  });

  it('draws a bundled arrow’s label in the HTML label layer, above every edge, not inside its own svg', () => {
    // React Flow's SVG `label` lives in the edge's own <svg>: any edge painted
    // later ran its line straight across the text.
    const long = 'publishes employee.tenure.recalculated to the mesh';
    const { container, getByText } = renderEdge({ label: long, constituentCount: 3 });
    const label = getByText(long);
    expect(label.className).toContain('dg-edge-chip');
    expect(label.className).toContain('dg-edge-label'); // shares the CSS ellipsis
    expect(container.querySelector('svg')!.contains(label)).toBe(false);
    expect(container.querySelector('.react-flow__edge-text')).toBeNull();
    // the full text also rides the hover title of the hit-path under the label
    expect(container.querySelector('title')?.textContent).toContain(long);
  });

  it('renders each positioned label text', () => {
    const { getByText } = renderEdge({
      labels: [
        { id: 'l1', text: 'top', side: 'top' },
        { id: 'l2', text: 'bot', side: 'bottom' },
      ],
      constituentCount: 1,
    });
    expect(getByText('top')).toBeDefined();
    expect(getByText('bot')).toBeDefined();
  });

  it('renders its own arrow end marker by default', () => {
    const { container } = renderEdge({});
    const path = container.querySelector('path.react-flow__edge-path');
    expect(path?.getAttribute('marker-end')).toBe('url(#dg-end-e1)');
    // the marker definition lives alongside the edge and is a closed arrow
    expect(container.querySelector('marker#dg-end-e1 path')?.getAttribute('d')).toContain('L10,5');
  });

  it('renders alternative end markers and none', () => {
    const square = renderEdge({ relStyle: { end: 'square' } });
    expect(square.container.querySelector('marker rect')).not.toBeNull();
    square.unmount();
    const none = renderEdge({ relStyle: { end: 'none' } });
    expect(none.container.querySelector('marker')).toBeNull();
    expect(none.container.querySelector('path.react-flow__edge-path')?.getAttribute('marker-end')).toBeNull();
  });

  it('applies per-relation color, thickness and dotted line over defaults', () => {
    const { container } = renderEdge({ relStyle: { color: '#ff0000', width: 4, line: 'dotted' } });
    const style = container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '';
    expect(style).toContain('#ff0000');
    expect(style).toContain('stroke-width: 4');
    expect(style).toContain('stroke-dasharray');
    expect(style).toContain('stroke-linecap: round');
    // the marker inherits the override color
    expect(container.querySelector('marker')?.getAttribute('fill')).toBe('#ff0000');
  });

  it('draws straight and step shapes instead of the default bezier', () => {
    const curved = renderEdge({});
    const curvedD = curved.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
    expect(curvedD).toContain('C'); // bezier
    curved.unmount();
    const straight = renderEdge({ relStyle: { shape: 'straight' } });
    const straightD = straight.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
    expect(straightD).not.toContain('C');
    expect(straightD).not.toContain('Q');
  });

  it('double-clicking a label opens an inline editor and commits an edit', () => {
    const onEditLabel = vi.fn();
    const { getByText, getByLabelText } = renderEdge({
      labels: [{ id: 'l1', text: 'events', side: 'center' }],
      editableLabels: true,
      onEditLabel,
    });
    fireEvent.doubleClick(getByText('events'));
    const input = getByLabelText('Edge label') as HTMLInputElement;
    expect(input.value).toBe('events');
    fireEvent.change(input, { target: { value: 'orders' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEditLabel).toHaveBeenCalledWith('l1', 'orders');
  });

  it('commits an empty edit as "" so the host can remove the label', () => {
    const onEditLabel = vi.fn();
    const { getByText, getByLabelText } = renderEdge({
      labels: [{ id: 'l1', text: 'events', side: 'center' }],
      editableLabels: true,
      onEditLabel,
    });
    fireEvent.doubleClick(getByText('events'));
    const input = getByLabelText('Edge label') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEditLabel).toHaveBeenCalledWith('l1', '');
  });

  it('does not expose label editing when editableLabels is falsy', () => {
    const onEditLabel = vi.fn();
    const { getByText, queryByLabelText } = renderEdge({
      labels: [{ id: 'l1', text: 'events', side: 'center' }],
      onEditLabel,
    });
    fireEvent.doubleClick(getByText('events'));
    expect(queryByLabelText('Edge label')).toBeNull();
    expect(onEditLabel).not.toHaveBeenCalled();
  });

  it('cancels a label edit on Escape without calling onEditLabel', () => {
    const onEditLabel = vi.fn();
    const { getByText, getByLabelText, queryByLabelText } = renderEdge({
      labels: [{ id: 'l1', text: 'events', side: 'center' }],
      editableLabels: true,
      onEditLabel,
    });
    fireEvent.doubleClick(getByText('events'));
    fireEvent.keyDown(getByLabelText('Edge label'), { key: 'Escape' });
    expect(onEditLabel).not.toHaveBeenCalled();
    expect(queryByLabelText('Edge label')).toBeNull();
  });

  // Adding a label is now correlation-driven: DiagramView detects a click then a
  // double-click near the same edge and threads `pendingAdd` (flow coords) into
  // this edge's data; the renderer projects the point and opens the new-label
  // editor, then clears the request via onPendingAddConsumed. (The old hit-path
  // onDoubleClick was unreliable — the first click remounts the edges layer, so
  // the native dblclick never lands on the edge; see the DiagramView test.)
  it('opens the new-label editor when data.pendingAdd is set', async () => {
    const { getByLabelText } = renderEdge({
      editableLabels: true,
      pendingAdd: { x: 40, y: 20 },
      onPendingAddConsumed: vi.fn(),
    });
    await waitFor(() => expect(getByLabelText('Edge label')).toBeDefined());
  });

  it('keeps the pendingAdd editor open until commit, then consumes once', async () => {
    // The editor is derived from pendingAdd (not local state) so it survives the
    // edges-layer remount a double-click triggers; the request is consumed only
    // when the user commits/cancels — never merely from mounting.
    const onPendingAddConsumed = vi.fn();
    const { getByLabelText } = renderEdge({ editableLabels: true, pendingAdd: { x: 40, y: 20 }, onPendingAddConsumed });
    const input = await waitFor(() => getByLabelText('Edge label'));
    expect(onPendingAddConsumed).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPendingAddConsumed).toHaveBeenCalledTimes(1);
  });

  it('commits a new label placed via pendingAdd', async () => {
    const onAddLabel = vi.fn();
    const { getByLabelText } = renderEdge({
      editableLabels: true,
      pendingAdd: { x: 40, y: 20 },
      onPendingAddConsumed: vi.fn(),
      onAddLabel,
    });
    const input = (await waitFor(() => getByLabelText('Edge label'))) as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'flows' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // geometry (t/side) is browser-probe territory in jsdom; assert the wiring:
    // committed text plus a numeric t and a string side reach the host.
    expect(onAddLabel).toHaveBeenCalledWith('flows', expect.any(Number), expect.any(String));
  });

  it('adds nothing when the pendingAdd editor commits empty', async () => {
    const onAddLabel = vi.fn();
    const { getByLabelText } = renderEdge({
      editableLabels: true,
      pendingAdd: { x: 40, y: 20 },
      onPendingAddConsumed: vi.fn(),
      onAddLabel,
    });
    const input = await waitFor(() => getByLabelText('Edge label'));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddLabel).not.toHaveBeenCalled();
  });

  it('no longer opens an add editor from a hit-path double-click (unreliable trigger removed)', () => {
    const onAddLabel = vi.fn();
    const { container, queryByLabelText } = renderEdge({ editableLabels: true, onAddLabel });
    const hitPath = container.querySelector('path[stroke="transparent"]');
    expect(hitPath).not.toBeNull(); // the transparent hit-path itself stays (hover title)
    fireEvent.doubleClick(hitPath!);
    expect(queryByLabelText('Edge label')).toBeNull();
    expect(onAddLabel).not.toHaveBeenCalled();
  });

  it('drags a label past the threshold and commits the move on pointer up', () => {
    const onMoveLabel = vi.fn();
    const { getByText } = renderEdge({
      labels: [{ id: 'l1', text: 'events', side: 'center' }],
      editableLabels: true,
      onMoveLabel,
    });
    const label = getByText('events');
    fireEvent.pointerDown(label, { clientX: 50, clientY: 50 });
    // well past DRAG_THRESHOLD (3px) so the gesture counts as a drag, not a click
    fireEvent.pointerMove(label, { clientX: 70, clientY: 80 });
    fireEvent.pointerUp(label, { clientX: 70, clientY: 80 });
    // geometry (t/side) is browser-probe territory in jsdom; assert the wiring:
    // the moved label id plus a numeric t and a string side reach the host.
    expect(onMoveLabel).toHaveBeenCalledWith('l1', expect.any(Number), expect.any(String));
  });

  it('does not open the add-label editor on the hit-path when editableLabels is falsy', () => {
    const onAddLabel = vi.fn();
    const { container, queryByLabelText } = renderEdge({ onAddLabel });
    fireEvent.doubleClick(container.querySelector('path[stroke="transparent"]')!);
    expect(queryByLabelText('Edge label')).toBeNull();
    expect(onAddLabel).not.toHaveBeenCalled();
  });

  it('renders a hover title describing kind and aggregate count', () => {
    const { container } = renderEdge({ kind: 'reads', constituentCount: 2 });
    const title = container.querySelector('title');
    expect(title?.textContent).toContain('reads ×2');
  });

  it('roughens the edge path in sketch mode', () => {
    const clean = renderEdge({});
    const cleanD = clean.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
    cleanup();
    const sk = renderEdge({ stylePreset: stylePreset('sketch') });
    const sketchD = sk.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
    expect(sketchD.length).toBeGreaterThan(0);
    expect(sketchD).not.toBe(cleanD); // roughened, not the clean bezier
  });

  it('keeps the clean path for a preset without rough params', () => {
    const clean = renderEdge({});
    const cleanD = clean.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
    cleanup();
    const crisp = renderEdge({ stylePreset: stylePreset('blueprint') });
    const crispD = crisp.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
    expect(crispD).toBe(cleanD); // un-roughened, identical to the crisp baseline
  });

  describe('fixed-side dots', () => {
    it('renders two fixed-side dots for an active single-relation edge with an onSetSide callback', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, fixedSideDotsShown: true });
      expect(container.querySelectorAll('.dg-edge-pin')).toHaveLength(2);
    });

    it('renders no fixed-side dots when the edge is not the active fixed-side target', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, fixedSideDotsShown: false });
      expect(container.querySelector('.dg-edge-pin')).toBeNull();
    });

    it('renders no fixed-side dots without an onSetSide callback (view mode / aggregated)', () => {
      const { container } = renderEdge({ fixedSideDotsShown: true });
      expect(container.querySelector('.dg-edge-pin')).toBeNull();
    });

    it('renders no fixed-side dots for an aggregated (multi-relation) edge', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, fixedSideDotsShown: true, constituentCount: 2 });
      expect(container.querySelector('.dg-edge-pin')).toBeNull();
    });

    it('marks a dot fixed when that end has a fixed side, hollow otherwise', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, fixedSideDotsShown: true, relStyle: { fromSide: 'bottom' } });
      const from = container.querySelector('.dg-edge-pin[data-end="from"]');
      const to = container.querySelector('.dg-edge-pin[data-end="to"]');
      expect(from?.classList.contains('pinned')).toBe(true);
      expect(to?.classList.contains('pinned')).toBe(false);
    });

    it('fixes a floating end to the side it currently faces when its dot is clicked', () => {
      const onSetSide = vi.fn();
      // default facing: source Bottom, target Top
      const { container } = renderEdge({ onSetSide, fixedSideDotsShown: true });
      fireEvent.click(container.querySelector('.dg-edge-pin[data-end="from"]')!);
      expect(onSetSide).toHaveBeenCalledWith('from', 'bottom');
      fireEvent.click(container.querySelector('.dg-edge-pin[data-end="to"]')!);
      expect(onSetSide).toHaveBeenCalledWith('to', 'top');
    });

    it('frees a fixed end when its dot is clicked', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, fixedSideDotsShown: true, relStyle: { toSide: 'top' } });
      fireEvent.click(container.querySelector('.dg-edge-pin[data-end="to"]')!);
      expect(onSetSide).toHaveBeenCalledWith('to', null);
    });
  });

  describe('causal-loop-diagram marks', () => {
    it('renders a polarity mark and a delay mark for a causal-loop edge', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '-', delay: true });
      const polarity = container.querySelector('.dg-polarity');
      expect(polarity).not.toBeNull();
      expect(polarity?.textContent).toBe('−'); // display minus, not ascii '-'
      expect(container.querySelector('.dg-delay')).not.toBeNull();
      expect(container.querySelectorAll('.dg-delay line')).toHaveLength(2);
    });

    it('renders a "+" polarity mark as-is', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '+' });
      expect(container.querySelector('.dg-polarity')?.textContent).toBe('+');
    });

    it('omits marks when the notation is not causal-loop-diagram', () => {
      const { container } = renderEdge({ polarity: '-', delay: true });
      expect(container.querySelector('.dg-polarity')).toBeNull();
      expect(container.querySelector('.dg-delay')).toBeNull();
    });

    it('omits the polarity mark when the edge carries no polarity', () => {
      const { container } = renderEdge({ notation: 'causal-loop', delay: true });
      expect(container.querySelector('.dg-polarity')).toBeNull();
      expect(container.querySelector('.dg-delay')).not.toBeNull();
    });

    it('omits the delay mark when the edge is not delayed', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '+' });
      expect(container.querySelector('.dg-polarity')).not.toBeNull();
      expect(container.querySelector('.dg-delay')).toBeNull();
    });

    it('still renders the end-shape arrow marker alongside marks', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '-', delay: true });
      const path = container.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('marker-end')).toBe('url(#dg-end-e1)');
    });

    it('does not bow a straight-shaped CLD edge (bow gate is shape === "curved" only), but still renders marks', () => {
      const { container } = renderEdge({
        notation: 'causal-loop',
        polarity: '-',
        delay: true,
        relStyle: { shape: 'straight' },
      });
      const d = container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
      expect(d).not.toContain('C'); // no cubic segment — not bowed
      expect(container.querySelector('.dg-polarity')).not.toBeNull();
      expect(container.querySelectorAll('.dg-delay line')).toHaveLength(2);
    });
  });

  describe('causal-loop-diagram polarity colour', () => {
    const strokeOf = (c: HTMLElement) => c.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '';
    const glyphFill = (c: HTMLElement) => (c.querySelector('.dg-polarity') as SVGTextElement | null)?.style.fill ?? '';

    it('strokes a "+" link and its glyph with the positive token', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '+' });
      expect(strokeOf(container)).toContain('var(--dg-polarity-positive)');
      expect(glyphFill(container)).toContain('var(--dg-polarity-positive)');
    });

    it('strokes a "−" link and its glyph with the negative token', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '-' });
      expect(strokeOf(container)).toContain('var(--dg-polarity-negative)');
      expect(glyphFill(container)).toContain('var(--dg-polarity-negative)');
    });

    it('yields to a per-relation colour override, glyph included', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '+', relStyle: { color: '#123456' } });
      expect(strokeOf(container)).toContain('#123456');
      expect(strokeOf(container)).not.toContain('polarity-positive');
      expect(glyphFill(container)).toContain('#123456');
    });

    it('yields to a layer tint', () => {
      const { container } = renderEdge({ notation: 'causal-loop', polarity: '-', tint: '#abcdef' });
      expect(strokeOf(container)).toContain('#abcdef');
      expect(strokeOf(container)).not.toContain('polarity-negative');
    });

    it('leaves an unsigned causal-loop link on the default edge colour', () => {
      const { container } = renderEdge({ notation: 'causal-loop', delay: true });
      expect(strokeOf(container)).toContain('var(--dg-edge)');
    });

    it('does not colour by polarity outside the causal-loop notation', () => {
      const { container } = renderEdge({ polarity: '-' });
      expect(strokeOf(container)).toContain('var(--dg-edge)');
    });
  });

  describe('notation colour', () => {
    it('sits below the layer tint and above the default', () => {
      const { container } = renderEdge({ notationColor: '#123456' });
      expect(container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '').toContain('#123456');
      const tinted = renderEdge({ notationColor: '#123456', tint: '#abcdef' });
      expect(tinted.container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '').toContain(
        '#abcdef',
      );
    });

    it('endMarker none draws no arrowhead', () => {
      const reg = createKindRegistry();
      reg.register('commit', { dashed: true, endMarker: 'none' });
      const { container } = renderEdge({ kind: 'commit', kindRegistry: reg });
      expect(container.querySelector('marker')).toBeNull();
      expect(container.querySelector('path.react-flow__edge-path')?.getAttribute('marker-end')).toBeNull();
    });
  });

  describe('curvature', () => {
    // Bottom/Top facing each other "naturally" (target below-right of
    // source) is curvature-invariant by construction (xyflow's control
    // offset is a fixed half-distance in that branch) — use reversed
    // positions, matching a real loop-back CLD edge, so curvature actually
    // moves the control points.
    const loopback = { sourcePosition: Position.Top, targetPosition: Position.Bottom };

    it('renders a different path for different relStyle.curvature values', () => {
      const low = renderEdge({ notation: 'causal-loop', relStyle: { curvature: 0.1 } }, loopback);
      const lowD = low.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
      low.unmount();
      const high = renderEdge({ notation: 'causal-loop', relStyle: { curvature: 0.9 } }, loopback);
      const highD = high.container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
      expect(lowD).not.toBe(highD);
    });
  });

  describe('bowed edges (causal-loop)', () => {
    // Facing anchors (source Right, target Left, aligned on the same y) are
    // exactly the case xyflow's curvature can't bend: both control points
    // land on the chord itself (see edge-geometry.ts's comment on
    // calculateControlOffset), so the plain bezier degenerates to a straight
    // line. This is the side-by-side CLD scenario the bow exists to fix.
    const facingCoords = { sourceX: 0, sourceY: 50, targetX: 100, targetY: 50 };
    const facingPositions = { sourcePosition: Position.Right, targetPosition: Position.Left };

    function renderFacing(partial: Partial<DiagramEdgeData>) {
      const data: DiagramEdgeData = {
        kind: 'reads',
        constituentCount: 1,
        kindRegistry: createKindRegistry(),
        ...partial,
      };
      return render(
        <ReactFlowProvider>
          <svg>
            <DiagramEdge id="e1" source="a" target="b" {...facingCoords} {...facingPositions} data={data} />
          </svg>
        </ReactFlowProvider>,
      );
    }

    it('bows a CLD edge whose facing anchors would otherwise render straight', () => {
      const [straightBezier] = getBezierPath({ ...facingCoords, ...facingPositions, curvature: 0.55 });
      const { container } = renderFacing({ notation: 'causal-loop' });
      const d = container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
      expect(d).toContain('C');
      expect(d).not.toBe(straightBezier);
    });

    it('does not bow a non-CLD edge on the same facing geometry (regression: stays a straight bezier)', () => {
      const [plainBezier] = getBezierPath({ ...facingCoords, ...facingPositions });
      const { container } = renderFacing({});
      const d = container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
      expect(d).toBe(plainBezier);
    });

    it('positions polarity/delay marks off the straight chord once bowed', () => {
      const { container } = renderFacing({ notation: 'causal-loop', polarity: '-', delay: true });
      const polarityY = Number(container.querySelector('.dg-polarity')?.getAttribute('y'));
      expect(Math.abs(polarityY - facingCoords.sourceY)).toBeGreaterThan(5);
      const delayLines = container.querySelectorAll('.dg-delay line');
      expect(delayLines).toHaveLength(2);
      const delayY1 = Number(delayLines[0]?.getAttribute('y1'));
      expect(Math.abs(delayY1 - facingCoords.sourceY)).toBeGreaterThan(5);
    });

    it('positions a center label on the bow, not the straight chord it would degenerate to', () => {
      // regression: the label geometry must key off `effectiveShape` ('bow'
      // once bowed), not the raw pre-bow `shape` ('curved') — otherwise a
      // center label on this facing geometry would sit at the chord midpoint
      // (the y the plain bezier degenerates to) while the rendered path arcs
      // away from it.
      const params = { ...facingCoords, ...facingPositions };
      const curvature = 0.55; // profile.edgeCurvature for 'causal-loop', no relStyle override here
      const expected = edgePoint('bow', params, curvature, 0.5, 'left');
      expect(Math.abs(expected.y - facingCoords.sourceY)).toBeGreaterThan(5); // sanity: bow really moves off the chord

      const { baseElement } = renderFacing({
        notation: 'causal-loop',
        labels: [{ id: 'l1', text: 'rate', side: 'center' }],
      });
      const label = baseElement.querySelector('.dg-edge-label-center') as HTMLElement | null;
      expect(label).not.toBeNull();
      const match = label?.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*$/);
      expect(match).not.toBeNull();
      expect(Number(match?.[1])).toBeCloseTo(expected.x, 6);
      expect(Number(match?.[2])).toBeCloseTo(expected.y, 6);
    });
  });

  describe('fk edges', () => {
    it('an fk edge renders both a start (crowsfoot) and end (one) marker', () => {
      const { container } = renderEdge({
        kind: 'fk',
        kindRegistry: createKindRegistry(),
        constituentCount: 1,
        fromColumn: 'b_id',
        toColumn: 'id',
      });
      // two <marker> defs: one for markerStart, one for markerEnd
      expect(container.querySelectorAll('marker').length).toBe(2);
    });

    it("draws the crow's foot on the line, not under the table it leaves", () => {
      const { container } = renderEdge({
        kind: 'fk',
        kindRegistry: createKindRegistry(),
        constituentCount: 1,
        fromColumn: 'b_id',
        toColumn: 'id',
      });
      const start = container.querySelector('marker[id^="dg-start-"]')!;
      expect(start.getAttribute('orient')).toBe('auto-start-reverse');
      // At the path's start that orientation turns the marker's +x axis back into the
      // source node, and nodes paint over edges: whatever of the shape lies past refX
      // is hidden. So the foot's open end is what must sit on the table's border.
      const xs = [
        ...start
          .querySelector('path')!
          .getAttribute('d')!
          .matchAll(/[ML](-?[\d.]+),/g),
      ].map((m) => Number(m[1]));
      expect(xs.length).toBeGreaterThan(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(Number(start.getAttribute('refX')));
    });

    it('strokes only the line-based fk markers, leaving filled markers outline-free', () => {
      // regression: a non-fk edge keeps its single filled arrow marker with NO
      // stroke attribute (a stroke would outline the fill and visibly lengthen
      // the arrow tip — breaks "non-fk edges must be visually unchanged").
      const sync = renderEdge({ kind: 'sync' });
      const syncMarkers = sync.container.querySelectorAll('marker');
      expect(syncMarkers.length).toBe(1);
      expect(syncMarkers[0]?.getAttribute('stroke')).toBeNull();
      sync.unmount();
      // the fk edge's line-based markers DO carry a stroke so their strokes draw
      const fk = renderEdge({ kind: 'fk', constituentCount: 1, fromColumn: 'b_id', toColumn: 'id' });
      const fkMarkers = fk.container.querySelectorAll('marker');
      expect(fkMarkers.length).toBe(2);
      fkMarkers.forEach((m) => expect(m.getAttribute('stroke')).not.toBeNull());
    });
  });

  describe('interrupt zigzag glyph', () => {
    it('draws a zigzag glyph at the midpoint of an interrupt edge', () => {
      const { container } = renderEdge({ kind: 'interrupt' });
      const polyline = container.querySelector('polyline.dg-edge-zigzag');
      expect(polyline).not.toBeNull();
      // tracks the edge's resolved stroke, same as the path/markers/polarity glyph —
      // not a fixed token, so tinted/colored interrupt edges stay legible.
      expect(polyline?.getAttribute('stroke')).toBe('var(--dg-edge)');
    });

    it('ordinary kinds draw no zigzag', () => {
      const { container } = renderEdge({ kind: 'control' });
      expect(container.querySelector('polyline.dg-edge-zigzag')).toBeNull();
    });

    it('the zigzag stroke follows an explicit relation color', () => {
      const { container } = renderEdge({ kind: 'interrupt', relStyle: { color: '#ff0000' } });
      const polyline = container.querySelector('polyline.dg-edge-zigzag');
      expect(polyline?.getAttribute('stroke')).toBe('#ff0000');
    });
  });

  describe('threat badge', () => {
    it('badges a flow with its open threat count, in the HTML label layer', () => {
      const { baseElement, container } = renderEdge({ kind: 'data-flow', threats: { open: 1, total: 1 } });
      const badge = baseElement.querySelector('.dg-edge-threat') as HTMLElement;
      expect(badge).not.toBeNull();
      // shares the node badge's look, so one CSS rule owns both
      expect(badge.className).toContain('dg-threat-badge');
      expect(badge.getAttribute('data-state')).toBe('open');
      expect(badge.textContent).toBe('1');
      expect(badge.getAttribute('title')).toBe('1 open of 1 threat');
      // The badge sits in React Flow's single label portal with every other
      // edge's, so it carries its own edge id: without it, nothing in the DOM
      // says which flow a badge belongs to (the e2e suite pairs by this).
      expect(badge.getAttribute('data-edge')).toBe('e1');
      // the badge belongs to the label layer, not this edge's own svg (where a
      // later-painted edge would draw its line straight through it)
      expect(container.querySelector('svg')!.contains(badge)).toBe(false);
    });

    it('turns the badge into a tick once every threat on the flow is handled', () => {
      const { baseElement } = renderEdge({ kind: 'data-flow', threats: { open: 0, total: 2 } });
      const badge = baseElement.querySelector('.dg-edge-threat') as HTMLElement;
      expect(badge.getAttribute('data-state')).toBe('handled');
      expect(badge.textContent).toBe('✓');
    });

    it('badges nothing on a flow that carries no threats', () => {
      const { baseElement, unmount } = renderEdge({ kind: 'data-flow' });
      expect(baseElement.querySelector('.dg-edge-threat')).toBeNull();
      unmount();
      // an empty register is not a clean bill of health — the same rule the
      // node badge states, so the two never disagree
      const empty = renderEdge({ kind: 'data-flow', threats: { open: 0, total: 0 } });
      expect(empty.baseElement.querySelector('.dg-edge-threat')).toBeNull();
    });

    it('offers "Add a threat" on an unthreatened flow in edit mode, and reports the click', () => {
      // buildEdgeData binds the sole relation, so the badge's callback takes no
      // arguments — what this proves is that the badge is a button and fires it.
      const onAddThreat = vi.fn();
      const { baseElement } = renderEdge({ kind: 'data-flow', notation: 'threat-model', onAddThreat });
      const badge = baseElement.querySelector('button.dg-edge-threat[data-state="empty"]') as HTMLButtonElement;
      expect(badge).not.toBeNull();
      expect(badge.className).toContain('dg-threat-badge');
      expect(badge.textContent).toBe('+');
      expect(badge.getAttribute('aria-label')).toBe('Add a threat');
      expect(badge.getAttribute('title')).toBe('Add a threat');
      // it rides the shared label portal like the counting badge, so it carries
      // the edge id too — nothing else in that flat layer says whose it is
      expect(badge.getAttribute('data-edge')).toBe('e1');
      fireEvent.click(badge);
      expect(onAddThreat).toHaveBeenCalledTimes(1);
    });

    it('offers nothing without a host hook (view mode) or on another notation', () => {
      const view = renderEdge({ kind: 'data-flow', notation: 'threat-model' });
      expect(view.baseElement.querySelector('.dg-edge-threat')).toBeNull();
      view.unmount();
      const elsewhere = renderEdge({ kind: 'data-flow', notation: 'c4', onAddThreat: vi.fn() });
      expect(elsewhere.baseElement.querySelector('.dg-edge-threat')).toBeNull();
    });

    it('keeps the counting badge passive once the flow carries a threat', () => {
      const { baseElement } = renderEdge({
        kind: 'data-flow',
        notation: 'threat-model',
        threats: { open: 1, total: 1 },
        onAddThreat: vi.fn(),
      });
      expect(baseElement.querySelector('.dg-edge-threat')?.tagName).toBe('SPAN');
    });

    it('under a NoteStateContext a sole-relation badge toggles its relation’s note; a bundle’s stays passive', () => {
      const toggle = vi.fn();
      const state: NoteState = { isOpen: (key) => key === 'relation:r1', toggle, placeBadge: vi.fn() };
      const wrap = (ui: React.ReactElement) =>
        render(<NoteStateContext.Provider value={state}>{ui}</NoteStateContext.Provider>);
      const sole = wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 1 }, threatRelation: 'r1' }));
      const badge = sole.baseElement.querySelector('button.dg-edge-threat') as HTMLButtonElement;
      expect(badge.getAttribute('aria-expanded')).toBe('true');
      expect(badge.getAttribute('aria-label')).toBe('1 open of 1 threat — hide');
      fireEvent.click(badge);
      expect(toggle).toHaveBeenCalledWith({ relation: 'r1' });
      sole.unmount();
      const bundle = wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 2 }, constituentCount: 2 }));
      expect(bundle.baseElement.querySelector('button.dg-edge-threat')).toBeNull();
      expect(bundle.baseElement.querySelector('span.dg-edge-threat')).not.toBeNull();
    });

    it('reports where its badge is drawn, so the relation’s note can hang off it; a bundle reports nothing', () => {
      const placeBadge = vi.fn();
      const state: NoteState = { isOpen: () => false, toggle: vi.fn(), placeBadge };
      const wrap = (ui: React.ReactElement) =>
        render(<NoteStateContext.Provider value={state}>{ui}</NoteStateContext.Provider>);
      const sole = wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 1 }, threatRelation: 'r1' }));
      // the spot is the badge's own transform — the two cannot disagree
      const badge = sole.baseElement.querySelector('button.dg-edge-threat') as HTMLElement;
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(badge.style.transform)!;
      // ...the side it was pushed to, a unit vector, and the line itself,
      // sampled end to end so the note can keep off it
      expect(placeBadge).toHaveBeenCalledWith(
        'r1',
        { x: Number(m[1]), y: Number(m[2]) },
        expect.anything(),
        expect.anything(),
      );
      const away = placeBadge.mock.calls[0]![2] as { x: number; y: number };
      expect(Math.hypot(away.x, away.y)).toBeCloseTo(1, 5);
      const line = placeBadge.mock.calls[0]![3] as { x: number; y: number }[];
      expect(line.length).toBeGreaterThan(10);
      expect(line[0]).toEqual({ x: 0, y: 0 });
      expect(line[line.length - 1]).toEqual({ x: 100, y: 100 });
      sole.unmount();
      placeBadge.mockClear();
      wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 2 }, constituentCount: 2 }));
      expect(placeBadge).not.toHaveBeenCalled();
    });
  });

  describe('comment badge', () => {
    it('draws a passive badge with the count, tagged with the edge id, on a plain canvas', () => {
      const { baseElement, container } = renderEdge({ kind: 'data-flow', annotations: { comments: 2, links: 0 } });
      const badge = baseElement.querySelector('.dg-comment-badge.dg-edge-comment') as HTMLElement;
      expect(badge.tagName).toBe('SPAN');
      expect(badge.getAttribute('data-edge')).toBe('e1');
      expect(badge.textContent).toBe('2');
      // the badge belongs to the label layer, not this edge's own svg — same
      // reasoning the threat badge's equivalent assertion states
      expect(container.querySelector('svg')!.contains(badge)).toBe(false);
    });

    it("toggles the sole relation's note on a note-drawing canvas, and reports its spot when there is no threat badge", () => {
      const toggle = vi.fn();
      const placeBadge = vi.fn();
      const state: NoteState = { isOpen: () => false, toggle, placeBadge };
      const wrap = (ui: React.ReactElement) =>
        render(<NoteStateContext.Provider value={state}>{ui}</NoteStateContext.Provider>);
      const { baseElement } = wrap(
        edgeElement({ kind: 'data-flow', annotations: { comments: 1, links: 0 }, threatRelation: 'r1' }),
      );
      const badge = baseElement.querySelector('button.dg-comment-badge') as HTMLButtonElement;
      fireEvent.click(badge);
      expect(toggle).toHaveBeenCalledWith({ relation: 'r1' });
      // no threat badge on this edge, so the comment badge is the one that
      // reports where the relation's note should hang — and it reports its
      // OWN spot: the t = 0.25 frame offset along the normal, not the threat
      // badge's t = 0.75. The curve is the one the component builds for an
      // unmeasured, unrouted, notation-less edge (see DiagramEdge).
      const curve = shapeCurve(
        'curved',
        {
          sourceX: 0,
          sourceY: 0,
          targetX: 100,
          targetY: 100,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        },
        notationProfile(undefined).edgeCurvature,
      );
      const frame = markFrame(curve, 0.25);
      expect(placeBadge).toHaveBeenCalledWith('r1', badgePosition(frame), frame.normal, expect.anything());
      expect(badgePosition(frame)).not.toEqual(badgePosition(markFrame(curve, 0.75)));
    });

    it('a bundle keeps a passive badge', () => {
      const state: NoteState = { isOpen: () => false, toggle: vi.fn(), placeBadge: vi.fn() };
      const { baseElement } = render(
        <NoteStateContext.Provider value={state}>
          {edgeElement({ kind: 'data-flow', annotations: { comments: 1, links: 0 }, constituentCount: 2 })}
        </NoteStateContext.Provider>,
      );
      expect(baseElement.querySelector('button.dg-comment-badge')).toBeNull();
      expect(baseElement.querySelector('span.dg-comment-badge')).not.toBeNull();
    });
  });
});

// The cases above render with no measured nodes, so the edge falls back to the
// handle coordinates React Flow passed. These give the store measured boxes,
// as the canvas does once it has drawn them: the ends float to the facing
// borders, a table holds them to a row, and the layout's route is drawn while
// both ends stand where the layout put them.
describe('DiagramEdge between measured nodes', () => {
  const box = (id: string, x: number, y: number, size = { w: 100, h: 40 }, data = {}): FlowNode => ({
    id,
    position: { x, y },
    data,
    measured: { width: size.w, height: size.h },
  });
  const table = (id: string, x: number, columns: string[]): FlowNode =>
    box(id, x, 0, { w: 160, h: 74 }, { columns: columns.map((name, i) => (i === 0 ? { name, pk: true } : { name })) });

  function edgeBetween(nodes: FlowNode[], partial: Partial<DiagramEdgeData>, notes: NoteState | null = null) {
    const data: DiagramEdgeData = {
      kind: 'reads',
      constituentCount: 1,
      kindRegistry: createKindRegistry(),
      ...partial,
    };
    return render(
      <NoteStateContext.Provider value={notes}>
        <ReactFlowProvider initialNodes={nodes}>
          <svg>
            <DiagramEdge
              id="e1"
              source="a"
              target="b"
              sourceX={0}
              sourceY={0}
              targetX={1}
              targetY={1}
              sourcePosition={Position.Bottom}
              targetPosition={Position.Top}
              data={data}
            />
          </svg>
        </ReactFlowProvider>
      </NoteStateContext.Provider>,
    );
  }
  const pathOf = (r: ReturnType<typeof render>) =>
    r.container.querySelector('path.react-flow__edge-path')?.getAttribute('d');
  const transformOf = (el: Element | null) => (el as HTMLElement | null)?.style.transform;

  // a at (0,0) and b at (300,100), both 100×40; the layout's route leaves a's
  // right side, drops at x = 200 and meets b's left side
  const apart = () => [box('a', 0, 0), box('b', 300, 100)];
  const routed = {
    route: [
      { x: 100, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 120 },
      { x: 300, y: 120 },
    ],
    routeFrom: { x: 0, y: 0 },
    routeTo: { x: 300, y: 100 },
  };
  const ROUTE_PATH = 'M100,20 L192,20 Q200,20 200,28 L200,112 Q200,120 208,120 L300,120';
  const FLOATING_PATH = 'M100,36.666666666666664 C200,36.666666666666664 200,103.33333333333334 300,103.33333333333334';

  it('leaves and meets each box on the border facing the other, not at the handles React Flow passed', () => {
    expect(pathOf(edgeBetween([box('a', 0, 0), box('b', 300, 0)], {}))).toBe('M100,20 C200,20 200,20 300,20');
  });

  it('holds an end on its fixed side', () => {
    expect(pathOf(edgeBetween([box('a', 0, 0), box('b', 300, 0)], { relStyle: { fromSide: 'bottom' } }))).toBe(
      'M50,40 C50,67.95084971874738 175,20 300,20',
    );
  });

  describe('table rows', () => {
    const tables = () => [table('a', 0, ['id', 'b_id']), table('b', 300, ['id', 'name'])];

    it('holds a foreign key to its row, and its target to the primary key row', () => {
      // rows are 22px under a 30px header: b_id's centre is 63, id's 41
      expect(pathOf(edgeBetween(tables(), { fromColumn: 'b_id' }))).toBe('M160,63 C230,63 230,41 300,41');
    });

    it('holds the target to a named column, and leaves an unnamed source end floating', () => {
      expect(pathOf(edgeBetween(tables(), { toColumn: 'name' }))).toBe('M160,37 C230,37 230,63 300,63');
    });

    it('floats both ends of a relation that names no column', () => {
      expect(pathOf(edgeBetween(tables(), {}))).toBe('M160,37 C230,37 230,37 300,37');
    });
  });

  describe("the layout's route", () => {
    it('is drawn while both ends stand where the layout put them', () => {
      expect(pathOf(edgeBetween(apart(), routed))).toBe(ROUTE_PATH);
    });

    it('gives way to the floating shape once a box has moved', () => {
      expect(pathOf(edgeBetween(apart(), { ...routed, routeFrom: { x: 5, y: 0 } }))).toBe(FLOATING_PATH);
    });

    it.each([
      [
        'a per-relation shape',
        { relStyle: { shape: 'straight' as const } },
        'M 100,36.666666666666664L 300,103.33333333333334',
      ],
      ['a table-row anchor', { fromColumn: 'b_id' }, FLOATING_PATH],
      [
        'a fixed side the route does not use',
        { relStyle: { fromSide: 'top' as const } },
        'M50,0 C50,-63.53312784157045 175,103.33333333333334 300,103.33333333333334',
      ],
      ['a fixed side the route uses, at the source', { relStyle: { fromSide: 'right' as const } }, ROUTE_PATH],
      ['a fixed side the route uses, at the target', { relStyle: { toSide: 'left' as const } }, ROUTE_PATH],
    ])('with %s draws %s', (_name, partial, expected) => {
      expect(pathOf(edgeBetween(apart(), { ...routed, ...partial }))).toBe(expected);
    });

    it("ends below an image's caption, which elk was told is part of the box", () => {
      const into = (data: object) =>
        pathOf(
          edgeBetween([box('a', 0, 300), box('b', 0, 0, { w: 100, h: 40 }, { state: 'leaf', label: 'cap', ...data })], {
            route: [
              { x: 50, y: 300 },
              { x: 50, y: 40 },
            ],
            routeFrom: { x: 0, y: 300 },
            routeTo: { x: 0, y: 0 },
          }),
        );
      expect(into({ image: 'x.png' })).toBe(`M50,300 L50,${40 + CAPTION_HEIGHT}`);
      expect(into({})).toBe('M50,300 L50,40');
    });

    it("puts a bundle's label on the spot the layout reserved, moved onto the line as drawn", () => {
      const r = edgeBetween(apart(), { ...routed, label: 'L', constituentCount: 2, labelSpot: { x: 205, y: 70 } });
      expect(transformOf(r.baseElement.querySelector('.dg-edge-chip'))).toBe(
        'translate(-50%, -50%) translate(200px, 70px)',
      );
    });

    it('puts a lone unplaced label on the reserved spot; a placed one, or one of two, follows the line', () => {
      const labelsAt = (labels: DiagramEdgeData['labels']) => {
        const r = edgeBetween(apart(), { ...routed, labels, labelSpot: { x: 205, y: 70 } });
        const at = [...r.baseElement.querySelectorAll('.dg-edge-label')].map(transformOf);
        r.unmount();
        return at;
      };
      expect(labelsAt([{ id: 'l1', text: 'one' }])).toEqual(['translate(-50%, -50%) translate(200px, 70px)']);
      expect(labelsAt([{ id: 'l1', text: 'one', t: 0.25 }])).toEqual(['translate(-50%, -50%) translate(175px, 20px)']);
      expect(
        labelsAt([
          { id: 'l1', text: 'one' },
          { id: 'l2', text: 'two', side: 'top' },
        ]),
      ).toEqual(['translate(-50%, -50%) translate(200px, 70px)', 'translate(-50%, -50%) translate(186px, 70px)']);
    });

    it('carries the causal-loop marks along the route', () => {
      const r = edgeBetween(apart(), { ...routed, notation: 'causal-loop', polarity: '-', delay: true });
      const polarity = r.container.querySelector('.dg-polarity')!;
      expect([polarity.getAttribute('x'), polarity.getAttribute('y')]).toEqual(['245.99999999999997', '132']);
      const hashes = [...r.container.querySelectorAll('.dg-delay line')].map((l) =>
        ['x1', 'y1', 'x2', 'y2'].map((a) => l.getAttribute(a)).join(','),
      );
      expect(hashes).toEqual(['206,67,194,67', '206,73,194,73']);
    });

    it("reports the route as the line a flow's note keeps off", () => {
      const placeBadge = vi.fn();
      edgeBetween(
        apart(),
        { ...routed, threats: { open: 1, total: 1 }, threatRelation: 'r1' },
        { isOpen: () => false, toggle: vi.fn(), placeBadge },
      );
      type At = { x: number; y: number };
      const [relation, at, away, line] = placeBadge.mock.calls[0] as [string, At, At, At[]];
      expect([relation, at]).toEqual(['r1', { x: 225, y: 130 }]);
      // pushed below the last leg (the normal's x is -0, which toEqual tells from 0)
      expect([away.x + 0, away.y]).toEqual([0, 1]);
      expect(line).toHaveLength(25);
      expect(line[0]).toEqual({ x: 100, y: 20 });
      expect(line[24]).toEqual({ x: 300, y: 120 });
      expect(line.every((p) => p.y === 20 || p.x === 200 || p.y === 120)).toBe(true);
    });
  });

  describe('fixed-side dots', () => {
    const dotsOf = (r: ReturnType<typeof render>) =>
      [...r.container.querySelectorAll('circle.dg-edge-pin')].map(
        (c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`,
      );
    const shown = { onSetSide: () => {}, fixedSideDotsShown: true };

    it('sit 16px off each floating end, square to the line', () => {
      expect(dotsOf(edgeBetween([box('a', 0, 0), box('b', 300, 0)], shown))).toEqual(['100,36', '300,36']);
    });

    it('are placed from the floating ends, before a table row moves the line', () => {
      const r = edgeBetween([table('a', 0, ['id', 'b_id']), table('b', 300, ['id', 'name'])], {
        ...shown,
        fromColumn: 'b_id',
      });
      expect(pathOf(r)).toBe('M160,63 C230,63 230,41 300,41');
      expect(dotsOf(r)).toEqual(['160,53', '300,53']);
    });
  });
});
