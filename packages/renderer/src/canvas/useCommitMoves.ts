import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Node } from '@xyflow/react';
import { isActivityBand, type Point } from '@diagc/core/internal';
import { savedPositions, type Shift } from '../layout/fit-containers';
import type { NodeGeometry } from '../layout/layout';
import type { Positions } from './useNudge';
import { savedX, toSaved } from './saved-frame';
import type { EditingApi } from './view-types';

export interface CommitMovesInput {
  editing: boolean;
  edit: EditingApi | undefined;
  /** React Flow's copy of the nodes, current in the gesture's own task */
  rfNodesRef: MutableRefObject<Node[]>;
  /** each open container's origin before the fit pass shifted it, absolute */
  containerBasesRef: MutableRefObject<ReadonlyMap<string, Point>>;
  containerShiftsRef: MutableRefObject<ReadonlyMap<string, Shift>>;
  arrangedRef: MutableRefObject<ReadonlyMap<string, NodeGeometry> | null>;
  /** the layout's view-only y shifts (LayoutResult.viewShift): on screen, not saved */
  viewShiftRef: MutableRefObject<ReadonlyMap<string, number>>;
  /** the layout's drill frames (LayoutResult.savedFrame): on screen, not saved */
  savedFrameRef: MutableRefObject<ReadonlyMap<string, Point>>;
  /** drawn px per saved px on x (a stretched plan's day width; see saved-frame.ts) */
  scaleRef?: MutableRefObject<number>;
  setViewPositions: Dispatch<SetStateAction<Record<string, Point>>>;
}

/**
 * Every way a box can move — a drag, a multi-node drag, an arrow-key nudge,
 * an align/distribute — ends here, so the two modes' persistence paths are
 * decided in exactly one place: edit mode hands the batch to the host (one
 * undo step), view mode keeps it as throwaway drag state the host may offer
 * to save (onViewPositionsChange → the studio's Save positions chip).
 *
 * `onScreen` is what React Flow holds (parent-relative, against the parent's
 * origin as drawn). What gets saved is relative to the parent's UNSHIFTED
 * origin — they differ once a container has grown left/up around a child
 * (fit-containers.ts), or is doing so right now under expandParent.
 */
export function useCommitMoves(input: CommitMovesInput): (onScreen: Positions) => void {
  const {
    editing,
    edit,
    rfNodesRef,
    containerBasesRef,
    containerShiftsRef,
    arrangedRef,
    viewShiftRef,
    savedFrameRef,
    scaleRef,
    setViewPositions,
  } = input;
  return useCallback(
    (onScreen: Positions) => {
      if (Object.keys(onScreen).length === 0) return;
      const typeOf = (id: string) =>
        (rfNodesRef.current.find((n) => n.id === id)?.data as { typeId?: string } | undefined)?.typeId;
      const drawn = savedPositions(
        onScreen,
        rfNodesRef.current,
        { bases: containerBasesRef.current, shifts: containerShiftsRef.current },
        // an activity lane is banded at a fixed spot (arrangeActivityFrames)
        (parentId) => isActivityBand(typeOf(parentId)),
      );
      // displacement from the ARRANGED spot, both as drawn (parent-relative on
      // both sides): a notation that derives positions reads this, not the
      // position — a plan zone's days are its dx
      const arranged = arrangedRef.current;
      const deltas = Object.fromEntries(
        Object.entries(drawn).map(([id, pos]) => {
          const g = arranged?.get(id);
          return [id, g === undefined ? { dx: 0, dy: 0 } : { dx: savedX({ scaleRef }, pos.x - g.x), dy: pos.y - g.y }];
        }),
      );
      // what is saved: without the fold shift and the drill frame, at 20 px a
      // day (saved-frame.ts) — the displacement too, so a plan reads its days
      // off it at the width it saves in
      const frames = { savedFrameRef, viewShiftRef, ...(scaleRef !== undefined ? { scaleRef } : {}) };
      const positions = Object.fromEntries(Object.entries(drawn).map(([id, p]) => [id, toSaved(frames, id, p)]));
      if (editing) {
        if (edit?.onNodesMoved !== undefined) edit.onNodesMoved(positions, deltas);
        else for (const [id, pos] of Object.entries(positions)) edit?.onNodeMoved?.(id, pos);
      } else {
        setViewPositions((p) => ({ ...p, ...positions }));
      }
    },
    /* eslint-disable-next-line react-hooks/exhaustive-deps --
       the six refs and setViewPositions are stable useRef/useState identities from DiagramView's hooks, read
       at gesture time */
    [editing, edit],
  );
}
