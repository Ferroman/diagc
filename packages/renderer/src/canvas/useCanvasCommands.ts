import { useEffect, type MutableRefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { toggleOf, type CanvasToggle } from './canvas-toggles';
import type { NudgeAndArrange } from './useNudgeAndArrange';
import type { CanvasCommands, LayoutApi } from './view-types';

export interface CanvasCommandsInput {
  canvasCommandsRef: MutableRefObject<CanvasCommands | null> | undefined;
  layoutApiRef: MutableRefObject<LayoutApi | null> | undefined;
  reactFlow: ReactFlowInstance;
  toggles: readonly CanvasToggle[];
  arrange: Pick<NudgeAndArrange, 'canArrange' | 'selectedIds' | 'alignSelection' | 'distributeSelection'>;
}

/** a toggle's command: false, and nothing pressed, when the toggle is not offered */
const pressOf = (toggle: CanvasToggle) => () => {
  if (!toggle.offered) return false;
  toggle.flip();
  return true;
};

/**
 * The host's keyboard (see DiagramViewProps.canvasCommandsRef). Rebuilt and
 * re-assigned on every commit rather than read through refs like the layout
 * api: every entry closes over this render's state (is there a legend? how
 * many boxes are selected?), and an assignment per render is cheaper than
 * mirroring ten values into refs to keep one object stable. Also handed back,
 * for the canvas's own built-in keys (useFitKey).
 */
export function useCanvasCommands(input: CanvasCommandsInput): CanvasCommands {
  const { reactFlow, toggles } = input;
  const { canArrange, selectedIds, alignSelection, distributeSelection } = input.arrange;
  const canvasCommands: CanvasCommands = {
    toggleLaser: pressOf(toggleOf(toggles, 'laser')),
    toggleDim: pressOf(toggleOf(toggles, 'dim')),
    toggleLegend: pressOf(toggleOf(toggles, 'legend')),
    toggleDrawings: pressOf(toggleOf(toggles, 'drawings')),
    toggleLoops: pressOf(toggleOf(toggles, 'loops')),
    zoomIn: () => {
      void reactFlow.zoomIn();
      return true;
    },
    zoomOut: () => {
      void reactFlow.zoomOut();
      return true;
    },
    fitView: () => {
      const api = input.layoutApiRef?.current;
      if (api !== undefined && api !== null) api.fitView();
      else void reactFlow.fitView();
      return true;
    },
    // The counts are SelectionToolbar's own: it shows itself from two boxes and
    // enables Distribute from three.
    align: (mode) => {
      if (!canArrange || selectedIds.length < 2) return false;
      alignSelection(mode);
      return true;
    },
    distribute: (axis) => {
      if (!canArrange || selectedIds.length < 3) return false;
      distributeSelection(axis);
      return true;
    },
  };
  useEffect(() => {
    const ref = input.canvasCommandsRef;
    if (ref === undefined) return;
    ref.current = canvasCommands;
    return () => {
      ref.current = null;
    };
  });
  return canvasCommands;
}
