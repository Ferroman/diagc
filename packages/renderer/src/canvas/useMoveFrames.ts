import { useMemo, useRef, type MutableRefObject } from 'react';
import type { CompiledView, Point, ViewNode } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import type { ViewLayout } from './useViewLayout';

export interface MoveFrames {
  /** the arranged geometry: a move's displacement is measured from it */
  arrangedRef: MutableRefObject<ReadonlyMap<string, NodeGeometry> | null>;
  /** each open container's origin before the fit pass shifted it */
  containerBasesRef: MutableRefObject<ReadonlyMap<string, Point>>;
  containerShiftsRef: MutableRefObject<ViewLayout['containerShifts']>;
  /** the layout's view-only y shifts, taken back off a committed position */
  viewShiftRef: MutableRefObject<ViewLayout['viewShift']>;
  /** the layout's drill frames (LayoutResult.savedFrame), taken back off too */
  savedFrameRef: MutableRefObject<ViewLayout['savedFrame']>;
  /** drawn px per saved px on x (a stretched plan; saved-frame.ts) */
  scaleRef: MutableRefObject<number>;
}

const NO_VIEW_SHIFT: ViewLayout['viewShift'] = new Map();
const NO_FRAMES: ViewLayout['savedFrame'] = new Map();

/**
 * The frames a move is committed against, as render-phase refs: commitMoves
 * (useCommitMoves) and the drag stop read them at gesture time, and their
 * hand-managed dependency lists must not grow with every re-layout.
 */
export function useMoveFrames(
  compiled: CompiledView,
  layout: Pick<ViewLayout, 'arrangedGeometry' | 'containerShifts'> &
    Partial<Pick<ViewLayout, 'viewShift' | 'savedFrame'>>,
  scaleRef: MutableRefObject<number> = { current: 1 },
): MoveFrames {
  const { arrangedGeometry, containerShifts, viewShift = NO_VIEW_SHIFT, savedFrame = NO_FRAMES } = layout;
  const arrangedRef = useRef(arrangedGeometry);
  arrangedRef.current = arrangedGeometry;

  // Where each open container's origin sits BEFORE the fit pass shifted it, in
  // absolute flow coordinates — the frame a child's saved position is relative
  // to (see fit-containers.ts). Summed root-first, the same order commitMoves
  // sums the on-screen chain, so with no shift the two are the same float and
  // a saved position is exactly the on-screen one.
  const containerBases = useMemo(() => {
    const bases = new Map<string, Point>();
    if (arrangedGeometry === null) return bases;
    const walk = (n: ViewNode, ox: number, oy: number) => {
      const g = arrangedGeometry.get(n.id);
      if (g === undefined) return;
      const x = ox + g.x;
      const y = oy + g.y;
      if (n.children.length === 0) return;
      const shift = containerShifts.get(n.id);
      bases.set(n.id, { x: x - (shift?.dx ?? 0), y: y - (shift?.dy ?? 0) });
      n.children.forEach((c) => walk(c, x, y));
    };
    compiled.roots.forEach((r) => walk(r, 0, 0));
    return bases;
  }, [compiled, arrangedGeometry, containerShifts]);
  const containerBasesRef = useRef<ReadonlyMap<string, Point>>(containerBases);
  containerBasesRef.current = containerBases;
  const containerShiftsRef = useRef(containerShifts);
  containerShiftsRef.current = containerShifts;
  const viewShiftRef = useRef(viewShift);
  viewShiftRef.current = viewShift;
  const savedFrameRef = useRef(savedFrame);
  savedFrameRef.current = savedFrame;
  return { arrangedRef, containerBasesRef, containerShiftsRef, viewShiftRef, savedFrameRef, scaleRef };
}
