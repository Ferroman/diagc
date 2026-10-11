import { useCallback, useState } from 'react';
import type { DiagramSelection, LeverageFocus, LoopEdgeInput } from '@diagc/renderer';

export interface UseCausalLoopAnalysisOptions {
  editing: boolean;
  /** the notation on screen analyses loops (its profile's `loopAnalysis`):
   * only there does a ctrl-click compare */
  loopAnalysis: boolean;
  selection: DiagramSelection | null;
  /** the canvas multi-selection, which is what glows while editing */
  groupSel: string[];
}

export interface CausalLoopAnalysis {
  /** the ctrl-clicked second variable compared with the selected one */
  compareId: string | null;
  clearCompare: () => void;
  /** the compiled signed graph DiagramView reports */
  cldEdges: LoopEdgeInput[];
  handleCldEdges: (edges: LoopEdgeInput[]) => void;
  /** the leverage report row driving the canvas highlight */
  leverageFocus: LeverageFocus | null;
  focusLeverage: (focus: LeverageFocus | null) => void;
  /** a selection moved: drop the row highlight and the comparison */
  dropFocus: () => void;
  /** the canvas's ctrl-click on a second node */
  compareSelect: (id: string) => void;
  /** what the canvas highlights from outside: the multi-selection while
   * editing, otherwise the focused report row or the compared pair */
  externalHighlight: { nodes: readonly string[]; edges: readonly string[] } | null;
}

/**
 * The causal-loop leverage analysis beside the canvas: the signed graph the view
 * compiles, the report row the user is looking at, and a second variable to
 * compare the selected one with.
 */
export function useCausalLoopAnalysis({
  editing,
  loopAnalysis,
  selection,
  groupSel,
}: UseCausalLoopAnalysisOptions): CausalLoopAnalysis {
  // CLD dependency: the ctrl-clicked second variable to compare with the
  // selected one (null = no comparison active).
  const [compareId, setCompareId] = useState<string | null>(null);
  // CLD leverage analysis: the compiled signed graph surfaced by DiagramView,
  // and the report row currently driving the canvas highlight.
  const [cldEdges, setCldEdges] = useState<LoopEdgeInput[]>([]);
  const handleCldEdges = useCallback((edges: LoopEdgeInput[]) => setCldEdges(edges), []);
  const [leverageFocus, setLeverageFocus] = useState<LeverageFocus | null>(null);

  // ctrl-click a second node where the notation analyses loops (a causal loop)
  // → compare it with the currently-selected variable. Toggle off if it's the
  // same one; ignore self or clicks outside a single-node selection.
  const compareSelect = (id: string) => {
    if (editing || !loopAnalysis || selection?.kind !== 'node' || id === selection.id) return;
    setLeverageFocus(null);
    setCompareId((cur) => (cur === id ? null : id));
  };

  return {
    compareId,
    clearCompare: () => setCompareId(null),
    cldEdges,
    handleCldEdges,
    leverageFocus,
    focusLeverage: setLeverageFocus,
    dropFocus: () => {
      setLeverageFocus(null);
      setCompareId(null);
    },
    compareSelect,
    externalHighlight: editing
      ? groupSel.length >= 2
        ? { nodes: groupSel, edges: [] }
        : null
      : (leverageFocus ??
        (compareId !== null && selection?.kind === 'node' ? { nodes: [selection.id, compareId], edges: [] } : null)),
  };
}
