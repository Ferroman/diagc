import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { applyNodeChanges, type Node, type ReactFlowInstance } from '@xyflow/react';
import type { CompiledView } from '@diagc/core/internal';
import { alignBoxes, distributeBoxes, dropDescendants, type AlignMode, type Delta } from './arrange';
import type { Box } from './box';
import { pinnedRows, pinRows } from './copy-ids';
import { NUDGE_STEP, useNudge, type Positions } from './useNudge';

export interface NudgeAndArrangeInput {
  editing: boolean;
  /** the PNG export: no one at the keyboard, no toolbar */
  chromeless: boolean;
  /** the pen or the laser owns the canvas */
  gestureCaptured: boolean;
  /** the host offers to save view-mode positions */
  savesViewPositions: boolean;
  snapGrid: number | undefined;
  reactFlow: ReactFlowInstance;
  rfNodes: Node[];
  rfNodesRef: MutableRefObject<Node[]>;
  setRfNodes: Dispatch<SetStateAction<Node[]>>;
  commitMoves: (positions: Positions) => void;
  /** the view on screen: a plan's pinned rows (grouped, or hiding) move on x only */
  compiledRef?: MutableRefObject<Pick<CompiledView, 'pinnedRows'>>;
}

export interface NudgeAndArrange {
  nudge: ReturnType<typeof useNudge>;
  /** what align/distribute act on */
  selectedIds: string[];
  canArrange: boolean;
  arrangeSelection: (fn: (boxes: Box[]) => Record<string, Delta>) => void;
  /** line the selection up (the toolbar's and the host's command) */
  alignSelection: (mode: AlignMode) => void;
  /** space the selection evenly */
  distributeSelection: (axis: 'x' | 'y') => void;
}

/** The arrow keys, and align/distribute over the selection. */
export function useNudgeAndArrange(input: NudgeAndArrangeInput): NudgeAndArrange {
  const { chromeless, gestureCaptured, reactFlow, rfNodes, rfNodesRef, setRfNodes, commitMoves, compiledRef } = input;
  // what a key or an arrange may move a node to: a pinned row keeps its y (copy-ids.ts)
  const pin = (moves: Positions): Positions =>
    pinRows(moves, rfNodesRef.current, pinnedRows(compiledRef?.current ?? {}));
  // Arrow keys (see useNudge). The step follows the snap grid when one is on,
  // so a nudge lands on the same grid a drag would.
  const nudge = useNudge({
    enabled: !chromeless && !gestureCaptured,
    step: input.snapGrid ?? NUDGE_STEP,
    nodesRef: rfNodesRef,
    applyMoves: (moves) =>
      setRfNodes((nds) =>
        applyNodeChanges(
          Object.entries(moves).map(([id, position]) => ({ type: 'position' as const, id, position })),
          nds,
        ),
      ),
    commit: commitMoves,
    constrain: pin,
  });
  // What align/distribute act on: the selection minus the nodes nothing may move
  // (see `draggable` in nodeFrameProps). They are neither moved nor
  // lined up against, so two fish nodes are no selection to arrange and the
  // toolbar stays away.
  const selectedIds = useMemo(
    () => rfNodes.filter((n) => n.selected === true && n.draggable !== false).map((n) => n.id),
    [rfNodes],
  );
  // Arrange buttons need somewhere for the result to land: edit mode has the
  // host's command pipeline; view mode only the host's Save positions offer,
  // so the published viewer (which passes neither) never shows them.
  const canArrange = !chromeless && !gestureCaptured && (input.editing || input.savesViewPositions);
  const arrangeSelection = (fn: (boxes: Box[]) => Record<string, Delta>) => {
    nudge.flush(); // a pending keyboard burst must land before this batch
    const byId = new Map(rfNodesRef.current.map((n) => [n.id, n] as const));
    const ids = dropDescendants(selectedIds, (id) => byId.get(id)?.parentId);
    const boxes: Box[] = [];
    for (const id of ids) {
      const n = byId.get(id);
      const abs = reactFlow.getInternalNode(id)?.internals.positionAbsolute;
      const w = n?.measured?.width;
      const h = n?.measured?.height;
      if (n === undefined || abs === undefined || w === undefined || h === undefined) continue;
      boxes.push({ id, x: abs.x, y: abs.y, w, h });
    }
    const asked: Positions = {};
    for (const [id, d] of Object.entries(fn(boxes))) {
      const n = byId.get(id)!;
      asked[id] = { x: n.position.x + d.dx, y: n.position.y + d.dy };
    }
    const positions = pin(asked);
    if (Object.keys(positions).length === 0) return;
    // Move at once: the commit re-derives the same positions a frame later,
    // but only if the host's onNodesMoved is synchronous — React 18 then
    // batches that re-derivation with this setRfNodes into one render. An
    // async host would let useNodeResync's layout effect run in between and
    // briefly snap the boxes back to their pre-arrange positions.
    setRfNodes((nds) =>
      applyNodeChanges(
        Object.entries(positions).map(([id, position]) => ({ type: 'position' as const, id, position })),
        nds,
      ),
    );
    commitMoves(positions);
  };
  const alignSelection = (mode: AlignMode) => arrangeSelection((boxes) => alignBoxes(boxes, mode));
  const distributeSelection = (axis: 'x' | 'y') => arrangeSelection((boxes) => distributeBoxes(boxes, axis));
  return { nudge, selectedIds, canArrange, arrangeSelection, alignSelection, distributeSelection };
}
