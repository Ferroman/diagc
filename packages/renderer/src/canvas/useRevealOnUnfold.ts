import { useEffect, type MutableRefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { CompiledView, ViewNode } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import type { Bounds } from './content-bounds';
import { revealViewport } from './reveal';
import type { RootFit } from './useDrillNavigation';
import type { ViewLayout } from './useViewLayout';

/** screen px kept clear around a revealed box */
export const REVEAL_PAD = 24;
/** the camera's move, animated: a jump would lose the reader's place */
export const REVEAL_DURATION_MS = 300;

export interface RevealInput {
  /** the box a fold chip just opened, waiting for its layout (DiagramView) */
  pendingRevealRef: MutableRefObject<string | null>;
  /** a whole-scene fit on its way (useDrillNavigation): it shows the box too */
  pendingRootFitRef: MutableRefObject<RootFit | null>;
  compiled: CompiledView;
  layout: Pick<ViewLayout, 'arrangedGeometry' | 'settledFor'>;
  reactFlow: ReactFlowInstance;
  wrapperRef: MutableRefObject<HTMLDivElement | null>;
}

/**
 * A box opened from its fold chip comes into view: once the layout of the scene
 * it is open in has landed, the camera pans to it when it fits at this zoom,
 * and zooms out to fit it when it does not (reveal.ts). Without this an open
 * box grows off the bottom or the side of the frame, and what the reader asked
 * to see is where they cannot see it. The whole-scene fit of a drill (useRootFit)
 * takes precedence: it shows everything, the box included.
 *
 * "Once the layout has landed" is `settledFor`, for the reason useRootFit gives:
 * the arrangement on hand right after the fold is the OLD scene's.
 */
export function useRevealOnUnfold(input: RevealInput): void {
  const { pendingRevealRef, pendingRootFitRef, compiled, reactFlow, wrapperRef } = input;
  const { arrangedGeometry, settledFor } = input.layout;
  useEffect(() => {
    const id = pendingRevealRef.current;
    if (id === null || arrangedGeometry === null || settledFor !== compiled) return;
    pendingRevealRef.current = null;
    if (pendingRootFitRef.current !== null) return;
    const box = openBox(compiled, arrangedGeometry, id);
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (box === undefined || rect === undefined || rect.width === 0 || rect.height === 0) return;
    const next = revealViewport(box, reactFlow.getViewport(), rect, REVEAL_PAD);
    if (next !== null) void reactFlow.setViewport(next, { duration: REVEAL_DURATION_MS });
    /* eslint-disable-next-line react-hooks/exhaustive-deps --
       the refs are stable useRef identities (DiagramView's and useDrillNavigation's) read through .current */
  }, [compiled, arrangedGeometry, settledFor, reactFlow]);
}

/** the absolute box of `id`, while the view draws it open; undefined when it is
 * folded or not drawn — a host that ignored the chip opened nothing to show */
function openBox(compiled: CompiledView, geometry: ReadonlyMap<string, NodeGeometry>, id: string): Bounds | undefined {
  let found: Bounds | undefined;
  const walk = (n: ViewNode, ox: number, oy: number): void => {
    const g = geometry.get(n.id);
    if (g === undefined) return;
    const x = ox + g.x;
    const y = oy + g.y;
    if (n.id === id) {
      if (n.state === 'expanded') found = { x, y, width: g.width, height: g.height };
      return;
    }
    if (n.state === 'expanded') n.children.forEach((c) => walk(c, x, y));
  };
  compiled.roots.forEach((r) => walk(r, 0, 0));
  return found;
}
