import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { layoutPlaneKey, type Stroke } from '@diagc/core/internal';
import type { DiagramViewProps } from '../canvas/view-types';

export interface DrawingsState {
  /** the active plane's strokes */
  strokes: readonly Stroke[];
  /** `strokes`, kept current every render for the layout API's content bounds */
  strokesRef: MutableRefObject<readonly Stroke[]>;
  drawingsVisible: boolean;
  setDrawingsVisible: Dispatch<SetStateAction<boolean>>;
}

/** The ink on the active plane, and the viewer's switch that hides it. */
export function useDrawings(props: Pick<DiagramViewProps, 'drawings' | 'model' | 'plane'>): DrawingsState {
  // The active plane's strokes. Keyed like layout.planes, so a borrowing plane
  // shares its donor's bucket exactly as it shares positions.
  const strokes = useMemo(
    () => props.drawings?.planes[layoutPlaneKey(props.model, props.plane)] ?? [],
    [props.drawings, props.model, props.plane],
  );
  // Render-phase ref (same pattern as useDrillNavigation's enteredPathRef): useLayoutApi's
  // effect keeps deps of just [layoutApiRef, reactFlow], so it reads the ink
  // through a ref rather than re-installing the api object on every stroke.
  const strokesRef = useRef<readonly Stroke[]>([]);
  strokesRef.current = strokes;
  // Tracing-paper switch: viewer state, on by default (an author drew it to be
  // seen), reset per diagram like pins. Never saved.
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  useEffect(() => {
    setDrawingsVisible(true);
  }, [props.model.id]);
  return { strokes, strokesRef, drawingsVisible, setDrawingsVisible };
}
