import { useRef } from 'react';

/** A click event's screen point + timestamp — the pair that "double-click"
 * correlation keys on. Both protocols (node drill, edge add-label) record the
 * first click of a gesture here and match the second against it. */
interface CorrelatedClick {
  id: string;
  clientX: number;
  clientY: number;
  at: number;
}

/** the minimal event shape the correlation window reads */
export type CorrelationEvent = { clientX: number; clientY: number };

// Double-click-to-add correlation window: how recent/close a preceding edge
// click must be for a following double-click (wrapper) or pane click (guard) to
// count as its continuation. The wrapper and the guard call sites below share
// this exact predicate so they're exact complements — a click can never fall in
// the gap where the wrapper opens the editor but the guard fails to suppress
// the stray node (or vice versa).
const ADD_WINDOW_MS = 500;
const ADD_WINDOW_PX = 40;

/**
 * Double-click detection via CLICK events, NOT the browser's `dblclick`.
 *
 * Two features need a correlated pair of clicks:
 *  - view-mode double-click-to-enter: the first click selects a node, which
 *    remounts it, so the real second click of a double-click usually lands on
 *    the pane it fell through to — correlate the two clicks rather than trust
 *    the browser's node `dblclick` (which then fires on the pane, not the node).
 *  - edit-mode double-click-to-add-label on a sole-relation edge: the first
 *    click remounts the edges layer, so `dblclick` never lands on the edge.
 *
 * A click on the SAME target within the window completes the gesture on the
 * target (`consumeNodeDrill`/`consumeEdgeAdd`); a click on the pane it fell
 * through to is matched by the guards (`takePaneNodeDrill`/`takePaneEdgeAdd`).
 * The window predicate is shared by the target wrapper and the pane guard so
 * they are exact complements — a click can never fall in the gap where the
 * wrapper opens the editor but the guard fails to suppress the stray node (or
 * vice versa). Clears break the correlation: clicking a node breaks a pending
 * edge-add, clicking an edge breaks a pending node drill, and a pane deselect
 * breaks both.
 */
export function useClickCorrelation() {
  // View-mode double-click-to-enter is detected from click events (see the
  // header comment): the first click selects a node, which remounts it, so the
  // real second click of a double-click usually lands on the pane it fell
  // through to — correlate the two clicks rather than trust the browser's node
  // `dblclick` (which then fires on the pane, not the node).
  const lastNodeClickRef = useRef<CorrelatedClick | null>(null);
  // Edit-mode double-click-to-add-label is detected from click events (see the
  // header comment): the first click of the gesture is recorded here; the
  // second click — on the edge or on the pane it fell through to — is matched
  // against it, and then threaded into that edge so its renderer opens the
  // new-label editor.
  const lastEdgeClickRef = useRef<CorrelatedClick | null>(null);

  const withinAddWindow = (last: CorrelatedClick, e: CorrelationEvent): boolean =>
    last !== null &&
    Date.now() - last.at < ADD_WINDOW_MS &&
    Math.hypot(e.clientX - last.clientX, e.clientY - last.clientY) < ADD_WINDOW_PX;

  const record = (ref: typeof lastNodeClickRef, id: string, e: CorrelationEvent): void => {
    ref.current = { id, clientX: e.clientX, clientY: e.clientY, at: Date.now() };
  };

  return {
    // -- node double-click-to-enter protocol (view mode) ----------------------
    /** record this click as a possible first click of a double-click-to-enter */
    recordNodeClick: (id: string, e: CorrelationEvent): void => record(lastNodeClickRef, id, e),
    /** a node click that must not start a drill (bypass paths, edit mode) */
    clearNodeClick: (): void => {
      lastNodeClickRef.current = null;
    },
    /** a second click on the SAME node within the window completes the drill;
     * consuming also clears the record so a third click can't re-trigger */
    consumeNodeDrill: (id: string, e: CorrelationEvent, detail: number): boolean => {
      const last = lastNodeClickRef.current;
      if (last !== null && last.id === id && detail >= 2 && withinAddWindow(last, e)) {
        lastNodeClickRef.current = null;
        return true;
      }
      return false;
    },
    /** the pane a node click fell through to: a pending record within the
     * window (and a real detail>=2) completes the drill → returns the node */
    takePaneNodeDrill: (e: CorrelationEvent, detail: number): string | null => {
      const last = lastNodeClickRef.current;
      if (last !== null && detail >= 2 && withinAddWindow(last, e)) {
        lastNodeClickRef.current = null;
        return last.id;
      }
      return null;
    },

    // -- edge double-click-to-add-label protocol (edit mode) ------------------
    /** record this click as a possible first click of a double-click-to-add */
    recordEdgeClick: (id: string, e: CorrelationEvent): void => record(lastEdgeClickRef, id, e),
    /** an edge click that must not start an add (view mode / not a sole edge) */
    clearEdgeClick: (): void => {
      lastEdgeClickRef.current = null;
    },
    /** a second click on the SAME sole edge within the window completes the
     * add-label gesture; consuming clears the record */
    consumeEdgeAdd: (id: string, e: CorrelationEvent): boolean => {
      const last = lastEdgeClickRef.current;
      if (last !== null && last.id === id && withinAddWindow(last, e)) {
        lastEdgeClickRef.current = null;
        return true;
      }
      return false;
    },
    /** the pane an edge click fell through to: a pending record within the
     * window completes the add-label gesture → returns the edge id */
    takePaneEdgeAdd: (e: CorrelationEvent): string | null => {
      const last = lastEdgeClickRef.current;
      if (last !== null && withinAddWindow(last, e)) {
        lastEdgeClickRef.current = null;
        return last.id;
      }
      return null;
    },

    /** a pane deselect breaks both pending correlations */
    clearAll: (): void => {
      lastNodeClickRef.current = null;
      lastEdgeClickRef.current = null;
    },
  };
}

export type ClickCorrelation = ReturnType<typeof useClickCorrelation>;