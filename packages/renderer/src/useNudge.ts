import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type MutableRefObject } from 'react';
import type { Node } from '@xyflow/react';

export type Positions = Record<string, { x: number; y: number }>;

export interface NudgeInput {
  /** off for the chrome-less export (no one at the keyboard) and while the pen/laser owns the canvas */
  enabled: boolean;
  /** flow px per arrow press; Shift multiplies by NUDGE_SHIFT_FACTOR */
  step: number;
  /** React Flow's copy of the nodes: selection flags + current positions */
  nodesRef: MutableRefObject<Node[]>;
  /** move the nodes on screen right away (React Flow position changes) */
  applyMoves: (moves: Positions) => void;
  /** persist a burst of moves — DiagramView's commit funnel */
  commit: (positions: Positions) => void;
}

export const NUDGE_STEP = 5;
export const NUDGE_SHIFT_FACTOR = 4;
export const NUDGE_IDLE_MS = 300;

const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const inField = (el: Element | null): boolean => {
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement | null)?.isContentEditable === true;
};

/**
 * Arrow keys move the selected nodes.
 *
 * Our own handler rather than React Flow's built-in one, which is gated on
 * `nodesDraggable`: in view mode that would need Alt held, and Alt+← is Back
 * in Chrome. Bound in the CAPTURE phase on the canvas wrapper so React Flow's
 * node-level handler never sees the key (and never moves the node a second time).
 *
 * Moves apply to the React Flow copy at once and are persisted as ONE batch
 * after a short idle — a held key is one undo step, not thirty — or sooner
 * when a pointer drag starts, focus leaves the node, or the canvas unmounts.
 * `pendingRef` exposes the not-yet-committed positions so DiagramView's
 * derived-node resync can keep them on screen until the commit lands.
 *
 * A modifier held with the arrow (Alt/Ctrl/Cmd+←/→/↑/↓ — Back, word-jump, …)
 * is claimed with `stopPropagation()` alone, no `preventDefault()` and no
 * move: the browser must still get to run its own shortcut, but React Flow's
 * node-level `onKeyDown` (gated on `nodesDraggable`, not on any modifier)
 * must NOT see the bubbled key either, or it performs its own uncommitted
 * nudge — the exact lost-move this hook exists to prevent.
 *
 * The target check also accepts React Flow's own marquee selection rectangle
 * (`.react-flow__nodesselection-rect`), which renders OUTSIDE `.react-flow__node`
 * but is where focus sits after a marquee drag — arrow keys there must nudge
 * the whole selection the same as they would from a single selected node.
 */
export function useNudge(input: NudgeInput) {
  const pendingRef = useRef<Positions>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read through a ref: the handlers below are bound once, the inputs change
  // every render (the commit funnel closes over the host's callbacks).
  const inputRef = useRef(input);
  inputRef.current = input;

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const pending = pendingRef.current;
    if (Object.keys(pending).length === 0) return;
    pendingRef.current = {};
    inputRef.current.commit(pending);
  }, []);

  const onKeyDownCapture = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const { enabled, step, nodesRef, applyMoves } = inputRef.current;
      const dir = ARROWS[e.key];
      if (!enabled || dir === undefined) return;
      const target = e.target as Element | null;
      if (inField(target)) return;
      if ((target?.closest('.react-flow__node, .react-flow__nodesselection-rect') ?? null) === null) return;
      const selected = nodesRef.current.filter((n) => n.selected === true);
      if (selected.length === 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        // Claim it (so React Flow's own node onKeyDown never performs an
        // uncommitted nudge of its own) but leave the browser's shortcut alone.
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const d = step * (e.shiftKey ? NUDGE_SHIFT_FACTOR : 1);
      const moves: Positions = {};
      for (const n of selected) {
        const cur = pendingRef.current[n.id] ?? n.position;
        moves[n.id] = { x: cur.x + dir.x * d, y: cur.y + dir.y * d };
      }
      pendingRef.current = { ...pendingRef.current, ...moves };
      applyMoves(moves);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, NUDGE_IDLE_MS);
    },
    [flush],
  );

  const onBlurCapture = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (((e.target as Element | null)?.closest('.react-flow__node') ?? null) !== null) flush();
    },
    [flush],
  );

  // unmount: never lose a burst that was still waiting out its idle window
  useEffect(() => flush, [flush]);

  return { onKeyDownCapture, onBlurCapture, flush, pendingRef };
}
