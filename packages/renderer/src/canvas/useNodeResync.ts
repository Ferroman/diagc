import { useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Node } from '@xyflow/react';
import type { Positions } from './useNudge';

export interface NodeResyncInput {
  /** what the copy is refreshed from (useFlowNodes) */
  allNodes: Node[];
  /** the boxes alone: a selection claim names one of them */
  derivedNodes: Node[];
  setRfNodes: Dispatch<SetStateAction<Node[]>>;
  /** a node a label request is waiting to select (useEditRequests) */
  selectOnAppearRef: MutableRefObject<string | null>;
  /** the arrow-key moves not yet committed (useNudge) */
  pendingRef: MutableRefObject<Positions>;
}

/**
 * Refreshes React Flow's copy of the nodes from the derived ones, in a layout
 * effect so a derived-node change never paints a stale frame first. Called
 * after the nudge, whose pending moves it keeps.
 */
export function useNodeResync(input: NodeResyncInput): void {
  const { allNodes, derivedNodes, setRfNodes, selectOnAppearRef, pendingRef } = input;
  // Resync must not wipe flags React Flow owns on its copy — selection drives
  // the image-node resizer, and a selection click itself re-renders the app,
  // recomputing derivedNodes in the same tick.
  useLayoutEffect(() => {
    // ...except a claim left by a label request whose node had not been laid out
    // yet (see useEditRequests): the first resync that carries the node hands
    // it the selection, so the ring and the quick-add button land on the box the caret
    // is in. Read before the updater so the ref is cleared exactly once.
    // The claim is still checked against the BOXES: a label request always names
    // a model node, and a note is never one of them.
    const claim = selectOnAppearRef.current;
    const claimed = claim !== null && derivedNodes.some((n) => n.id === claim) ? claim : null;
    if (claimed !== null) selectOnAppearRef.current = null;
    setRfNodes((prev) => {
      const selected =
        claimed !== null ? new Set([claimed]) : new Set(prev.filter((n) => n.selected === true).map((n) => n.id));
      // A nudge not yet committed must not be undone by a resync in its idle
      // window: keep the pending position, exactly as the selection is kept.
      const pending = pendingRef.current;
      if (selected.size === 0 && Object.keys(pending).length === 0) return allNodes;
      return allNodes.map((n) => {
        const p = pending[n.id];
        const s = selected.has(n.id);
        if (!s && p === undefined) return n;
        return { ...n, ...(s ? { selected: true } : {}), ...(p !== undefined ? { position: p } : {}) };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingRef and selectOnAppearRef are stable useRef identities read through .current, and setRfNodes a stable useState setter, all from DiagramView's hooks; derivedNodes is left out because allNodes is derived from it and changes with it (depending on both would only run this twice)
  }, [allNodes]);
}
