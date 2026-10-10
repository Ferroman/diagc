import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { applyNodeChanges, type Node, type NodeChange, type OnNodeDrag, type ReactFlowInstance } from '@xyflow/react';
import type { DiagramModel, Point } from '@diagc/core/internal';
import type { NodeGeometry } from '../layout/layout';
import { splitNoteDrag } from '../notes/note-drag';
import type { NotationProfile } from '../notations';
import { dropOffset, laneDrop, movesLeft, snapBackResets } from './drag-outcome';
import { withoutMeasuredExpansion } from './expand-parent';
import { GUIDE_THRESHOLD_PX, snapDragFrame, type Guide, type SnapMemo } from './guides';
import { withDropTarget } from './node-copy';
import { dropExclusions, dropTargetAt, type DropRect } from './plan-drop';
import type { Positions } from './useNudge';
import type { EditingApi } from './view-types';

/** Client coordinates off a React Flow drag event. React Flow types the event
 * `MouseEvent | TouchEvent` (a drag CAN start from a touch), so `.clientX` is
 * narrowed rather than assumed — same reasoning as DiagramView's
 * droppedOnNodeId, just for the union React Flow itself hands back here. */
const clientPointOf = (e: MouseEvent | TouchEvent): Point =>
  'clientX' in e ? { x: e.clientX, y: e.clientY } : { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 };

export interface NodeDraggingInput {
  editing: boolean;
  edit: EditingApi | undefined;
  model: DiagramModel;
  plane: string | undefined;
  profile: NotationProfile;
  reactFlow: ReactFlowInstance;
  /** React Flow's copy of the nodes, kept current in the gesture's own task */
  rfNodesRef: MutableRefObject<Node[]>;
  setRfNodes: Dispatch<SetStateAction<Node[]>>;
  /** the nodes as laid out: where a snap-back returns a node to */
  allNodesRef: MutableRefObject<Node[]>;
  arrangedRef: MutableRefObject<ReadonlyMap<string, NodeGeometry> | null>;
  /** lands a pending arrow-key burst */
  flushNudge: () => void;
  commitMoves: (onScreen: Positions) => void;
}

export interface NodeDragging {
  guides: Guide[];
  dragging: boolean;
  /** <ReactFlow>'s drag props, `onNodeDrag` only while a drop can land */
  handlers: {
    onNodesChange: (changes: NodeChange[]) => void;
    onNodeDragStart: () => void;
    onNodeDrag?: OnNodeDrag;
    onNodeDragStop: OnNodeDrag;
  };
}

// The deepest drop target (profile.node.dropTarget) under `point` for a
// SINGLE dragged box, or undefined. Read by both onNodeDrag (the drag-over
// outline) and onNodeDragStop (the actual report), so the two can never
// disagree about what counts as a hit.
//
// Eligibility (which box may be reported at all) is the notation's own
// call, not derived from layout facts: `profile.node.canDrop` — a zone's or
// an event's drag already means something else (planMoves reads it as a
// date change) whether or not it happens to land on another zone's rect
// (root zones are free on y and can overlap a sibling's bar just as readily
// as a nested zone crosses its own parent's — zones/events are never
// dropped into anything), while an actor or a plain box is exactly what a
// zone receives — nested or not, which `fixed` (a layout fact, not a
// statement of intent) cannot tell apart.
function dropTargetFor(input: NodeDraggingInput, draggedId: string, point: Point): string | undefined {
  const { model, profile, reactFlow } = input;
  const dropTarget = profile.node?.dropTarget;
  if (dropTarget === undefined) return undefined;
  const draggedNode = model.nodes.find((n) => n.id === draggedId);
  if (draggedNode === undefined || profile.node?.canDrop?.(draggedNode) !== true) return undefined;
  const exclude = dropExclusions(
    input.rfNodesRef.current,
    draggedId,
    profile.related?.(model, input.plane, draggedId) ?? [],
  );
  const rects: DropRect[] = [];
  for (const n of model.nodes) {
    if (!dropTarget(n)) continue;
    const internal = reactFlow.getInternalNode(n.id);
    const abs = internal?.internals.positionAbsolute;
    const w = internal?.measured?.width;
    const h = internal?.measured?.height;
    if (abs === undefined || w === undefined || h === undefined) continue;
    rects.push({ id: n.id, x: abs.x, y: abs.y, w, h });
  }
  return dropTargetAt(point, rects, exclude);
}

/** Dragging boxes and notes: the alignment guides, the drop-target outline, and
 * what a finished drag reports — a note's offset, a drop, a lane reorder, a
 * snap-back, or a move. */
export function useNodeDragging(input: NodeDraggingInput): NodeDragging {
  const { editing, edit, model, profile, reactFlow, rfNodesRef, setRfNodes, commitMoves } = input;
  // Alignment guides drawn while a single node is dragged (see snapDragChanges);
  // cleared every frame that yields no lines, which includes drop (the final
  // frame carries dragging: false).
  const [guides, setGuides] = useState<Guide[]>([]);
  const snapMemoRef = useRef<SnapMemo | null>(null);
  // A drag is in flight. While one is, NO node glides (see `.dg-dragging` in
  // styles.css): the dragged node's container grows and its siblings are
  // re-expressed every frame, and a 200ms transition on those would leave the
  // box trailing the child it is supposed to hold — and React Flow measuring a
  // half-grown box, which it then grows from.
  const [dragging, setDragging] = useState(false);
  // The same fact, readable inside onNodesChange in the very task the gesture
  // starts in (the state above lands a render later).
  const draggingRef = useRef(false);
  // The drop target the pointer is over during a single-node drag (see
  // dropTargetFor). A ref, not a state pair: the re-render that draws
  // the outline is already driven by the setRfNodes call beside every write
  // to this ref (same identity-preserving patch soleSelection makes for a
  // click's selection), and the stop handler needs to read/clear it in the
  // same task the last drag frame set it in, same reason as draggingRef.
  const dropTargetRef = useRef<string | undefined>(undefined);

  // Whether the drop gesture is live at all on this render — the same test
  // reportDrop below makes for the drop itself, kept here as its own name
  // because the drag-over OUTLINE additionally needs it before a single
  // pointer frame has happened, to decide whether to hand React Flow a
  // handler at all (see `handlers` below).
  const dropEnabled = editing && edit?.onDropInto !== undefined && profile.node?.dropTarget !== undefined;
  // The drag-over outline (data-drop-target, DiagramNode): single-node drags
  // only (a selection drag is always a move — see onNodeDragStop). Recomputed
  // every frame but only PATCHED into the node copy when the target actually
  // changes, the same one-or-two-boxes-touched shape as soleSelection. Handed
  // to <ReactFlow> only when dropEnabled (see `handlers` below), not wired
  // unconditionally: XYDrag.updateNodes only builds its per-frame
  // getEventHandlerParams() call when onDrag/onNodeDrag/onSelectionDrag is
  // present, so a notation without the feature — six of the seven today —
  // must not hand one over, or every drag on every plane pays a frame of
  // work it never asked for.
  const onDragFrame: OnNodeDrag = (e, node, nodes) => {
    const target =
      nodes.length === 1 ? dropTargetFor(input, node.id, reactFlow.screenToFlowPosition(clientPointOf(e))) : undefined;
    if (target === dropTargetRef.current) return;
    dropTargetRef.current = target;
    setRfNodes((prev) => withDropTarget(prev, target));
  };

  // Moves both copies of the nodes at once: the stop handler's commit reads
  // rfNodesRef in this same task.
  const moveNow = (positions: Positions) => {
    const changes = Object.entries(positions).map(([id, position]) => ({ type: 'position' as const, id, position }));
    rfNodesRef.current = applyNodeChanges(changes, rfNodesRef.current);
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  };
  // A single dragged box may be a DROP instead of a move: reported to the
  // host, and true so the caller keeps it out of commitMoves. Multi-node drags
  // are always moves — dropTargetFor is only ever asked about ONE box, same as
  // the outline above.
  const reportDrop = (id: string, e: MouseEvent | TouchEvent): boolean => {
    if (edit?.onDropInto === undefined || profile.node?.dropTarget === undefined) return false;
    const targetId = dropTargetFor(input, id, reactFlow.screenToFlowPosition(clientPointOf(e)));
    const draggedAbs = targetId !== undefined ? reactFlow.getInternalNode(id)?.internals.positionAbsolute : undefined;
    const targetAbs =
      targetId !== undefined ? reactFlow.getInternalNode(targetId)?.internals.positionAbsolute : undefined;
    if (targetId === undefined || draggedAbs === undefined || targetAbs === undefined) return false;
    edit.onDropInto(id, targetId, dropOffset(draggedAbs, targetAbs));
    return true;
  };
  const laidAt = (id: string) => input.allNodesRef.current.find((n) => n.id === id)?.position;
  // Snap back (see snapBackResets): nodes the notation drags only to drop them.
  const snapBack = (boxIds: readonly string[]): { skip: string[]; resets: Positions } => {
    const snapsBack = profile.node?.snapsBack;
    if (snapsBack === undefined) return { skip: [], resets: {} };
    return snapBackResets(
      boxIds,
      (id) => {
        const modelNode = model.nodes.find((n) => n.id === id);
        return modelNode !== undefined && snapsBack(modelNode);
      },
      laidAt,
    );
  };
  // A dragged lane (see laneDrop) reports its reorder, if any, and snaps back
  // into a band either way (into `resets`); the reorder restacks the frame on
  // the model change. True when the box was a lane.
  const reorderLane = (id: string, resets: Positions): boolean => {
    if (edit?.onMoveLane === undefined) return false;
    const reorder = laneDrop(rfNodesRef.current, id, input.arrangedRef.current);
    if (reorder === undefined) return false;
    const pos = laidAt(id);
    if (pos !== undefined) resets[id] = pos;
    if (reorder.offset !== 0) edit.onMoveLane(reorder.frameId, id, reorder.offset);
    return true;
  };
  // React Flow hands over every node the gesture moved (a selection drags as
  // one), so a multi-node drag lands as a single batch.
  //
  // Positions come from OUR node copy, not from the event: for a child with
  // expandParent the event carries XYDrag's raw position, which is neither
  // clamped to the (moving) parent nor guide-snapped.
  const onNodeDragStop: OnNodeDrag = (e, _node, nodes) => {
    draggingRef.current = false;
    setDragging(false);
    // Clear the drag-over outline regardless of outcome — both copies, same
    // reason onNodesChange keeps the ref in step: commitMoves below reads
    // rfNodesRef synchronously, in this same task.
    if (dropTargetRef.current !== undefined) {
      dropTargetRef.current = undefined;
      rfNodesRef.current = withDropTarget(rfNodesRef.current, undefined);
      setRfNodes((prev) => withDropTarget(prev, undefined));
    }
    const now = new Map(rfNodesRef.current.map((n) => [n.id, n.position] as const));
    // The arithmetic (and why notes and boxes land in different places)
    // lives in note-drag.ts, where it is testable without a pointer.
    const { notes, boxes } = splitNoteDrag(nodes, now);
    for (const n of notes) edit?.onNoteMoved?.(n.target, n.offset);

    const skip = new Set<string>();
    const boxIds = Object.keys(boxes);
    if (boxIds.length === 1 && reportDrop(boxIds[0]!, e)) skip.add(boxIds[0]!);
    const { skip: snappedBack, resets } = snapBack(boxIds);
    for (const id of snappedBack) skip.add(id);
    if (boxIds.length === 1 && reorderLane(boxIds[0]!, resets)) skip.add(boxIds[0]!);
    if (Object.keys(resets).length > 0) moveNow(resets);

    // commitMoves early-returns on an empty map, so a note-only (or
    // fully reported/snapped-back) drag never reaches the host's move
    // pipeline at all.
    commitMoves(movesLeft(boxes, skip));
  };

  // 'remove' stays out: element existence belongs to the model. The delete
  // key reaches the host through DiagramView's onDelete instead — letting
  // React Flow remove locally would only ghost-delete until the next model
  // rebuild resurrected the elements.
  //
  // Guides: a single dragged node snaps to its siblings' edges and centres
  // (see snapDragChanges). Grid snapping already happened inside React Flow's
  // drag handler, so a guide in reach beats the grid.
  const onNodesChange = (changes: NodeChange[]) => {
    const snapped = snapDragFrame(
      changes,
      {
        nodes: rfNodesRef.current,
        absoluteOf: (id) => reactFlow.getInternalNode(id)?.internals.positionAbsolute,
      },
      GUIDE_THRESHOLD_PX / reactFlow.getZoom(),
      snapMemoRef,
    );
    setGuides((g) => (g.length === 0 && snapped.lines.length === 0 ? g : snapped.lines));
    // 'remove' stays out (see above); so does an expandParent expansion
    // that was not asked for by a drag (see expand-parent.ts).
    const kept = withoutMeasuredExpansion(snapped.changes, draggingRef.current).filter((c) => c.type !== 'remove');
    // Advanced in step with the state, not left to the next render: a
    // gesture's last change and onNodeDragStop arrive in the same task,
    // and the stop handler's commit reads the final on-screen positions from here.
    rfNodesRef.current = applyNodeChanges(kept, rfNodesRef.current);
    setRfNodes((nds) => applyNodeChanges(kept, nds));
  };
  // A pointer drag must not race a pending keyboard burst.
  const onNodeDragStart = () => {
    input.flushNudge();
    draggingRef.current = true;
    setDragging(true);
  };

  return {
    guides,
    dragging,
    handlers: {
      onNodesChange,
      onNodeDragStart,
      // onDragFrame is spread in, not just conditionally invoked from inside an
      // always-present handler — React Flow's own `onDrag || onNodeDrag ||
      // onSelectionDrag` presence check (XYDrag.updateNodes) needs the KEY
      // missing, not merely a no-op function sitting behind it, or it still
      // does the per-frame work of building drag params to hand a no-op.
      ...(dropEnabled ? { onNodeDrag: onDragFrame } : {}),
      onNodeDragStop,
    },
  };
}
