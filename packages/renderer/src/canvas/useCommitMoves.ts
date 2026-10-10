import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Node } from '@xyflow/react';
import { isActivityBand, type Point } from '@diagc/core/internal';
import { savedPositions, type Shift } from '../layout/fit-containers';
import type { NodeGeometry } from '../layout/layout';
import type { Positions } from './useNudge';
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
  const { editing, edit, rfNodesRef, containerBasesRef, containerShiftsRef, arrangedRef, setViewPositions } = input;
  return useCallback(
    (onScreen: Positions) => {
      if (Object.keys(onScreen).length === 0) return;
      const typeOf = (id: string) =>
        (rfNodesRef.current.find((n) => n.id === id)?.data as { typeId?: string } | undefined)?.typeId;
      const positions = savedPositions(
        onScreen,
        rfNodesRef.current,
        containerBasesRef.current,
        containerShiftsRef.current,
        // an activity lane is banded at a fixed spot (arrangeActivityFrames)
        (parentId) => isActivityBand(typeOf(parentId)),
      );
      // displacement from the ARRANGED spot (parent-relative on both sides):
      // a notation that derives positions reads this, not the position
      const arranged = arrangedRef.current;
      const deltas = Object.fromEntries(
        Object.entries(positions).map(([id, pos]) => {
          const g = arranged?.get(id);
          return [id, g === undefined ? { dx: 0, dy: 0 } : { dx: pos.x - g.x, dy: pos.y - g.y }];
        }),
      );
      if (editing) {
        if (edit?.onNodesMoved !== undefined) edit.onNodesMoved(positions, deltas);
        else for (const [id, pos] of Object.entries(positions)) edit?.onNodeMoved?.(id, pos);
      } else {
        setViewPositions((p) => ({ ...p, ...positions }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the four refs and setViewPositions are stable useRef/useState identities from DiagramView, read at gesture time
    [editing, edit],
  );
}
