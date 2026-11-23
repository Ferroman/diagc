import { useEffect, type MutableRefObject } from 'react';
import { getViewportForBounds, type Node, type ReactFlowInstance } from '@xyflow/react';
import type { CompiledView, Point, Stroke } from '@diagc/core/internal';
import { strokesBounds } from '../drawings/drawings';
import type { NodeGeometry } from '../layout/layout';
import { isNoteId } from '../notes/derive-note-nodes';
import { overhangBounds, unionBounds } from './content-bounds';
import { captureCanvas, exportFrame } from './export-image';
import { toSaved } from './saved-frame';
import type { LayoutApi } from './view-types';

// Zoom limits, shared by DiagramView's <ReactFlow> element and the
// getViewportForBounds call in `fitView` below — the same numbers have to
// bound both, or a fit could compute a zoom the canvas then clamps and land
// off-frame.
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;

// LayoutApi.focusNodes: a lone small box is not blown up to fill the canvas, the
// boxes keep their surroundings in view, and the move is slow enough to follow.
const FOCUS_MAX_ZOOM = 1;
const FOCUS_PADDING = 0.35;
const FOCUS_MS = 300;

export interface LayoutApiInput {
  layoutApiRef: MutableRefObject<LayoutApi | null> | undefined;
  reactFlow: ReactFlowInstance;
  /** React Flow's copy of the nodes */
  rfNodesRef: MutableRefObject<Node[]>;
  compiledRef: MutableRefObject<CompiledView>;
  /** the automatic layout's geometry */
  geometryRef: MutableRefObject<Map<string, NodeGeometry> | null>;
  wrapperRef: MutableRefObject<HTMLDivElement | null>;
  strokesRef: MutableRefObject<readonly Stroke[]>;
  /** the layout's view-only y shifts (LayoutResult.viewShift), taken back off a snapshot */
  viewShiftRef: MutableRefObject<ReadonlyMap<string, number>>;
  /** the layout's drill frames (LayoutResult.savedFrame), taken back off a snapshot */
  savedFrameRef: MutableRefObject<ReadonlyMap<string, Point>>;
  legendReserveRef: MutableRefObject<{ side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null>;
}

/** Populate the host's imperative layout ref (auto-layout toggle). Functions
 * read refs so the api object stays stable while always returning current data. */
export function useLayoutApi(input: LayoutApiInput): void {
  const {
    layoutApiRef,
    reactFlow,
    rfNodesRef,
    compiledRef,
    geometryRef,
    wrapperRef,
    strokesRef,
    legendReserveRef,
    viewShiftRef,
    savedFrameRef,
  } = input;
  useEffect(() => {
    const ref = layoutApiRef;
    if (ref === undefined) return;
    ref.current = {
      // External stubs (compiled.externals) are placeholders for an off-frame
      // node while drilled — not real nodes in the model — so writing their
      // `__ext__:` ids into the layout overlay would corrupt it for every
      // other view of the same plane. Drop them from the snapshot. Notes
      // go the same way: a note's place is an offset in `layout.notes`, so a
      // freeze that wrote its `note:` id into `layout.planes` would save a
      // phantom box there for good. A view shift (a plan zone drawn higher
      // because a fold above it gave its height back) and a drill frame (an
      // opened zone's child, drawn at the zone's place) are taken back off:
      // what is saved has to hold in the whole view, every fold open.
      snapshotPositions: () =>
        Object.fromEntries(
          rfNodesRef.current
            .filter((n) => !(compiledRef.current.externals?.has(n.id) ?? false) && !isNoteId(n.id))
            .map((n) => [n.id, toSaved({ savedFrameRef, viewShiftRef }, n.id, n.position)]),
        ),
      autoPositions: () =>
        geometryRef.current === null
          ? {}
          : Object.fromEntries([...geometryRef.current].map(([id, g]) => [id, { x: g.x, y: g.y }])),
      viewportCenter: () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        return rect === undefined
          ? undefined
          : reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      },
      nodeBounds: (id) => {
        const n = reactFlow.getInternalNode(id);
        if (n === undefined) return undefined;
        return { ...n.internals.positionAbsolute, width: n.measured.width ?? 0, height: n.measured.height ?? 0 };
      },
      contentBounds: () => {
        const nodes = reactFlow.getNodes();
        const nodeBounds = nodes.length === 0 ? undefined : reactFlow.getNodesBounds(nodes);
        // Union: neither a scribble outside the boxes nor anything drawn past
        // them — a bowed edge, a loop badge, an icon's caption (see
        // overhangBounds) — may be cropped from the PNG.
        return unionBounds([
          nodeBounds,
          strokesBounds(strokesRef.current),
          overhangBounds(wrapperRef.current, (p) => reactFlow.screenToFlowPosition(p, { snapToGrid: false })),
        ]);
      },
      fitView: (padding = 0.06) => {
        const pad =
          typeof padding === 'number'
            ? padding
            : Object.fromEntries(Object.entries(padding).map(([k, v]) => [k, `${v}px`]));
        // Fit the CONTENT box (nodes ∪ strokes), not React Flow's node-only
        // fitView. Same getViewportForBounds underneath, over bounds taken from
        // the same node lookup fitView reads (the instance getNodesBounds, which
        // resolves a child's parent-relative position to an absolute one), so a
        // stroke-less diagram lands on the viewport fitView would have chosen.
        const bounds = ref.current?.contentBounds();
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (bounds !== undefined && rect !== undefined && rect.width > 0 && rect.height > 0) {
          void reactFlow.setViewport(getViewportForBounds(bounds, rect.width, rect.height, MIN_ZOOM, MAX_ZOOM, pad));
          return;
        }
        void reactFlow.fitView({ padding: pad });
      },
      focusNodes: (ids) => {
        const boxes = ids.map((id) => ref.current?.nodeBounds(id));
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (boxes.length === 0 || boxes.includes(undefined) || rect === undefined || rect.width <= 0) return false;
        const bounds = unionBounds(boxes);
        if (bounds === undefined) return false;
        const viewport = getViewportForBounds(bounds, rect.width, rect.height, MIN_ZOOM, FOCUS_MAX_ZOOM, FOCUS_PADDING);
        void reactFlow.setViewport(viewport, { duration: FOCUS_MS });
        return true;
      },
      legendReserve: () => legendReserveRef.current,
      exportPng: async (opts) => {
        const el = wrapperRef.current?.querySelector<HTMLElement>('.react-flow');
        const bounds = ref.current?.contentBounds();
        if (el === null || el === undefined || bounds === undefined) return null;
        const frame = exportFrame(bounds, opts);
        const before = reactFlow.getViewport();
        // Move the content to 1:1 inside a frame cut to its size, let the
        // viewport-driven layers (drawings, canvas overlays) catch up, then clone.
        await reactFlow.setViewport(frame.viewport);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        try {
          return await captureCanvas(el, frame);
        } finally {
          void reactFlow.setViewport(before);
        }
      },
    };
    return () => {
      ref.current = null;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps --
       every ref here comes from DiagramView or its hooks, so the rule cannot see they are stable useRef
       identities read through .current */
  }, [layoutApiRef, reactFlow]);
}
