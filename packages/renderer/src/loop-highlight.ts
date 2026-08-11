import { createContext } from 'react';

/** Highlight state for one clicked feedback-loop badge: which nodes and view-edges
 * belong to the active loop, so DiagramNode/DiagramEdge can glow their members and
 * dim the rest. Empty/inactive by default. */
export interface LoopHighlight {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  active: boolean;
  /** 'loop' = members glow + rest strong-dim (loop badges / leverage); 'focus'
   *  = members stay normal + rest light-dim (node-selection neighborhood focus) */
  variant: 'loop' | 'focus';
  /** key of the active loop's badge, for its own active styling */
  activeKey: string | null;
  /** click a badge: highlight its loop, or clear if it is already active */
  toggle: (key: string, nodes: readonly string[], edges: readonly string[]) => void;
  clear: () => void;
}

export const EMPTY_ID_SET: ReadonlySet<string> = new Set();

export const noopLoopHighlight: LoopHighlight = {
  nodes: EMPTY_ID_SET,
  edges: EMPTY_ID_SET,
  active: false,
  variant: 'loop',
  activeKey: null,
  toggle: () => undefined,
  clear: () => undefined,
};

export const LoopHighlightContext = createContext<LoopHighlight>(noopLoopHighlight);
