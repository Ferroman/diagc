import { useEffect, type MutableRefObject } from 'react';
import type { ReactFlowInstance, Rect, Viewport } from '@xyflow/react';
import type { CompiledView } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { RootFit } from './useDrillNavigation';
import type { ViewLayout } from './useViewLayout';

export interface RootFitInput {
  /** the fit a drill or a diagram switch asked for (useDrillNavigation) */
  pendingRootFitRef: MutableRefObject<RootFit | null>;
  compiled: CompiledView;
  layout: Pick<ViewLayout, 'arrangedGeometry' | 'settledFor'> & { settledWidth?: number | undefined };
  reactFlow: ReactFlowInstance;
  /** a view that stretches time: the day width this transition lands on (an
   * opened zone's stretch, or the width given back on leaving it). The fit
   * waits for a layout at it, as it waits for the scene's. */
  dayWidth?: number;
  /** fit the width only (an opened plan zone): a tall zone fitted on both axes
   * would zoom out and undo the stretch that made its days readable */
  widthFit?: { canvas: () => { width: number; height: number } };
}

/** the room kept around a width fit, in screen px */
const FIT_PAD = 24;

/** The viewport that fits `bounds`' width into the canvas at zoom 1 at most,
 * centred, with the top in view: the header's (y = -HEADER_H) or the highest
 * box's (the roster stands above the header). */
export function widthFitViewport(bounds: Rect, canvasWidth: number): Viewport {
  const zoom = Math.min(1, (canvasWidth - 2 * FIT_PAD) / bounds.width);
  const top = Math.min(bounds.y, -PLAN_LAYOUT.HEADER_H);
  return { x: (canvasWidth - bounds.width * zoom) / 2 - bounds.x * zoom, y: FIT_PAD - top * zoom, zoom };
}

/**
 * A drill (enter/exit) or a different diagram swaps the whole scene, so once
 * it re-layouts, fit the new view: a glide into a level of the same diagram, a
 * jump to where a first open would land for another one (see RootFit).
 *
 * "Once it re-layouts" is `settledFor`, not `arrangedGeometry !== null`: the
 * last arrangement is kept while the next is computed, so the render that
 * swaps the scene already holds a non-null one — the OLD scene's. Where the
 * two share ids (a drill always does; so does a diagram and the copy that was
 * added to) that is a complete-looking, already-measured set of boxes, React
 * Flow resolves the fit against it on the spot, and the real arrangement then
 * lands under a camera framing the wrong thing.
 */
export function useRootFit(input: RootFitInput): void {
  const { pendingRootFitRef, compiled, reactFlow } = input;
  const { arrangedGeometry, settledFor } = input.layout;
  useEffect(() => {
    const fit = pendingRootFitRef.current;
    if (fit === null || arrangedGeometry === null || settledFor !== compiled) return;
    if (input.dayWidth !== undefined && input.layout.settledWidth !== input.dayWidth) return;
    pendingRootFitRef.current = null;
    if (input.widthFit !== undefined) {
      const bounds = reactFlow.getNodesBounds(reactFlow.getNodes());
      const vp = widthFitViewport(bounds, input.widthFit.canvas().width);
      void reactFlow.setViewport(vp, fit === 'glide' ? { duration: 500 } : undefined);
      return;
    }
    void reactFlow.fitView(fit === 'glide' ? { padding: 0.15, duration: 500 } : undefined);
    /* eslint-disable-next-line react-hooks/exhaustive-deps --
       pendingRootFitRef is a stable useRef identity (owned by useDrillNavigation) read through .current */
  }, [compiled, arrangedGeometry, settledFor, input.layout.settledWidth, reactFlow]);
}
