import { useEffect, type MutableRefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { CompiledView } from '@diagc/core/internal';
import type { RootFit } from './useDrillNavigation';
import type { ViewLayout } from './useViewLayout';

export interface RootFitInput {
  /** the fit a drill or a diagram switch asked for (useDrillNavigation) */
  pendingRootFitRef: MutableRefObject<RootFit | null>;
  compiled: CompiledView;
  layout: Pick<ViewLayout, 'arrangedGeometry' | 'settledFor'>;
  reactFlow: ReactFlowInstance;
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
    pendingRootFitRef.current = null;
    void reactFlow.fitView(fit === 'glide' ? { padding: 0.15, duration: 500 } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingRootFitRef is a stable useRef identity (owned by useDrillNavigation) read through .current
  }, [compiled, arrangedGeometry, settledFor, reactFlow]);
}
