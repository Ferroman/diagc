// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider, Position, getBezierPath } from '@xyflow/react';
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
import { createKindRegistry } from './registry';
import { chipPosition, DiagramEdge, markFrame, type DiagramEdgeData } from './DiagramEdge';
import { NoteStateContext, type NoteState } from './note-state';
import { edgePoint, shapeCurve } from './edge-geometry';
import { notationProfile } from './notations';
import { stylePreset } from './stylePresets';

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

  it('renders a label chip when label present', () => {
    const { getByText } = renderEdge({ label: '3', constituentCount: 3 });
    expect(getByText('3')).toBeDefined();
  });

  it('draws the bundled-arrow chip in the HTML label layer, above every edge, not inside its own svg', () => {
    // React Flow's SVG `label` lives in the edge's own <svg>: any edge painted
    // later ran its line straight across the text.
    const long = 'publishes employee.tenure.recalculated to the mesh';
    const { container, getByText } = renderEdge({ label: long, constituentCount: 3 });
    const chip = getByText(long);
    expect(chip.className).toContain('dg-edge-chip');
    expect(chip.className).toContain('dg-edge-label'); // shares the CSS ellipsis
    expect(container.querySelector('svg')!.contains(chip)).toBe(false);
    expect(container.querySelector('.react-flow__edge-text')).toBeNull();
    // the full text also rides the hover title of the hit-path under the chip
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

  describe('endpoint pin dots', () => {
    it('renders two pin dots for an active single-relation edge with an onSetSide callback', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, pinsActive: true });
      expect(container.querySelectorAll('.dg-edge-pin')).toHaveLength(2);
    });

    it('renders no pin dots when the edge is not the active pin target', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, pinsActive: false });
      expect(container.querySelector('.dg-edge-pin')).toBeNull();
    });

    it('renders no pin dots without an onSetSide callback (view mode / aggregated)', () => {
      const { container } = renderEdge({ pinsActive: true });
      expect(container.querySelector('.dg-edge-pin')).toBeNull();
    });

    it('renders no pin dots for an aggregated (multi-relation) edge', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, pinsActive: true, constituentCount: 2 });
      expect(container.querySelector('.dg-edge-pin')).toBeNull();
    });

    it('marks a dot pinned when that end has a fixed side, hollow otherwise', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, pinsActive: true, relStyle: { fromSide: 'bottom' } });
      const from = container.querySelector('.dg-edge-pin[data-end="from"]');
      const to = container.querySelector('.dg-edge-pin[data-end="to"]');
      expect(from?.classList.contains('pinned')).toBe(true);
      expect(to?.classList.contains('pinned')).toBe(false);
    });

    it('pins a floating end to the side it currently faces when its dot is clicked', () => {
      const onSetSide = vi.fn();
      // default facing: source Bottom, target Top
      const { container } = renderEdge({ onSetSide, pinsActive: true });
      fireEvent.click(container.querySelector('.dg-edge-pin[data-end="from"]')!);
      expect(onSetSide).toHaveBeenCalledWith('from', 'bottom');
      fireEvent.click(container.querySelector('.dg-edge-pin[data-end="to"]')!);
      expect(onSetSide).toHaveBeenCalledWith('to', 'top');
    });

    it('unpins a pinned end when its dot is clicked', () => {
      const onSetSide = vi.fn();
      const { container } = renderEdge({ onSetSide, pinsActive: true, relStyle: { toSide: 'top' } });
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
    const strokeOf = (c: HTMLElement) =>
      c.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '';
    const glyphFill = (c: HTMLElement) =>
      (c.querySelector('.dg-polarity') as SVGTextElement | null)?.style.fill ?? '';

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
      expect(tinted.container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '').toContain('#abcdef');
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
            <DiagramEdge
              id="e1"
              source="a"
              target="b"
              {...facingCoords}
              {...facingPositions}
              data={data}
            />
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
      const xs = [...start.querySelector('path')!.getAttribute('d')!.matchAll(/[ML](-?[\d.]+),/g)].map((m) => Number(m[1]));
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
    it('chips a flow with its open threat count, in the HTML label layer', () => {
      const { baseElement, container } = renderEdge({ kind: 'data-flow', threats: { open: 1, total: 1 } });
      const chip = baseElement.querySelector('.dg-edge-threat') as HTMLElement;
      expect(chip).not.toBeNull();
      // shares the node badge's look, so one CSS rule owns both
      expect(chip.className).toContain('dg-threat-badge');
      expect(chip.getAttribute('data-state')).toBe('open');
      expect(chip.textContent).toBe('1');
      expect(chip.getAttribute('title')).toBe('1 open of 1 threat');
      // The chip sits in React Flow's single label portal with every other
      // edge's, so it carries its own edge id: without it, nothing in the DOM
      // says which flow a chip belongs to (the e2e suite pairs by this).
      expect(chip.getAttribute('data-edge')).toBe('e1');
      // the chip belongs to the label layer, not this edge's own svg (where a
      // later-painted edge would draw its line straight through it)
      expect(container.querySelector('svg')!.contains(chip)).toBe(false);
    });

    it('turns the chip into a tick once every threat on the flow is handled', () => {
      const { baseElement } = renderEdge({ kind: 'data-flow', threats: { open: 0, total: 2 } });
      const chip = baseElement.querySelector('.dg-edge-threat') as HTMLElement;
      expect(chip.getAttribute('data-state')).toBe('handled');
      expect(chip.textContent).toBe('✓');
    });

    it('chips nothing on a flow that carries no threats', () => {
      const { baseElement, unmount } = renderEdge({ kind: 'data-flow' });
      expect(baseElement.querySelector('.dg-edge-threat')).toBeNull();
      unmount();
      // an empty register is not a clean bill of health — the same rule the
      // node badge states, so the two never disagree
      const empty = renderEdge({ kind: 'data-flow', threats: { open: 0, total: 0 } });
      expect(empty.baseElement.querySelector('.dg-edge-threat')).toBeNull();
    });

    it('offers "Add a threat" on an unthreatened flow in edit mode, and reports the click', () => {
      // buildEdgeData binds the sole relation, so the chip's callback takes no
      // arguments — what this proves is that the chip is a button and fires it.
      const onAddThreat = vi.fn();
      const { baseElement } = renderEdge({ kind: 'data-flow', notation: 'threat-model', onAddThreat });
      const chip = baseElement.querySelector('button.dg-edge-threat[data-state="empty"]') as HTMLButtonElement;
      expect(chip).not.toBeNull();
      expect(chip.className).toContain('dg-threat-badge');
      expect(chip.textContent).toBe('+');
      expect(chip.getAttribute('aria-label')).toBe('Add a threat');
      expect(chip.getAttribute('title')).toBe('Add a threat');
      // it rides the shared label portal like the counting chip, so it carries
      // the edge id too — nothing else in that flat layer says whose it is
      expect(chip.getAttribute('data-edge')).toBe('e1');
      fireEvent.click(chip);
      expect(onAddThreat).toHaveBeenCalledTimes(1);
    });

    it('offers nothing without a host hook (view mode) or on another notation', () => {
      const view = renderEdge({ kind: 'data-flow', notation: 'threat-model' });
      expect(view.baseElement.querySelector('.dg-edge-threat')).toBeNull();
      view.unmount();
      const elsewhere = renderEdge({ kind: 'data-flow', notation: 'c4', onAddThreat: vi.fn() });
      expect(elsewhere.baseElement.querySelector('.dg-edge-threat')).toBeNull();
    });

    it('keeps the counting chip passive once the flow carries a threat', () => {
      const { baseElement } = renderEdge({
        kind: 'data-flow',
        notation: 'threat-model',
        threats: { open: 1, total: 1 },
        onAddThreat: vi.fn(),
      });
      expect(baseElement.querySelector('.dg-edge-threat')?.tagName).toBe('SPAN');
    });

    it('under a NoteStateContext a sole-relation chip toggles its relation’s bubble; a bundle’s stays passive', () => {
      const toggle = vi.fn();
      const state: NoteState = { isOpen: (key) => key === 'relation:r1', toggle, placeChip: vi.fn() };
      const wrap = (ui: React.ReactElement) => render(<NoteStateContext.Provider value={state}>{ui}</NoteStateContext.Provider>);
      const sole = wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 1 }, threatRelation: 'r1' }));
      const chip = sole.baseElement.querySelector('button.dg-edge-threat') as HTMLButtonElement;
      expect(chip.getAttribute('aria-expanded')).toBe('true');
      expect(chip.getAttribute('aria-label')).toBe('1 open of 1 threat — hide');
      fireEvent.click(chip);
      expect(toggle).toHaveBeenCalledWith({ relation: 'r1' });
      sole.unmount();
      const bundle = wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 2 }, constituentCount: 2 }));
      expect(bundle.baseElement.querySelector('button.dg-edge-threat')).toBeNull();
      expect(bundle.baseElement.querySelector('span.dg-edge-threat')).not.toBeNull();
    });

    it('reports where its chip is drawn, so the relation’s bubble can hang off it; a bundle reports nothing', () => {
      const placeChip = vi.fn();
      const state: NoteState = { isOpen: () => false, toggle: vi.fn(), placeChip };
      const wrap = (ui: React.ReactElement) => render(<NoteStateContext.Provider value={state}>{ui}</NoteStateContext.Provider>);
      const sole = wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 1 }, threatRelation: 'r1' }));
      // the spot is the chip's own transform — the two cannot disagree
      const chip = sole.baseElement.querySelector('button.dg-edge-threat') as HTMLElement;
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(chip.style.transform)!;
      // ...the side it was pushed to, a unit vector, and the line itself,
      // sampled end to end so the bubble can keep off it
      expect(placeChip).toHaveBeenCalledWith('r1', { x: Number(m[1]), y: Number(m[2]) }, expect.anything(), expect.anything());
      const away = placeChip.mock.calls[0]![2] as { x: number; y: number };
      expect(Math.hypot(away.x, away.y)).toBeCloseTo(1, 5);
      const line = placeChip.mock.calls[0]![3] as { x: number; y: number }[];
      expect(line.length).toBeGreaterThan(10);
      expect(line[0]).toEqual({ x: 0, y: 0 });
      expect(line[line.length - 1]).toEqual({ x: 100, y: 100 });
      sole.unmount();
      placeChip.mockClear();
      wrap(edgeElement({ kind: 'data-flow', threats: { open: 1, total: 2 }, constituentCount: 2 }));
      expect(placeChip).not.toHaveBeenCalled();
    });
  });

  describe('comment chip', () => {
    it('draws a passive chip with the count, tagged with the edge id, on a plain canvas', () => {
      const { baseElement, container } = renderEdge({ kind: 'data-flow', annotations: { comments: 2, links: 0 } });
      const chip = baseElement.querySelector('.dg-comment-badge.dg-edge-comment') as HTMLElement;
      expect(chip.tagName).toBe('SPAN');
      expect(chip.getAttribute('data-edge')).toBe('e1');
      expect(chip.textContent).toBe('2');
      // the chip belongs to the label layer, not this edge's own svg — same
      // reasoning the threat chip's equivalent assertion states
      expect(container.querySelector('svg')!.contains(chip)).toBe(false);
    });

    it("toggles the sole relation's bubble on a bubble-drawing canvas, and reports its spot when there is no threat chip", () => {
      const toggle = vi.fn();
      const placeChip = vi.fn();
      const state: NoteState = { isOpen: () => false, toggle, placeChip };
      const wrap = (ui: React.ReactElement) => render(<NoteStateContext.Provider value={state}>{ui}</NoteStateContext.Provider>);
      const { baseElement } = wrap(
        edgeElement({ kind: 'data-flow', annotations: { comments: 1, links: 0 }, threatRelation: 'r1' }),
      );
      const chip = baseElement.querySelector('button.dg-comment-badge') as HTMLButtonElement;
      fireEvent.click(chip);
      expect(toggle).toHaveBeenCalledWith({ relation: 'r1' });
      // no threat chip on this edge, so the comment chip is the one that
      // reports where the relation's bubble should hang — and it reports its
      // OWN spot: the t = 0.25 frame offset along the normal, not the threat
      // chip's t = 0.75. The curve is the one the component builds for an
      // unmeasured, unrouted, notation-less edge (see DiagramEdge).
      const curve = shapeCurve(
        'curved',
        { sourceX: 0, sourceY: 0, targetX: 100, targetY: 100, sourcePosition: Position.Bottom, targetPosition: Position.Top },
        notationProfile(undefined).edgeCurvature,
      );
      const frame = markFrame(curve, 0.25);
      expect(placeChip).toHaveBeenCalledWith('r1', chipPosition(frame), frame.normal, expect.anything());
      expect(chipPosition(frame)).not.toEqual(chipPosition(markFrame(curve, 0.75)));
    });

    it('a bundle keeps a passive chip', () => {
      const state: NoteState = { isOpen: () => false, toggle: vi.fn(), placeChip: vi.fn() };
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
