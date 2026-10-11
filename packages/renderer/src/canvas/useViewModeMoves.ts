import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { layoutPlaneKey, type EdgeLabelPlacement, type EdgeLabelSide, type Point } from '@diagc/core/internal';
import type { EdgeLabelMoves } from './build-data';
import type { DiagramViewProps } from './view-types';

export interface ViewModeMovesInput {
  props: Pick<
    DiagramViewProps,
    'model' | 'plane' | 'layout' | 'ignoreSavedPositions' | 'onViewPositionsChange' | 'onViewLabelMovesChange'
  >;
  editing: boolean;
}

export interface ViewModeMoves {
  /** Alt is held: view mode drags nodes */
  altHeld: boolean;
  viewPositions: Record<string, Point>;
  setViewPositions: Dispatch<SetStateAction<Record<string, Point>>>;
  /** the label placements drawn: the saved ones, with this session's moves on top in view mode */
  labelMoves: EdgeLabelMoves | undefined;
  moveViewLabel: (relationId: string, labelId: string, t: number, side: EdgeLabelSide) => void;
}

/**
 * The moves view mode keeps for the session only: boxes dragged with Alt held
 * and edge labels slid the same way. Each set resets on a plane switch, a new
 * model or an edit-mode toggle, and is offered to the host after its reset.
 */
export function useViewModeMoves(input: ViewModeMovesInput): ViewModeMoves {
  const { props, editing } = input;
  const { model, plane } = props;
  // Alt-held enables ephemeral node dragging in view mode. A blur listener
  // releases a stuck Alt (e.g. after Alt+Tab).
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    const clear = () => setAltHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // Ephemeral view-mode drag positions for the active plane; cleared on a plane
  // switch, model reload, or edit-mode toggle (edit persists positions via the
  // saved overlay, so a returning view must start from that, not a stale drag).
  const [viewPositions, setViewPositions] = useState<Record<string, Point>>({});
  useEffect(() => {
    setViewPositions({});
  }, [model, plane, editing]);
  // Edge labels slid in view mode (Alt+drag a label): the same throwaway class
  // of state as the box drags above, reset by the same events and offered to
  // the host the same way (relation id → label id → placement).
  const [viewLabelMoves, setViewLabelMoves] = useState<EdgeLabelMoves>({});
  useEffect(() => {
    setViewLabelMoves({});
  }, [model, plane, editing]);
  const { onViewLabelMovesChange } = props;
  useEffect(() => {
    onViewLabelMovesChange?.(viewLabelMoves);
  }, [viewLabelMoves, onViewLabelMovesChange]);
  const moveViewLabel = useCallback(
    (relationId: string, labelId: string, t: number, side: EdgeLabelSide) =>
      setViewLabelMoves((m) => ({
        ...m,
        [relationId]: { ...m[relationId], [labelId]: side === 'center' ? { t } : { t, side } },
      })),
    [],
  );
  // What is drawn: the saved placements for this plane (a viewer may set those
  // aside together with the saved positions), with this session's moves on top.
  // Editing reads only the saved ones — there a label drag edits the document.
  const labelMoves = useMemo((): EdgeLabelMoves | undefined => {
    const saved =
      !editing && props.ignoreSavedPositions === true
        ? undefined
        : props.layout?.edgeLabels?.[layoutPlaneKey(model, plane)];
    if (editing || Object.keys(viewLabelMoves).length === 0) return saved;
    const merged: Record<string, Record<string, EdgeLabelPlacement>> = { ...saved };
    for (const [relationId, labels] of Object.entries(viewLabelMoves))
      merged[relationId] = { ...merged[relationId], ...labels };
    return merged;
  }, [editing, props.ignoreSavedPositions, props.layout, model, plane, viewLabelMoves]);

  // Surface them upward so a host can offer to persist them. Driven off the state
  // rather than the drag handler, so the resets above are reported too — a host
  // that kept showing a "save" affordance after a plane switch would be offering
  // to write positions the viewer can no longer see.
  const { onViewPositionsChange } = props;
  useEffect(() => {
    onViewPositionsChange?.(viewPositions);
  }, [viewPositions, onViewPositionsChange]);

  return { altHeld, viewPositions, setViewPositions, labelMoves, moveViewLabel };
}
